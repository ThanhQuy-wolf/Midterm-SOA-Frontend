import { apiClient, getApiErrorMessage, getApiErrorStatus } from "./client";
import { maskEmail } from "../utils/format";
import type { Payer, Transaction, TransactionFailureReason } from "../types/domain";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

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
// (studentName lấy từ kết quả tra cứu, hạn OTP = now + 5 phút, số lần thử = 5).
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
    attemptsLeft: MAX_OTP_ATTEMPTS,
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

  // Hết lượt thử: backend trả riêng 429 cho ca này nên mã HTTP đủ tin cậy.
  if (status === 429 || /quá nhiều lần|quá số lần|too many|maximum/.test(message)) {
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

// SCR-03: xác thực OTP. Backend trả chuỗi "Payment successful" khi thành công, hoặc 400 khi lỗi.
// FE giữ nguyên state machine cũ bằng cách suy diễn trạng thái từ kết quả:
//  - thành công        -> COMPLETED
//  - OTP hết hạn        -> EXPIRED (OTP_EXPIRED)
//  - hết số lần thử     -> FAILED (OTP_LOCKED)
//  - học phí đã đóng    -> FAILED (TUITION_ALREADY_PAID)
//  - OTP sai (còn lượt) -> OTP_SENT, attemptsLeft giảm 1 (đếm phía client vì backend không trả về)
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

    const attemptsLeft = Math.max((transaction.attemptsLeft ?? MAX_OTP_ATTEMPTS) - 1, 0);
    if (attemptsLeft <= 0) {
      return { ...transaction, status: "FAILED", failureReason: "OTP_LOCKED", attemptsLeft: 0 };
    }
    return { ...transaction, status: "OTP_SENT", attemptsLeft };
  }
}
