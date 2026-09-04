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

  if (status === 409 || /đã (được )?thanh toán|already paid/.test(message)) {
    return { failureReason: "TUITION_ALREADY_PAID", locked: true, expired: false };
  }
  if (/hết hạn|hết hiệu lực|expired/.test(message)) {
    return { failureReason: "OTP_EXPIRED", locked: false, expired: true };
  }
  if (/quá số lần|khóa|locked|too many|maximum/.test(message)) {
    return { failureReason: "OTP_LOCKED", locked: true, expired: false };
  }
  if (/không tồn tại|not found|không thuộc/.test(message)) {
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
    if (getApiErrorStatus(error) === undefined) {
      throw error; // lỗi mạng — để React Query xử lý
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
