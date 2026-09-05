import { apiClient } from "./client";
import type { Payer } from "../types/domain";

export interface LoginRequest {
  username: string;
  password: string;
}

// Response thật của POST /api/auth/login (xem docs/API-FRONTEND.md).
interface LoginApiResponse {
  accessToken: string;
  userId: string;
  email: string;
  balance: number;
}

export interface LoginResult {
  accessToken: string;
  userId: string;
  payer: Payer;
  balance: number;
}

export async function login(payload: LoginRequest): Promise<LoginResult> {
  const { data } = await apiClient.post<LoginApiResponse>("/auth/login", payload);
  // /auth/login không trả họ tên lẫn điện thoại — lấy thêm từ GET /auth/users/{userId} (token
  // chưa kịp lưu vào localStorage nên phải gắn Authorization thủ công cho riêng request này).
  // Không chặn đăng nhập nếu request này lỗi, hai field này chỉ để hiển thị.
  const profile = await apiClient
    .get<UserInfo>(`/auth/users/${encodeURIComponent(data.userId)}`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    })
    .then((res) => res.data)
    .catch(() => null);

  return {
    accessToken: data.accessToken,
    userId: data.userId,
    balance: data.balance,
    payer: {
      // Tên thật có trong DB (users.full_name) nhưng auth-service hiện chưa trả nó ra ở
      // /auth/login lẫn /auth/users/{id}. Đọc sẵn fullName để khi backend bổ sung là chạy
      // đúng ngay; trước đó vẫn hiển thị username thay vì để trống.
      payerFullName: profile?.fullName || payload.username,
      payerPhone: profile?.phone ?? "",
      payerEmail: data.email,
    },
  };
}

export interface UserInfo {
  id: string;
  email: string;
  // Optional: auth-service chưa trả field này (xem AuthController.getUserInfo).
  fullName?: string | null;
  phone: string | null;
  balance: number;
}

// GET /api/auth/users/{userId} — thông tin + số dư của chính người đang đăng nhập.
export function getUserInfo(userId: string) {
  return apiClient
    .get<UserInfo>(`/auth/users/${encodeURIComponent(userId)}`)
    .then((res) => res.data);
}
