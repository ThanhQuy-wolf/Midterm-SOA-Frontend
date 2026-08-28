import { apiClient } from "./client";
import type { Transaction, TransactionHistoryItem } from "../types/domain";

// SCR-02 -> SCR-03: bấm "Xác nhận giao dịch". Backend re-check + tạo reserve tại đây.
export function initiateTransaction(studentId: string) {
  return apiClient.post<Transaction>("/transactions", { studentId }).then((res) => res.data);
}

// SCR-03: xác thực OTP.
export function verifyOtp(transactionId: string, otp: string) {
  return apiClient
    .post<Transaction>(`/transactions/${transactionId}/verify-otp`, { otp })
    .then((res) => res.data);
}

// SCR-03: nút "Gửi lại OTP" — không reset bộ đếm 5 lần sai.
export function resendOtp(transactionId: string) {
  return apiClient.post<Transaction>(`/transactions/${transactionId}/resend-otp`).then((res) => res.data);
}

// SCR-03: nút "Hủy giao dịch" -> giải phóng reserve.
export function cancelTransaction(transactionId: string) {
  return apiClient.post<Transaction>(`/transactions/${transactionId}/cancel`).then((res) => res.data);
}

export function getTransaction(transactionId: string) {
  return apiClient.get<Transaction>(`/transactions/${transactionId}`).then((res) => res.data);
}

// SCR-05: lịch sử giao dịch, mặc định mới nhất trước, không filter.
export function getTransactionHistory() {
  return apiClient.get<TransactionHistoryItem[]>("/transactions/me").then((res) => res.data);
}
