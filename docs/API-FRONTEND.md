# API cho Frontend (iBanking Demo)

Base URL (qua API Gateway): `http://localhost:8080`

Frontend gọi **tất cả API qua gateway ở cổng 8080**, không gọi thẳng vào từng service (auth :8081 / tuition :8082 / payment :8083 không mở CORS và không dành cho gọi trực tiếp từ trình duyệt).

CORS đã được bật cho origin `http://localhost:5173`. Nếu frontend chạy ở origin khác, báo lại để cập nhật.

## Xác thực

- Sau khi login thành công, lưu lại `accessToken` và gửi kèm mọi request tiếp theo (trừ `/login`) bằng header:
  ```
  Authorization: Bearer <accessToken>
  ```
- Token hết hạn / sai / thiếu → **401 Unauthorized**.
- Không có API refresh token hay logout — hết hạn thì phải login lại.

## Định dạng lỗi

Lỗi nghiệp vụ của **payment-service** (`/api/payments/**`) trả về `message` kèm `code` ổn định
*(thêm 2026-11-02)*. **Phân biệt các ca lỗi bằng `code`**, không dò câu chữ trong `message`:
```json
{ "message": "Nội dung lỗi bằng tiếng Việt", "code": "TUITION_LOCKED" }
```
Lỗi của auth/tuition service chỉ có `{ "message": "..." }`. Riêng lỗi sai mật khẩu khi login:
```json
{ "error": "Sai mật khẩu!" }
```
Lỗi validate (`400`) ở `POST /api/payments/initiate`/`verify-otp` là map theo tên field, **không** có `code`:
```json
{ "mssv": "MSSV không đúng định dạng (VD: 524H0001)" }
```

| `code` | HTTP | Ý nghĩa |
|---|---|---|
| `TUITION_NOT_FOUND` | 404 | MSSV không tồn tại hoặc không còn khoản chưa đóng |
| `TUITION_ALREADY_PAID` | 409 | Khoản học phí đã được đóng (ở `verify-otp`: bị người khác đóng trước, tiền đã được hoàn) |
| `TUITION_LOCKED` | 409 | Khoản học phí đang được giao dịch khác giữ (chờ OTP hoặc chờ đối soát) |
| `TUITION_CHANGED` | 409 | `tuitionId` gửi lên khác khoản backend sẽ thu |
| `INSUFFICIENT_BALANCE` | 409 | Số dư không đủ |
| `OTP_INVALID` | 409 | OTP sai **hoặc** đã hết hạn (cố ý gộp), kèm `remainingAttempts` |
| `OTP_REQUEST_LIMIT` | 429 | Xin OTP quá 3 lần/giờ, kèm `retryAfterSeconds` + header `Retry-After` |
| `OTP_ATTEMPT_LIMIT` | 429 | Nhập sai quá số lần (theo giao dịch hoặc 8 lần/giờ/user), kèm `retryAfterSeconds`; giao dịch đã FAILED |
| `TRANSACTION_FAILED` | 409 | Giao dịch đã ở trạng thái FAILED, phải tạo giao dịch mới |
| `TRANSACTION_NOT_FOUND` | 404 | Không có giao dịch |
| `TRANSACTION_FORBIDDEN` | 403 | Giao dịch không thuộc người đang đăng nhập |
| `PAYMENT_FAILED` | 409 | Saga thất bại vì lý do khác, đã hoàn tiền nếu từng trừ |
| `SERVICE_BUSY` | 503 | Hệ thống bận / giao dịch đang được xử lý, thử lại sau |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước |

Thời gian (`createdAt`, `updatedAt`, `completedAt`, `paidAt`, `otpExpiresAt`) là ISO-8601 **kèm múi giờ**
*(từ 2026-11-02)*, ví dụ `"2026-11-02T03:09:42.447Z"`. Dùng `new Date(...)` là ra đúng giờ địa phương.

---

## 1. Auth Service — `/api/auth`

### POST `/api/auth/login`
Đăng nhập. **Không cần token.**

