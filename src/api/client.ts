import axios, { isAxiosError } from "axios";

// Mọi request đi qua API Gateway ở cổng 8080 (không gọi thẳng auth/tuition/payment service).
// Xem docs/API-FRONTEND.md.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api",
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Không có refresh token — token hết hạn/sai/thiếu đều là 401, buộc đăng nhập lại.
    // Bỏ qua 401 của chính request /auth/login (đó là "sai mật khẩu", không phải hết phiên).
    const url = error.config?.url ?? "";
    if (error.response?.status === 401 && !url.includes("/auth/login")) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("userId");
      localStorage.removeItem("payer");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

// Rút thông điệp lỗi nghiệp vụ từ response. Backend trả { message } hoặc { error }
// (riêng login), hoặc map theo field cho validate ở payment.
export function getApiErrorMessage(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const data = error.response?.data as
    | { message?: string; error?: string; [field: string]: unknown }
    | undefined;
  if (!data) return undefined;
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  const firstFieldError = Object.values(data).find((v) => typeof v === "string");
  return typeof firstFieldError === "string" ? firstFieldError : undefined;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}
