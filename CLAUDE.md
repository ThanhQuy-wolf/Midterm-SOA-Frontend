# CLAUDE.md — Frontend-midterm

Rule bắt buộc cho AI agent làm việc trong repo này. Ưu tiên cao hơn thói quen mặc định.

## 1. Stack & cấu trúc

- React 19 + TypeScript + Vite 8 + Tailwind CSS 4 (plugin `@tailwindcss/vite`) + TanStack Query v5 + Axios + React Router 7. Lint bằng `oxlint`.
- Đặt file đúng chỗ, không tạo thư mục cấp 1 mới trong `src/`:
  - `src/api/` — gọi HTTP, mỗi service một file (`auth`, `tuition`, `transaction`, `history`)
  - `src/pages/` — một màn hình một file, `*Page.tsx`
  - `src/components/` — UI dùng lại; `src/hooks/` — logic dùng lại
  - `src/context/` — state toàn cục (`AuthContext`); `src/routes/` — guard route
  - `src/types/domain.ts` — toàn bộ type nghiệp vụ; `src/utils/` — hàm thuần
- **Không tự thêm dependency** (UI kit, state manager, form lib, date lib...) khi chưa hỏi. Cần format ngày/tiền thì thêm vào `src/utils/format.ts`.
- Trước khi sửa luồng nghiệp vụ, đọc `docs/API-FRONTEND.md` và `frontend-business-spec.md`.

## 2. Gọi API

- Mọi request đi qua `apiClient` trong [src/api/client.ts](src/api/client.ts). Cấm `fetch`/`axios` trực tiếp trong component, cấm hardcode `http://localhost:8080`.
- Chỉ gọi API Gateway `:8080`, không gọi thẳng auth/tuition/payment service.
- **Không bịa endpoint, field, mã lỗi.** Chỉ dùng những gì có trong `docs/API-FRONTEND.md`; nếu thiếu → hỏi, không đoán.
- Xử lý lỗi qua helper có sẵn: `getApiErrorMessage`, `getApiErrorStatus`, `getApiErrorRemainingAttempts`, `getApiErrorRetryAfterSeconds`. Không dò chuỗi tiếng Việt để phân biệt lỗi.
- 401 đã được interceptor xử lý (xoá token + về `/login`) — đừng viết lại logic đó ở page.
- Token/`userId`/`payer` lưu ở `localStorage`, đọc qua `AuthContext`, không đọc rải rác.

## 3. TypeScript & React

- Cấm `any` và `as any`. Type nghiệp vụ khai trong `src/types/domain.ts`, giữ đúng tên field của backend.
- Union string cho trạng thái (`TransactionStatus`, `TuitionStatus`...), không dùng string tự do.
- Component là function + **named export** (`export function LoginPage()`), không `export default`.
- Fetch/mutate dữ liệu bằng TanStack Query (`useQuery`/`useMutation`), **không** `useEffect + setState` để gọi API.
- Tuân thủ rules-of-hooks; file page > ~150 dòng logic thì tách hook sang `src/hooks/`.
- Không sửa `.env` và không commit secret; biến môi trường phải có tiền tố `VITE_`.

## 4. UI / Tailwind / ngôn ngữ hiển thị

- Chỉ dùng utility class của Tailwind. Không tạo file CSS mới; style chung nằm ở `src/index.css` và `src/styles/nocturne.css`.
- Giữ nguyên design system hiện tại (bảng màu, spacing, bo góc, icon trong `src/components/icons.tsx`). Không đổi theme khi chưa được yêu cầu.
- Mọi text hiển thị cho người dùng viết **tiếng Việt**, có dấu.
- Tiền tệ, ngày giờ, đếm ngược dùng `src/utils/format.ts` (`formatVnd`, `formatDateTime`, `formatDuration`, `maskEmail`) — không tự format lại.

## 5. Quy trình làm việc

- **Verify trước khi báo xong:** chạy `npm run lint` và `npm run build` sau khi sửa code. Fail thì dán nguyên output lỗi và sửa tiếp; **cấm** nói "đã xong" khi chưa chạy hoặc còn lỗi.
- **Git:** chỉ `git commit`/`push` khi được yêu cầu rõ ràng. Không đổi/tạo branch, không `--force`, không `git reset --hard`, không sửa lịch sử.
- **Không tạo file rác:** không tự sinh README, tài liệu tổng kết, file `*-summary.md`, script demo. Ưu tiên sửa file có sẵn; file tạm để trong thư mục scratchpad.
- Giữ đúng phạm vi yêu cầu: không refactor thêm, không đổi kiến trúc, không "dọn dẹp" code ngoài phạm vi.

## 6. Cách trả lời

- Trả lời bằng **tiếng Việt**, ngắn gọn, đi thẳng vấn đề.
- Nêu rõ giả định đã dùng thay vì đoán ngầm; yêu cầu nghiệp vụ mơ hồ (luồng OTP, trạng thái giao dịch, quyền truy cập) thì hỏi lại trước khi code.
- Báo trung thực: test/build fail thì nói fail, bỏ qua bước nào thì nói rõ bước đó.
