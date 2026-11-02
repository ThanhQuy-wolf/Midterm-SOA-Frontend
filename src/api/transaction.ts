import {
  apiClient,
  getApiErrorCode,
  getApiErrorRemainingAttempts,
  getApiErrorRetryAfterSeconds,
  getApiErrorStatus,
} from "./client";
import { maskEmail } from "../utils/format";
import type { ApiErrorCode, Payer, Transaction, TransactionFailureReason } from "../types/domain";

const OTP_TTL_MS = 5 * 60 * 1000;
// Cố tình không có MAX_OTP_ATTEMPTS ở đây: giới hạn số lần thử là luật chống
// brute-force của backend. FE chỉ hiển thị lại remainingAttempts trong mỗi 409.

interface InitiateApiResponse {
  transactionId: string;
  tuitionId: string;
  semester: string;
  amount: number;
  balance: number;
  // Hạn thật của OTP. Gọi lại initiate khi OTP cũ còn hạn sẽ nhận lại đúng giao dịch
  // cũ với hạn cũ, nên không được tự cộng 5 phút từ lúc nhận response.
  otpExpiresAt?: string;
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

// SCR-02 -> SCR-03. Backend không trả tên sinh viên nên phần còn lại của Transaction dựng
// tại đây: studentName lấy từ kết quả tra cứu, hạn OTP lấy từ otpExpiresAt (dự phòng 5 phút
// nếu thiếu). attemptsLeft để trống cho tới lần nhập sai đầu tiên.
// Ném 429 kèm retryAfterSeconds khi vượt hạn mức gửi OTP theo giờ.
export async function initiateTransaction(input: {
  studentId: string;
  studentName: string;
  /** Khoản học phí FE đang hiển thị, để đối chiếu với khoản backend thật sự thu. */
  expectedTuitionId: string;
}): Promise<Transaction> {
  // Gửi kèm tuitionId đang hiển thị: backend tự chọn khoản đến hạn sớm nhất theo MSSV,
  // nếu khoản đó đã đổi thì từ chối (TUITION_CHANGED) trước khi tạo giao dịch, không
  // gửi OTP và không tốn lượt — người dùng không phải nhập OTP cho khoản họ chưa thấy.
  let data: InitiateApiResponse;
  try {
    ({ data } = await apiClient.post<InitiateApiResponse>("/payments/initiate", {
      mssv: input.studentId,
      tuitionId: input.expectedTuitionId,
    }));
  } catch (error) {
    if (getApiErrorCode(error) === "TUITION_CHANGED") {
      throw new TuitionChangedError();
    }
    throw error;
  }
  // Lưới dự phòng nếu backend chưa hỗ trợ tham số tuitionId.
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
    otpExpiresAt: data.otpExpiresAt ?? new Date(now + OTP_TTL_MS).toISOString(),
  };
}

// Mã lỗi backend -> lý do thất bại hiển thị ở SCR-04. Mọi mã trong bảng này đều nghĩa
// là giao dịch đã chốt FAILED phía backend (saga đã hoàn tiền nếu từng trừ), nên không
// cho nhập OTP tiếp. Riêng sai OTP (OTP_INVALID) đi qua remainingAttempts ở dưới.
const FAILURE_BY_CODE: Partial<Record<ApiErrorCode, TransactionFailureReason>> = {
  TUITION_ALREADY_PAID: "TUITION_ALREADY_PAID",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  OTP_ATTEMPT_LIMIT: "OTP_LOCKED",
  TRANSACTION_FAILED: "SYSTEM_ERROR",
  PAYMENT_FAILED: "SYSTEM_ERROR",
  TRANSACTION_NOT_FOUND: "SYSTEM_ERROR",
  TRANSACTION_FORBIDDEN: "SYSTEM_ERROR",
};

// SCR-03: xác thực OTP. Trạng thái được suy ra từ kết quả gọi API:
//  - thành công         -> COMPLETED
//  - 429                -> FAILED (OTP_LOCKED) + retryAfterSeconds; giao dịch chết hẳn
//  - 409 + remainingAttempts -> OTP_SENT, attemptsLeft = con số backend trả về
//  - lỗi có code         -> FAILED với lý do theo FAILURE_BY_CODE
// Hết hạn OTP không có mã riêng (backend cố ý gộp với "sai OTP" để không lộ thông tin);
// đồng hồ đếm ngược phía client bắt ca này.
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

    const code = getApiErrorCode(error);
    const failureReason = code ? FAILURE_BY_CODE[code] : undefined;
    if (failureReason) {
      return { ...transaction, status: "FAILED", failureReason, attemptsLeft: 0 };
    }
    // Không có mã nhận dạng được: 403/404/409 vẫn là giao dịch không dùng tiếp được.
    if (status === 403 || status === 404 || status === 409) {
      return { ...transaction, status: "FAILED", failureReason: "SYSTEM_ERROR", attemptsLeft: 0 };
    }

    // Còn lại là 400 (OTP sai định dạng): giữ nguyên để người dùng nhập lại.
    return { ...transaction, status: "OTP_SENT" };
  }
}
