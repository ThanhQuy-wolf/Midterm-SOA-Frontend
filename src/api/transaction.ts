import {
  apiClient,
  getApiErrorMessage,
  getApiErrorRemainingAttempts,
  getApiErrorRetryAfterSeconds,
  getApiErrorStatus,
} from "./client";
import { maskEmail } from "../utils/format";
import type { Payer, Transaction, TransactionFailureReason } from "../types/domain";

const OTP_TTL_MS = 5 * 60 * 1000;
// Cố tình không có MAX_OTP_ATTEMPTS ở đây: giới hạn số lần thử là luật chống
// brute-force của backend. FE chỉ hiển thị lại remainingAttempts trong mỗi 409.

interface InitiateApiResponse {
  transactionId: string;
  tuitionId: string;
  semester: string;
  amount: number;
  balance: number;
}

// Khoản được ghi nợ khác khoản người dùng vừa xem trên phiếu thu. Xảy ra khi giữa
// lúc tra cứu và lúc bấm xác nhận, khoản đang xem được người khác đóng (hoặc một
// khoản cũ hơn quay lại trạng thái chưa đóng) — payment-service resolve lại theo
// MSSV nên có thể chọn ra khoản khác.
export class TuitionChangedError extends Error {
  constructor() {
    super("Khoản học phí cần đóng vừa thay đổi. Vui lòng kiểm tra lại phiếu thu trước khi xác nhận.");
    this.name = "TuitionChangedError";
  }
}

function storedPayerEmail(): string {
  try {
    const raw = localStorage.getItem("payer");
    const payer = raw ? (JSON.parse(raw) as Payer) : null;
    return payer?.payerEmail ?? "";
  } catch {
    return "";
  }
}

// SCR-02 -> SCR-03. Backend chỉ trả { transactionId, amount, balance } nên phần còn lại
// của Transaction dựng tại đây: studentName lấy từ kết quả tra cứu, hạn OTP là 5 phút kể
// từ bây giờ. attemptsLeft để trống cho tới lần nhập sai đầu tiên.
// Ném 429 kèm retryAfterSeconds khi vượt hạn mức gửi OTP theo giờ.
export async function initiateTransaction(input: {
  studentId: string;
  studentName: string;
  /** Khoản học phí FE đang hiển thị, để đối chiếu với khoản backend thật sự thu. */
  expectedTuitionId: string;
}): Promise<Transaction> {
  const { data } = await apiClient.post<InitiateApiResponse>("/payments/initiate", {
    mssv: input.studentId,
  });
  // POST /payments/initiate chỉ nhận mssv: backend tự chọn lại khoản đến hạn sớm
  // nhất, nên khoản thu được có thể không phải khoản vừa hiển thị. Chặn ngay tại
  // đây thay vì để người dùng nhập OTP cho một khoản họ chưa nhìn thấy. Giao dịch
  // vừa tạo sẽ tự hết hạn sau 5 phút, đổi lại người dùng không bị trừ tiền nhầm khoản.
  if (data.tuitionId !== input.expectedTuitionId) {
    throw new TuitionChangedError();
  }
  const now = Date.now();
  const email = storedPayerEmail();
  return {
    transactionId: data.transactionId,
    studentId: input.studentId,
    studentName: input.studentName,
    amountToPay: data.amount,
    status: "OTP_SENT",
    createdAt: new Date(now).toISOString(),
    maskedEmail: email ? maskEmail(email) : undefined,
    otpExpiresAt: new Date(now + OTP_TTL_MS).toISOString(),
  };
}

