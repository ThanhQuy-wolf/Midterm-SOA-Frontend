import { apiClient } from "./client";
import type { AvailableBalance, TuitionLookupResult } from "../types/domain";

// SCR-02, nhóm 2: tra cứu MSSV tự động (debounce ở phía gọi hook, không phải ở đây).
export function lookupTuitionByStudentId(studentId: string) {
  return apiClient
    .get<TuitionLookupResult>(`/tuitions/${encodeURIComponent(studentId)}`)
    .then((res) => res.data);
}

// SCR-02, nhóm 3: availableBalance đã net trừ phần đang giữ tạm — không tự tính ở FE.
export function getAvailableBalance() {
  return apiClient.get<AvailableBalance>("/accounts/me/available-balance").then((res) => res.data);
}