Request:
```json
{ "username": "524h0088", "password": "123456" }
```
Response `200`:
```json
{
  "accessToken": "eyJhbGciOi...",
  "userId": "b3a1...-uuid",
  "email": "524h0088@tdtu.edu.vn",
  "balance": 100000000
}
```
Response `401` (sai user/pass):
```json
{ "error": "Sai mật khẩu!" }
```

### GET `/api/auth/users/{userId}`
Lấy thông tin + số dư của **chính người dùng đang đăng nhập** (`userId` phải trùng với user trong token, khác sẽ bị `403`).

Headers: `Authorization: Bearer <token>`

Response `200`:
```json
{
  "id": "b3a1...-uuid",
  "email": "524h0088@tdtu.edu.vn",
  "fullName": "Tran Huu Danh",
  "phone": "0901234088",
  "balance": 91500000
}
```
> `phone` có thể `null` nếu tài khoản chưa có SĐT. `fullName` luôn có (cột `NOT NULL`).

> Các endpoint `/api/auth/users/{id}/debit` và `/api/auth/users/{id}/credit` chỉ dùng nội bộ giữa các service (yêu cầu API key riêng), **frontend không gọi**.

---

## 2. Tuition Service — `/api/tuition`

Tất cả endpoint dưới đây yêu cầu `Authorization: Bearer <token>`.

### GET `/api/tuition/{mssv}`
Lấy khoản học phí **chưa đóng, đến hạn sớm nhất** của 1 MSSV.

Response `200`:
```json
{
  "id": "22222222-...-uuid",
  "mssv": "524H0001",
  "studentName": "Tran Huu Danh",
  "semester": "HK1-2526",
  "amount": 8500000,
  "paid": false
}
```
Response `404`: không còn khoản học phí nào chưa đóng cho MSSV này.

### GET `/api/tuition/{mssv}/all`
Lấy **toàn bộ** học phí (đã đóng + chưa đóng) của 1 MSSV — dùng cho màn lịch sử học phí.

Response `200`:
```json
[
  {
    "id": "22222222-...-uuid",
    "mssv": "524H0002",
    "studentName": "Ta Nguyen Thanh Quy",
    "semester": "HK2-2425",
    "amount": 5000000,
    "paid": false
  },
  {
    "id": "22222222-...-uuid2",
    "mssv": "524H0002",
    "studentName": "Ta Nguyen Thanh Quy",
    "semester": "HK1-2526",
    "amount": 9200000,
    "paid": false
  }
]
```

### GET `/api/tuition/id/{id}`
Chi tiết 1 khoản học phí theo `id` (UUID) — có thêm `dueDate`, `paidAt`, `transactionId`.

Response `200`:
```json
{
  "id": "22222222-...-uuid",
  "mssv": "524H0001",
  "studentName": "Tran Huu Danh",
  "semester": "HK1-2526",
  "amount": 8500000,
  "paid": false,
  "dueDate": "2025-10-15",
  "paidAt": null,
  "transactionId": null
}
```
> Khi đã đóng, `paidAt` có dạng `"2026-11-02T03:09:43.341Z"` (kèm múi giờ).

> `POST /api/tuition/{id}/mark-paid` chỉ dùng nội bộ (payment-service tự gọi), **frontend không gọi**.

---

## 3. Payment Service — `/api/payments`

Tất cả endpoint dưới đây yêu cầu `Authorization: Bearer <token>`.

### POST `/api/payments/initiate`
Bắt đầu thanh toán học phí cho 1 MSSV. Hệ thống kiểm tra học phí chưa đóng + số dư đủ, tạo giao dịch `PENDING`, gửi mã OTP 6 số về email của **người đang đăng nhập** (hiệu lực 5 phút).

Request:
```json
{ "mssv": "524H0001", "tuitionId": "22222222-...-uuid" }
```
> `mssv` phải đúng định dạng `3 số + 1 chữ + 4 số`, VD `524H0001`. Có thể đóng hộ MSSV khác với tài khoản MSSV mình.
> `tuitionId` *(tuỳ chọn, thêm 2026-11-02)*: khoản học phí đang hiển thị. Backend tự chọn khoản đến hạn
> sớm nhất theo MSSV; nếu khác `tuitionId` thì trả `409 TUITION_CHANGED` **trước khi** tạo giao dịch
> (không gửi OTP, không tốn lượt).

