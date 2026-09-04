import { apiClient } from "./client";
import type { TransactionHistoryItem } from "../types/domain";

// SCR-05: GET /api/payments/history — lịch sử giao dịch của người đang đăng nhập,
// backend trả sẵn theo createdAt giảm dần (mới nhất trước).
export function getTransactionHistory(): Promise<TransactionHistoryItem[]> {
  return apiClient.get<TransactionHistoryItem[]>("/payments/history").then((res) => res.data);
}
