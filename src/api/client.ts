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
    // Không có refresh token nên mọi 401 đều buộc đăng nhập lại. Trừ 401 của chính
    // /auth/login: đó là sai mật khẩu chứ không phải hết phiên.
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

// Hai loại lỗi trong luồng OTP có kèm số liệu (xem docs/API-FRONTEND.md):
//   409 sai OTP -> remainingAttempts
//   429 bị chặn -> retryAfterSeconds, kèm header Retry-After
// Các lỗi khác chỉ có message nên hai hàm dưới trả undefined. Chính việc field có
// mặt hay không mới là tín hiệu phân biệt, đáng tin hơn dò chuỗi tiếng Việt.

export function getApiErrorRemainingAttempts(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  const raw = (error.response?.data as { remainingAttempts?: unknown } | undefined)?.remainingAttempts;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : undefined;
}

export function getApiErrorRetryAfterSeconds(error: unknown): number | undefined {
  if (!isAxiosError(error)) return undefined;
  const raw = (error.response?.data as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  // Dự phòng bằng header. Gateway khai Retry-After trong Access-Control-Expose-Headers
  // nên trình duyệt đọc được; bỏ khai báo đó đi thì chỉ còn field trong body.
  const header = error.response?.headers?.["retry-after"];
  const parsed = typeof header === "string" ? Number.parseInt(header, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}