Response `200`:
```json
{
  "transactionId": "44444444-...-uuid",
  "tuitionId": "22222222-...-uuid",
  "semester": "HK1-2526",
  "amount": 8500000,
  "balance": 100000000,
  "otpExpiresAt": "2026-11-02T03:14:41.641Z"
}
```
- `tuitionId`, `semester` *(thêm 2026-09-20)*: khoản học phí **thật sự** được ghi nợ.
- `otpExpiresAt` *(thêm 2026-11-02)*: hạn thật của OTP. Gọi `initiate` lại cho cùng khoản khi OTP cũ
  còn hạn sẽ nhận lại **đúng giao dịch cũ với hạn cũ** (không có mã mới, không gửi email mới).
  FE đếm ngược theo field này, không tự cộng 5 phút.

Lỗi: `400` sai định dạng MSSV · `404 TUITION_NOT_FOUND` · `409 INSUFFICIENT_BALANCE` / `TUITION_ALREADY_PAID` /
`TUITION_LOCKED` (người khác đang giữ khoản này) / `TUITION_CHANGED` · `429 OTP_REQUEST_LIMIT` (3 lần/giờ) ·
`503 SERVICE_BUSY` (không gửi được OTP).

### POST `/api/payments/verify-otp`
Xác nhận OTP để hoàn tất thanh toán (trừ tiền + đánh dấu học phí đã đóng + gửi email xác nhận).

Request:
```json
{ "transactionId": "44444444-...-uuid", "otp": "123456" }
```
Response `200`:
```json
{
  "transactionId": "44444444-...-uuid",
  "status": "SUCCESS",
  "amountPaid": 9200000,
  "remainingBalance": 84300000,
  "completedAt": "2026-11-02T03:09:43.372Z",
  "message": "Thanh toán thành công"
}
```
Gửi lại OTP của giao dịch đã `SUCCESS` vẫn nhận `200`, với `message: "Giao dịch đã được xử lý trước đó"` và
`remainingBalance: null`, không trừ tiền lần hai.

Lỗi:
- `400` OTP không phải 6 chữ số (map theo field).
- `409 OTP_INVALID` kèm `remainingAttempts`, tối đa **3 lần sai/giao dịch**; về `0` thì giao dịch đã FAILED.
- `429 OTP_ATTEMPT_LIMIT`: hết lượt (kể cả giới hạn 8 lần sai/giờ/user), giao dịch đã FAILED.
- `409 TUITION_ALREADY_PAID`: OTP đúng nhưng người khác đóng trước; tiền đã trừ được **hoàn lại đủ**.
- `409 INSUFFICIENT_BALANCE`: số dư không đủ lúc trừ tiền (số dư **không** được giữ tạm từ lúc gửi OTP).
- `409 TRANSACTION_FAILED` / `PAYMENT_FAILED`: giao dịch đã chết, phải tạo giao dịch mới.
- `403 TRANSACTION_FORBIDDEN` · `404 TRANSACTION_NOT_FOUND`.
- `503 SERVICE_BUSY`: đang xử lý hoặc hệ thống bận, kiểm tra lại lịch sử sau.

### GET `/api/payments/history`
Mới thêm 2026-09-04. Toàn bộ giao dịch của **người đang đăng nhập**, không tham số.

