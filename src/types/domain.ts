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
  attemptsLeft?: number;
}

export interface TransactionHistoryItem {
  transactionId: string;
  createdAt: string;
  studentId: string;
  amountToPay: number;
  status: TransactionStatus;
}

export interface AvailableBalance {
  availableBalance: number;
}
