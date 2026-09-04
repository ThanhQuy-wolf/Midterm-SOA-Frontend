import { isAxiosError } from "axios";
import { apiClient } from "./client";
import { getUserInfo } from "./auth";
import type { AvailableBalance, TuitionLookupResult } from "../types/domain";

// Response thật của tuition-service.
interface TuitionApi {
  id: string;
  mssv: string;
  studentName: string;
  semester: string;
  amount: number;
  paid: boolean;
}

function toLookupResult(t: TuitionApi, status: TuitionLookupResult["tuitionStatus"]): TuitionLookupResult {
  return {
    studentId: t.mssv,
    studentName: t.studentName,
    tuitionAmount: t.amount,
    tuitionStatus: status,
  };
}

// SCR-02: tra cứu MSSV tự động (debounce ở phía gọi hook).
// GET /api/tuition/{mssv} trả về khoản CHƯA đóng đến hạn sớm nhất, hoặc 404 nếu không còn khoản nào.
// 404 có thể là "MSSV không tồn tại" HOẶC "đã đóng hết" — phân biệt bằng /{mssv}/all.
export async function lookupTuitionByStudentId(studentId: string): Promise<TuitionLookupResult> {
  try {
    const { data } = await apiClient.get<TuitionApi>(`/tuition/${encodeURIComponent(studentId)}`);
    return toLookupResult(data, data.paid ? "PAID" : "UNPAID");
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      const { data: all } = await apiClient.get<TuitionApi[]>(
        `/tuition/${encodeURIComponent(studentId)}/all`,
      );
      if (!all || all.length === 0) {
        throw error; // thật sự không tìm thấy MSSV
      }
      // Có bản ghi nhưng không có khoản chưa đóng => đã thanh toán hết.
      const latest = all[all.length - 1];
      return toLookupResult(latest, "PAID");
    }
    throw error;
  }
}

// SCR-02: số dư khả dụng. Backend chưa tách riêng phần "đang giữ tạm" nên trả về số dư hiện tại
// của user (GET /api/auth/users/{userId}).
export async function getAvailableBalance(): Promise<AvailableBalance> {
  const userId = localStorage.getItem("userId");
  if (!userId) {
    throw new Error("Chưa đăng nhập");
  }
  const info = await getUserInfo(userId);
  return { availableBalance: info.balance };
}
