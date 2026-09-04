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
  // /auth/login không trả điện thoại — lấy thêm từ GET /auth/users/{userId} (token chưa kịp
  // lưu vào localStorage nên phải gắn Authorization thủ công cho riêng request này).
  // Không chặn đăng nhập nếu request này lỗi, phone chỉ để hiển thị.
  const phone = await apiClient
    .get<UserInfo>(`/auth/users/${encodeURIComponent(data.userId)}`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    })
    .then((res) => res.data.phone ?? "")
    .catch(() => "");

  return {
    accessToken: data.accessToken,
    userId: data.userId,
    balance: data.balance,
    // Backend chỉ trả về email trong /login — dùng username làm tên hiển thị.
    payer: {
      payerFullName: payload.username,
      payerPhone: phone,
      payerEmail: data.email,
    },
  };
}

export interface UserInfo {
  id: string;
  email: string;
  phone: string | null;
  balance: number;
}

// GET /api/auth/users/{userId} — thông tin + số dư của chính người đang đăng nhập.
export function getUserInfo(userId: string) {
  return apiClient
    .get<UserInfo>(`/auth/users/${encodeURIComponent(userId)}`)
    .then((res) => res.data);
}
