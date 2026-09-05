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
// Không có hằng số MAX_OTP_ATTEMPTS ở FE: giới hạn số lần thử là quy tắc bảo mật
// chống brute-force nên backend là nguồn sự thật duy nhất. FE chỉ hiển thị lại
// remainingAttempts mà mỗi response 409 trả về, không tự đếm.

// Response thật của POST /api/payments/initiate.
interface InitiateApiResponse {
  transactionId: string;
  amount: number;
  balance: number;
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

// SCR-02 -> SCR-03: bấm "Xác nhận giao dịch". Backend tạo giao dịch PENDING + gửi OTP về email.
// Backend chỉ trả { transactionId, amount, balance } nên FE tự dựng phần còn lại của Transaction
// (studentName lấy từ kết quả tra cứu, hạn OTP = now + 5 phút). attemptsLeft để trống: response
// initiate không nói số lần thử, và FE không được đoán — con số đầu tiên đến từ lần sai đầu tiên.
// Có thể ném lỗi 429 kèm retryAfterSeconds khi vượt hạn mức gửi OTP theo giờ.
export async function initiateTransaction(input: {
  studentId: string;
  studentName: string;
}): Promise<Transaction> {
  const { data } = await apiClient.post<InitiateApiResponse>("/payments/initiate", {
    mssv: input.studentId,
  });
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

  // payment-service dùng chung InsufficientBalanceException (-> HTTP 409) cho
  // rất nhiều ca khác nhau, nên riêng mã 409 KHÔNG nói lên điều gì. Điểm tựa
  // đúng là: trong các lỗi 409 của verify-otp, "OTP không hợp lệ" là ca DUY
  // NHẤT còn thử lại được — mọi 409 khác đều nghĩa là saga đã hoàn tiền và ghi
  // giao dịch thành FAILED trong DB, không được trừ lượt rồi cho gõ tiếp.

  // 429 và ca "sai OTP" đã được verifyOtp xử lý trước bằng mã HTTP và
  // remainingAttempts; ở đây chỉ còn là lưới dự phòng theo chuỗi.
  if (/quá nhiều lần|quá số lần|too many|maximum/.test(message)) {
    return { failureReason: "OTP_LOCKED", locked: true, expired: false };
  }
  // Giao dịch không tồn tại (404) hoặc không thuộc người đang đăng nhập (403).
  if (status === 404 || status === 403) {
    return { failureReason: "SYSTEM_ERROR", locked: true, expired: false };
  }

  // "OTP không hợp lệ hoặc đã hết hạn" (PaymentService.java:172) = OTP SAI.
  // Backend cố tình gộp sai/hết hạn vào một câu để không lộ thông tin, nên phải
  // khớp cụm này TRƯỚC luật "hết hạn" bên dưới — nếu không chính chữ "hết hạn"
  // trong câu sẽ bị hiểu nhầm thành OTP đã hết hiệu lực. Ca hết hạn thật đã
  // được đồng hồ đếm ngược phía client xử lý.
  if (/otp không hợp lệ|otp không đúng|invalid otp/.test(message)) {
    return { locked: false, expired: false };
  }

  if (/hết hạn|hết hiệu lực|expired/.test(message)) {
    return { failureReason: "OTP_EXPIRED", locked: false, expired: true };
  }
  // Chủ ngữ phải là khoản học phí, và có thể có chữ chen vào giữa:
  //   "Học phí đã được người khác thanh toán" (PaymentService.java:260)
  //   "Khoản học phí này đã được đóng"        (PaymentService.java:59)
  // Ràng buộc "học phí|khoản" ở đầu để không nuốt nhầm "Thanh toán thất bại".
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
    // 5xx là sự cố phía server (vd. 503 "Tài khoản đang được xử lý bởi một giao
    // dịch khác"), không phải người dùng gõ sai. Ném ra để React Query báo lỗi
    // thay vì rơi xuống nhánh mặc định và trừ oan một lượt thử.
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

    // Chỉ ca "sai OTP" mới kèm remainingAttempts (InvalidOtpException -> 409),
    // nên sự có mặt của field này là dấu hiệu tin cậy — không cần dò chuỗi
    // tiếng Việt. Con số lấy nguyên từ backend, FE không tự trừ.
    // Khi về 0, backend đã ghi giao dịch thành FAILED và xoá OTP key, nên lịch
    // sử tự phản ánh đúng — FE không cần nhớ gì thêm.
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