function classifyVerifyError(error: unknown): {
  failureReason?: TransactionFailureReason;
  locked: boolean;
  expired: boolean;
} {
  const status = getApiErrorStatus(error);
  const message = (getApiErrorMessage(error) ?? "").toLowerCase();

  // Backend gộp nhiều ca vào cùng InsufficientBalanceException nên mã 409 một mình
  // không đủ để kết luận. Trong các lỗi 409 của verify-otp, chỉ "OTP không hợp lệ"
  // là còn thử lại được; số còn lại đều là saga đã hoàn tiền và ghi giao dịch thành
  // FAILED, cho gõ tiếp là vô nghĩa.

  // Hai ca 429 và sai OTP đã được verifyOtp bắt bằng mã HTTP và remainingAttempts,
  // phần dưới đây chỉ là lưới dự phòng dò theo chuỗi.
  if (/quá nhiều lần|quá số lần|too many|maximum/.test(message)) {
    return { failureReason: "OTP_LOCKED", locked: true, expired: false };
  }
  // Giao dịch không tồn tại (404) hoặc không thuộc người đang đăng nhập (403).
  if (status === 404 || status === 403) {
    return { failureReason: "SYSTEM_ERROR", locked: true, expired: false };
  }

  // Backend cố tình gộp "sai" và "hết hạn" vào một câu để không lộ thông tin, nên
  // luật này phải đứng trước luật "hết hạn" bên dưới — không thì chính chữ "hết hạn"
  // trong câu bị hiểu nhầm. Hết hạn thật thì đồng hồ đếm ngược phía client đã bắt.
  if (/otp không hợp lệ|otp không đúng|invalid otp/.test(message)) {
    return { locked: false, expired: false };
  }

  if (/hết hạn|hết hiệu lực|expired/.test(message)) {
    return { failureReason: "OTP_EXPIRED", locked: false, expired: true };
  }
  // Khớp "Học phí đã được người khác thanh toán" và "Khoản học phí này đã được đóng",
  // vốn có chữ chen vào giữa. Buộc chủ ngữ là học phí để không nuốt nhầm câu
  // "Thanh toán thất bại".
  if (/(học phí|khoản).{0,40}(thanh toán|đóng)|already paid/.test(message)) {
    return { failureReason: "TUITION_ALREADY_PAID", locked: true, expired: false };
  }
  if (/số dư không đủ|insufficient/.test(message)) {
    return { failureReason: "INSUFFICIENT_BALANCE", locked: true, expired: false };
  }
  // Lưới an toàn: 409 nào chưa nhận dạng được cũng là giao dịch đã chết hẳn
  // (lỗi cấu hình, không tìm thấy tài khoản/khoản học phí, saga thất bại…).
  if (status === 409 || /không tồn tại|not found|không thuộc/.test(message)) {
    return { failureReason: "SYSTEM_ERROR", locked: true, expired: false };
  }
  // Mặc định: OTP sai bình thường.
  return { locked: false, expired: false };
}

// SCR-03: xác thực OTP. Trạng thái được suy ra từ kết quả gọi API:
//  - thành công         -> COMPLETED
//  - 429                -> FAILED (OTP_LOCKED) + retryAfterSeconds; giao dịch chết hẳn
//  - 409 + remainingAttempts -> OTP_SENT, attemptsLeft = con số backend trả về
//  - OTP hết hạn         -> EXPIRED (OTP_EXPIRED)
//  - học phí đã đóng     -> FAILED (TUITION_ALREADY_PAID)
export async function verifyOtp(transaction: Transaction, otp: string): Promise<Transaction> {
  try {
    await apiClient.post("/payments/verify-otp", {
      transactionId: transaction.transactionId,
      otp,
    });
    return { ...transaction, status: "COMPLETED", failureReason: undefined };
  } catch (error) {
    const status = getApiErrorStatus(error);
    if (status === undefined) {
      throw error; // lỗi mạng — để React Query xử lý
    }
    // 5xx là sự cố phía server, không phải người dùng gõ sai. Ném ra cho React Query
    // báo lỗi, đừng rơi xuống nhánh mặc định rồi trừ oan một lượt thử.
    if (status >= 500) {
      throw error;
    }

    // 429 = hết lượt thử OTP (theo giao dịch hoặc theo giờ/user). Giao dịch này
    // không verify lại được nữa kể cả khi OTP còn hạn -> phải tạo giao dịch mới.
    if (status === 429) {
      return {
        ...transaction,
        status: "FAILED",
        failureReason: "OTP_LOCKED",
        attemptsLeft: 0,
        retryAfterSeconds: getApiErrorRetryAfterSeconds(error),
      };
    }

    // Chỉ ca sai OTP mới kèm remainingAttempts, nên có field này là đủ tin cậy,
    // khỏi phải dò chuỗi tiếng Việt. Khi nó về 0 thì backend đã ghi giao dịch
    // thành FAILED và xoá OTP, lịch sử tự khớp.
    const remainingAttempts = getApiErrorRemainingAttempts(error);
    if (remainingAttempts !== undefined) {
      return { ...transaction, status: "OTP_SENT", attemptsLeft: remainingAttempts };
    }

    const { failureReason, locked, expired } = classifyVerifyError(error);

    if (expired) {
      return { ...transaction, status: "EXPIRED", failureReason: "OTP_EXPIRED", attemptsLeft: 0 };
    }
    if (locked) {
      return {
        ...transaction,
        status: "FAILED",
        failureReason: failureReason ?? "OTP_LOCKED",
        attemptsLeft: 0,
      };
    }

    // Dự phòng: backend lẽ ra luôn kèm remainingAttempts cho ca sai OTP. Nếu
    // thiếu, giữ nguyên trạng thái và để người dùng thử lại thay vì đoán số lần.
    return { ...transaction, status: "OTP_SENT" };
  }
}
