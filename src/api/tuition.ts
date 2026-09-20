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

// Chỉ GET /api/tuition/id/{id} mới kèm dueDate — hai endpoint kia không có.
interface TuitionDetailApi extends TuitionApi {
  dueDate: string | null;
}

function getAll(studentId: string): Promise<TuitionApi[]> {
  return apiClient
    .get<TuitionApi[]>(`/tuition/${encodeURIComponent(studentId)}/all`)
    .then((res) => res.data ?? []);
}

// Hạn đóng là thông tin phụ: hỏng thì phiếu thu vẫn lập được, chỉ thiếu một dòng.
async function getDueDate(tuitionId: string): Promise<string | undefined> {
  try {
    const { data } = await apiClient.get<TuitionDetailApi>(`/tuition/id/${tuitionId}`);
    return data.dueDate ?? undefined;
  } catch {
    return undefined;
  }
}

function outstandingOf(all: TuitionApi[]): { outstandingCount: number; outstandingTotal: number } {
  const unpaid = all.filter((t) => !t.paid);
  return {
    outstandingCount: unpaid.length,
    outstandingTotal: unpaid.reduce((sum, t) => sum + t.amount, 0),
  };
}

function toLookupResult(
  t: TuitionApi,
  status: TuitionLookupResult["tuitionStatus"],
  outstanding: { outstandingCount: number; outstandingTotal: number },
  dueDate?: string,
): TuitionLookupResult {
  return {
    tuitionId: t.id,
    studentId: t.mssv,
    studentName: t.studentName,
    semester: t.semester,
    dueDate,
    tuitionAmount: t.amount,
    tuitionStatus: status,
    ...outstanding,
  };
}

// SCR-02: tra cứu MSSV tự động (debounce ở phía gọi hook).
// GET /api/tuition/{mssv} trả về khoản chưa đóng đến hạn sớm nhất, hoặc 404 nếu không còn khoản nào.
// 404 có thể là "MSSV không tồn tại" HOẶC "đã đóng hết" — phân biệt bằng /{mssv}/all.
// /{mssv}/all cũng là nguồn cho phần "còn mấy khoản chưa đóng" hiển thị trên phiếu thu:
// một sinh viên có thể nợ nhiều học kỳ, nhưng backend chỉ cho đóng khoản đến hạn sớm nhất.
export async function lookupTuitionByStudentId(studentId: string): Promise<TuitionLookupResult> {
  try {
    const { data } = await apiClient.get<TuitionApi>(`/tuition/${encodeURIComponent(studentId)}`);
    const all = await getAll(studentId);
    const dueDate = data.paid ? undefined : await getDueDate(data.id);
    return toLookupResult(data, data.paid ? "PAID" : "UNPAID", outstandingOf(all), dueDate);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      const all = await getAll(studentId);
      if (all.length === 0) {
        throw error; // thật sự không tìm thấy MSSV
      }
      // Có bản ghi nhưng không có khoản chưa đóng => đã thanh toán hết.
      const latest = all[all.length - 1];
      return toLookupResult(latest, "PAID", outstandingOf(all));
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
