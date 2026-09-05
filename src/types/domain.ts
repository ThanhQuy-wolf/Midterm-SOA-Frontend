// Domain types theo naming trong frontend-business-spec.md — giữ nguyên tên field
// để khớp với API/DB khi thiết kế các bước sau.

export interface Payer {
  payerFullName: string;
  payerPhone: string;
  payerEmail: string;
}

export type TuitionStatus = "UNPAID" | "PAID";

export interface TuitionLookupResult {
  studentId: string;
  studentName: string;
  tuitionAmount: number;
  tuitionStatus: TuitionStatus;
}

export type TransactionStatus =
  | "INITIATED"
  | "OTP_SENT"
  | "OTP_VERIFIED"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED"
  | "CANCELLED";

export type TransactionFailureReason =
  | "OTP_EXPIRED"
  | "OTP_LOCKED"
  | "TUITION_ALREADY_PAID"
  | "SYSTEM_ERROR"
  | "INSUFFICIENT_BALANCE";

export interface Transaction {
  transactionId: string;
  studentId: string;
  studentName: string;
  amountToPay: number;
  status: TransactionStatus;
  failureReason?: TransactionFailureReason;
  createdAt: string;
  // Chỉ có giá trị khi status === "OTP_SENT".
  maskedEmail?: string;
  otpExpiresAt?: string;
  // Số lần thử OTP còn lại, do backend trả về (remainingAttempts) chứ FE không
  // tự đếm. Chưa xác định cho tới lần nhập sai đầu tiên, nên có thể undefined.
  attemptsLeft?: number;
  // Chỉ có khi bị rate limit (HTTP 429): số giây phải chờ trước khi thử lại.
  retryAfterSeconds?: number;
}

// Response thật của GET /api/payments/history — độc lập với Transaction/TransactionStatus
// (state machine phía FE khi đang thao tác OTP) vì backend chỉ phân biệt 4 trạng thái này.
export type PaymentHistoryStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

export interface TransactionHistoryItem {
  id: string;
  tuitionId: string;
  amount: number;
  status: PaymentHistoryStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableBalance {
  availableBalance: number;
}
