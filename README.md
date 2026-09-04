# iBanking — Đóng học phí (Frontend)

Frontend cho phân hệ **đóng học phí** của một hệ thống iBanking demo (đồ án giữa kỳ môn SOA). React 19 + TypeScript + Vite, gọi thẳng vào một **API Gateway** đứng trước 3 microservice backend (auth, tuition, payment) qua REST/JSON.

Tài liệu này dành cho người (giảng viên, đồng đội) hoặc AI agent muốn nắm nhanh bối cảnh trước khi đọc code.

## Bắt đầu nhanh

```bash
npm install
cp .env.example .env   # chỉnh VITE_API_BASE_URL nếu gateway không chạy ở localhost:8080
npm run dev             # http://localhost:5173
```

Backend (auth :8081 / tuition :8082 / payment :8083, đứng sau gateway :8080) **không nằm trong repo này** — cần chạy riêng, xem `docs/API-FRONTEND.md` để biết tài khoản demo có sẵn.

```bash
npm run build     # tsc -b && vite build
npm run lint       # oxlint
npm run preview
```

## Tài liệu nên đọc trước

| File | Nội dung |
|---|---|
| `frontend-business-spec.md` | Đặc tả nghiệp vụ gốc: 5 màn hình (SCR-01..05), state machine giao dịch, các quyết định nghiệp vụ đã chốt (không resume OTP, tối đa 5 lần sai, cơ chế giữ tạm số dư...). **Đọc file này trước khi sửa logic nghiệp vụ.** |
| `docs/API-FRONTEND.md` | Đặc tả REST API thật của backend (base URL, từng endpoint, request/response mẫu, mã lỗi, tài khoản demo). **Đọc file này trước khi sửa bất kỳ file nào trong `src/api/`.** |

Có sự khác biệt giữa `frontend-business-spec.md` (đặc tả lý tưởng ban đầu) và `docs/API-FRONTEND.md` (những gì backend thật sự cung cấp) — xem mục "Khoảng cách với đặc tả gốc" bên dưới.

## Luồng nghiệp vụ

```
SCR-01 Đăng nhập
   └─▶ SCR-02 Thanh toán học phí (tra MSSV, kiểm tra số dư)
          └─▶ (xác nhận giao dịch) ─▶ SCR-03 Xác thực OTP
                                           └─▶ SCR-04 Kết quả giao dịch
                                                  └─▶ SCR-02 hoặc SCR-05 Lịch sử giao dịch
```

State machine của một giao dịch (chi tiết: `frontend-business-spec.md`):

```
INITIATED → OTP_SENT → OTP_VERIFIED → COMPLETED
                 ├──▶ EXPIRED     (hết 5 phút OTP, hoặc rời màn hình SCR-03)
                 ├──▶ FAILED      (sai OTP đủ 5 lần, hoặc học phí đã bị đóng bởi giao dịch khác)
                 └──▶ CANCELLED   (người dùng bấm "Hủy giao dịch")
```

## Kiến trúc thư mục

```
src/
  api/            1 file / 1 service backend — nơi DUY NHẤT gọi HTTP
    client.ts       axios instance dùng chung: baseURL, gắn Bearer token, bắt 401 → logout
    auth.ts          POST /auth/login, GET /auth/users/{userId}
    tuition.ts       GET /tuition/{mssv} (+ fallback /all), số dư khả dụng
    transaction.ts   POST /payments/initiate, POST /payments/verify-otp
    history.ts       GET /payments/history
  context/AuthContext.tsx   session (accessToken/userId/payer) — nguồn duy nhất của "đã đăng nhập"
  routes/ProtectedRoute.tsx  chặn route khi chưa đăng nhập
  pages/            1 file / 1 màn hình SCR-0x, dùng React Query cho mọi gọi API
  components/       Layout (header + nav + số dư), icon set dùng chung
  hooks/            useDebouncedValue — debounce tra cứu MSSV ở SCR-02
  types/domain.ts    types nghiệp vụ dùng xuyên suốt FE (Payer, Transaction, TuitionLookupResult...)
  utils/format.ts    format tiền VND, ngày giờ, che email
```

Quy ước: **mọi lời gọi HTTP đều đi qua `src/api/*.ts`**, không gọi `axios`/`fetch` trực tiếp từ component. Component chỉ dùng React Query (`useQuery`/`useMutation`) bọc quanh các hàm trong `src/api/`.

## Khoảng cách với đặc tả gốc (đọc trước khi "sửa cho đúng spec")

Backend thật (`docs/API-FRONTEND.md`) đơn giản hơn `frontend-business-spec.md` ở vài điểm — đây là **quyết định có chủ đích**, không phải bug:

- Không có API refresh token / logout / đăng ký tài khoản mới.
- `POST /api/payments/verify-otp` không trả về `attemptsLeft` hay hạn OTP → FE tự đếm ở client (`src/api/transaction.ts`).
- Không có nút "Gửi lại OTP" (backend không có endpoint resend).
- "Hủy giao dịch" / rời màn hình OTP: không có API hủy — FE chỉ điều hướng đi, backend tự giải phóng số dư giữ tạm theo TTL 5 phút.
- `GET /api/payments/history` chỉ có 4 trạng thái (`PENDING/PROCESSING/SUCCESS/FAILED`), thô hơn state machine phía OTP flow (`EXPIRED`/`CANCELLED` gộp vào `FAILED`) — xem `PaymentHistoryStatus` trong `types/domain.ts`.
- Lịch sử giao dịch không hiển thị MSSV (backend chỉ trả `tuitionId` dạng UUID trong lịch sử, không tra ngược ra MSSV để tránh gọi API theo từng dòng).

Khi backend bổ sung endpoint mới, sửa trực tiếp trong `src/api/`, cập nhật `docs/API-FRONTEND.md` cùng lúc — đừng chồng thêm lớp giả lập ở FE.

## Stack

React 19 · TypeScript · Vite · React Router 7 · TanStack Query 5 (toàn bộ state server-side) · Axios · Tailwind (một phần) — không dùng Redux/Zustand, state client-side chỉ có `AuthContext` (session) và local component state.