Response `200`, sắp xếp theo `createdAt` giảm dần (mới nhất trước), mảng rỗng `[]` nếu chưa từng giao dịch:
```json
[
  {
    "id": "a1b2c3d4-...-uuid",
    "tuitionId": "22222222-...-uuid",
    "mssv": "524H0001",
    "studentName": "Tran Huu Danh",
    "semester": "HK1-2526",
    "amount": 8500000,
    "status": "SUCCESS",
    "errorMessage": null,
    "createdAt": "2026-09-04T10:15:32",
    "updatedAt": "2026-09-04T10:15:41"
  }
]
```
- `tuitionId`: UUID khoản học phí — dùng `GET /api/tuition/id/{tuitionId}` nếu cần tra thêm chi tiết (kỳ, hạn đóng). FE không gọi.
- `mssv`, `studentName` *(thêm 2026-09-09)*: payment-service chụp lại lúc `initiate` từ `GET /api/tuition/{mssv}` và lưu vào bảng `transactions` — không phải join lúc đọc, nên lịch sử giữ đúng tên tại thời điểm giao dịch. **Có thể `null`** với các giao dịch tạo trước ngày này; FE fallback về mã giao dịch.
- `semester` *(thêm 2026-09-20)*: học kỳ của khoản học phí, cũng là snapshot lúc `initiate`. **Có thể `null`** với giao dịch tạo trước ngày này; bảng lịch sử hiển thị `—`.
- `status`: `PENDING` (vừa khởi tạo, chờ OTP) · `PROCESSING` (đang trừ tiền, tạm thời) · `SUCCESS` · `FAILED` (thất bại hoặc bị huỷ — xem `errorMessage`).
  Giao dịch bị bỏ dở (huỷ, đóng tab, để OTP hết hạn) được job nền chuyển `PENDING → FAILED` khoảng
  6–7 phút sau khi tạo, `errorMessage = "Hết hạn OTP, không xác nhận trong thời gian quy định"` *(từ 2026-11-02)*.
- `createdAt`, `updatedAt`: kèm múi giờ (xem mục "Định dạng lỗi").
- `errorMessage`: chỉ có giá trị khi `status = FAILED`.

---

## Tài khoản & dữ liệu demo có sẵn

| Username | Password | Số dư ban đầu | Ghi chú |
|---|---|---|---|
| `524h0088` | `123456` | 100.000.000 | Đủ tiền cho mọi khoản demo → chạy happy path |
| `524h0456` | `123456` | 15.000.000 | Ít hơn học phí của `524H0004` (20.000.000) → demo lỗi thiếu số dư |

**Username KHÔNG phải MSSV.** Sinh viên để tra cứu là 5 mã dưới đây, seed ở
`Backend-midterm/tuition-service/src/main/resources/data.sql`:

| MSSV | Sinh viên | Học phí chưa đóng | Dùng để test |
|---|---|---|---|
| `524H0001` | Tran Huu Danh | HK1-2526 = 8.500.000 | happy path |
| `524H0002` | Ta Nguyen Thanh Quy | HK2-2425 = 5.000.000 **và** HK1-2526 = 9.200.000 | `/all` trả nhiều dòng; `/{mssv}` trả kỳ cũ trước |
| `524H0003` | Le Minh Anh | (đã đóng hết) | `404` "không còn khoản chưa đóng" |
| `524H0004` | Pham Thi Mai | HK1-2526 = 20.000.000 | thiếu số dư với `524h0456` |
| `524H0005` | Vo Quoc Bao | HK1-2526 = 6.500.000 (HK2-2425 đã đóng) | `/{mssv}` trả đúng kỳ còn nợ |

> Số dư và cột "chưa đóng" ở trên là **trạng thái seed ban đầu**. Volume Postgres
> được giữ qua các lần `docker compose up`, nên sau khi demo/test thật thì số dư đã
> bị trừ và một số khoản đã chuyển sang đã đóng — tra cứu lại bằng
> `GET /api/tuition/{mssv}/all` thay vì tin bảng này.

Email OTP dùng tài khoản Gmail thật đã cấu hình sẵn ở backend — OTP sẽ được gửi vào hộp thư của user đang đăng nhập khi gọi `initiate`.

---

## Chưa có (nếu frontend cần, báo lại để bổ sung backend)

- Đăng ký tài khoản mới (hiện chỉ có 2 tài khoản demo seed sẵn ở trên)
- Refresh token / logout
- Gửi lại OTP (FE không có nút "Gửi lại OTP")
- Huỷ giao dịch chủ động (FE chỉ điều hướng đi; job nền tự chốt FAILED sau khi OTP hết hạn)
