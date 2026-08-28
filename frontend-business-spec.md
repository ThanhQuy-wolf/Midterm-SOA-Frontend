# Đặc tả nghiệp vụ cho Frontend — Phân hệ Đóng học phí iBanking

> Nguồn: `MidtermVIHK12627.md`. Tài liệu này chuyển đặc tả nghiệp vụ thành hướng dẫn cho đội làm frontend: danh sách màn hình, state machine, business rule theo từng field, validation, và các case lỗi/đồng thời cần xử lý trên UI. Naming ở đây (tên field, tên trạng thái) nên được giữ nhất quán khi thiết kế API/DB ở các bước sau.
> Trạng thái: đã chốt các quyết định nghiệp vụ chính (xem mục "Quyết định đã chốt"). Sẵn sàng làm nền cho bước thiết kế REST API / DB.

## Quyết định đã chốt

1. **Không resume giao dịch OTP.** Nếu người dùng rời màn hình SCR-03 (refresh, điều hướng đi, đóng tab) trong lúc OTP còn hiệu lực, giao dịch đó coi như bị bỏ dở — không cho quay lại nhập tiếp. Muốn thanh toán lại phải tạo giao dịch mới từ SCR-02.
2. **Tối đa 5 lần nhập sai OTP.** Sai lần thứ 5 → khóa giao dịch hiện tại (chuyển sang trạng thái thất bại), giải phóng phần số dư đang giữ, buộc quay về SCR-02 để tạo giao dịch mới.
3. **Có cơ chế giữ tạm (reserve) số dư.** Ngay khi OTP được gửi (trạng thái `OTP_SENT`), hệ thống giữ tạm đúng `tuitionAmount` trên tài khoản người nộp. Số dư khả dụng hiển thị ở mọi nơi trên FE (SCR-02, kể cả khi mở tab/giao dịch khác) phải là số đã trừ phần đang giữ — tức `availableBalance` do API trả về đã là số "thực dùng được", FE không tự tính.
4. **Tra cứu MSSV tự động.** Không có nút "Tra cứu" riêng — hệ thống tự tra cứu (debounce khi người dùng gõ/dừng gõ) và hiển thị ngay nếu MSSV tồn tại trong DB; không tìm thấy thì không hiển thị kết quả (kèm thông báo phù hợp).
5. **Lịch sử giao dịch không cần filter.** SCR-05 là danh sách đơn giản, không cần bộ lọc theo ngày/trạng thái. (Có thể cân nhắc sắp xếp mới nhất trước như mặc định hợp lý, không cần chốt thêm.)

## Danh sách màn hình

| Mã | Màn hình | Mục đích |
|---|---|---|
| SCR-01 | Đăng nhập | Xác thực username/password |
| SCR-02 | Thanh toán học phí | 3 nhóm thông tin: người nộp, học phí, thanh toán |
| SCR-03 | Xác thực OTP | Nhập OTP để hoàn tất giao dịch |
| SCR-04 | Kết quả giao dịch | Hiển thị thành công/thất bại |
| SCR-05 | Lịch sử giao dịch | Danh sách đơn giản các giao dịch đã thực hiện, không filter |

Luồng chính: `SCR-01 → SCR-02 → (xác nhận giao dịch) → SCR-03 → (xác thực OTP) → SCR-04 → (quay lại SCR-02 hoặc SCR-05)`.

## State machine

**Transaction** (giao dịch):
`INITIATED → OTP_SENT → OTP_VERIFIED → COMPLETED`

Nhánh lỗi:
- `OTP_SENT → EXPIRED` — quá 5 phút không nhập/không xác thực xong, **hoặc** người dùng rời màn hình OTP (theo quyết định 1, không phân biệt hai lý do này ở tầng UI — cả hai đều dẫn tới cùng kết cục: giao dịch không còn hiệu lực, giải phóng số dư đang giữ).
- `OTP_SENT → FAILED (OTP_LOCKED)` — sai OTP đủ 5 lần (quyết định 2).
- `OTP_SENT → CANCELLED` — người dùng chủ động bấm "Hủy giao dịch".
- `OTP_VERIFIED → FAILED` — OTP đúng nhưng backend re-check lúc chốt phát hiện học phí đã được thanh toán bởi giao dịch khác (số dư không thể "không đủ" nữa ở bước này vì đã được giữ tạm từ lúc `OTP_SENT` — xem Rủi ro).

Mọi nhánh kết thúc bằng lỗi (`EXPIRED`, `FAILED`, `CANCELLED`) đều phải **giải phóng phần số dư đang giữ tạm** của giao dịch đó.

**Tuition** (khoản học phí): `UNPAID → PAID`.

## Chi tiết từng màn hình

### SCR-01 — Đăng nhập
- Field: `username`, `password`.
- Sai username/password → thông báo lỗi chung chung, không tiết lộ field nào sai.

### SCR-02 — Thanh toán học phí

**Nhóm 1 — Người nộp tiền** (read-only)
- Field: `payerFullName`, `payerPhone`, `payerEmail` — lấy từ session, không cho sửa.
- Nếu `payerEmail` rỗng/không hợp lệ trong hồ sơ → chặn ngay từ đầu màn hình (không thể gửi OTP được).

**Nhóm 2 — Thông tin học phí**
- Field nhập: `studentId` (MSSV), tự động tra cứu khi người dùng dừng gõ (debounce, không cần nút riêng — quyết định 4).
- Field hiển thị (chỉ đọc, đổ ra sau khi tra cứu): `studentName`, `tuitionAmount`, `tuitionStatus`.
- 3 UI state theo kết quả tra cứu: không tìm thấy MSSV (không hiển thị gì thêm ngoài thông báo, khóa nhóm 3) / tìm thấy nhưng `tuitionStatus = PAID` (báo "đã thanh toán", khóa nhóm 3) / tìm thấy và `UNPAID` (đổ dữ liệu, mở nhóm 3).
- `tuitionAmount` luôn read-only — chỉ thanh toán toàn bộ, không có ô nhập số tiền tùy ý.

**Nhóm 3 — Thông tin thanh toán**
- Field hiển thị: `availableBalance` (đã net trừ phần đang giữ tạm — quyết định 3), `amountToPay` (= `tuitionAmount`, read-only).
- Field nhập: checkbox `agreedToTerms` (bắt buộc).
- Điều kiện bật nút **"Xác nhận giao dịch"**: tra cứu MSSV thành công + `tuitionStatus == UNPAID` + `availableBalance >= tuitionAmount` + đã tick điều khoản.
- `availableBalance` vẫn có thể lệch giữa lúc hiển thị và lúc bấm xác nhận (vd. một giao dịch khác của chính user vừa giữ tạm một phần số dư) — backend luôn re-check tại thời điểm bấm "Xác nhận giao dịch" (đây là lúc tạo `reserve` mới), không chỉ tin vào giá trị đã hiển thị.

### SCR-03 — Xác thực OTP
- Hiển thị: email đích che một phần, đếm ngược 5:00, ô nhập OTP, số lần thử còn lại (bắt đầu từ 5, giảm dần theo quyết định 2), nút "Gửi lại OTP" (vô hiệu OTP cũ, cấp mới cùng giao dịch, **không** reset lại bộ đếm 5 lần sai), nút "Hủy giao dịch".
- Rời màn hình (refresh/điều hướng/đóng tab) → **không resume** (quyết định 1). Nếu quay lại SCR-03 bằng cách nào đó (vd. back button), FE nên coi giao dịch đã mất hiệu lực và điều hướng về SCR-02, không cố phục hồi form nhập OTP.
- Sai đủ 5 lần → khóa ngay (không đợi hết 5 phút), báo "Bạn đã nhập sai quá số lần cho phép, vui lòng thực hiện lại giao dịch", điều hướng về SCR-02.
- Hết 5 phút chưa xác thực xong → tự động `EXPIRED`, khóa ô nhập, chỉ còn quay lại SCR-02.
- OTP đúng nhưng backend re-check phát hiện học phí đã bị thanh toán bởi giao dịch khác → thông điệp riêng, **không** dùng chung với thông báo "sai OTP".

### SCR-04 — Kết quả giao dịch
- Thành công: `transactionId`, số tiền, MSSV + tên SV, số dư còn lại sau giao dịch, nút "Về trang chủ" / "Xem lịch sử giao dịch".
- Thất bại: lý do cụ thể — OTP hết hạn / sai OTP quá 5 lần / học phí đã được thanh toán bởi giao dịch khác / lỗi hệ thống — mỗi lý do một thông điệp riêng. ("Số dư không đủ" gần như không còn xảy ra ở bước này nhờ cơ chế reserve từ lúc gửi OTP, nhưng vẫn nên có message dự phòng cho trường hợp hệ thống từ chối vì lý do số dư ở tầng backend.)

### SCR-05 — Lịch sử giao dịch
- Danh sách giao dịch của người dùng đang đăng nhập: ngày giờ, MSSV, số tiền, trạng thái. Không cần filter (quyết định 5). Mặc định sắp xếp mới nhất trước.

## Rủi ro & điểm cần lưu ý

- **Reserve/release phải khớp với state machine ở mọi nhánh thoát.** Đây là điểm dễ gây bug nhất: `EXPIRED`, `FAILED`, `CANCELLED` đều phải giải phóng số dư đang giữ, nếu backend quên release ở bất kỳ nhánh nào, người dùng sẽ thấy `availableBalance` sai dù không có giao dịch nào đang chạy. FE nên luôn fetch lại `availableBalance` mới nhất mỗi khi vào lại SCR-02, không cache qua điều hướng.
- **"Rời màn hình OTP" là sự kiện phía client, không đáng tin cậy 100%** (mất mạng, tắt tab đột ngột không kịp gọi API hủy). Vì vậy cơ chế hết hạn thực sự phải dựa vào backend (TTL 5 phút của OTP/reservation), việc gọi API hủy khi FE phát hiện điều hướng đi chỉ là tối ưu để giải phóng sớm hơn, không phải cơ chế chính.
- **Double-submit / mất kết nối giữa chừng** ở nút "Xác nhận giao dịch" hoặc submit OTP vẫn cần disable nút khi request đang chạy, để tránh tạo nhiều `reserve` trùng cho cùng một thao tác.
- **Session hết hạn trong 5 phút chờ OTP** chưa được đề cập trong đề — cần xử lý để tránh trạng thái treo (vd. nếu token hết hạn giữa chừng, điều hướng về đăng nhập và giao dịch tự expire theo TTL backend).

## Câu hỏi còn mở (không chặn tiến độ, có thể chốt sau)

Không còn câu hỏi nào chặn việc thiết kế API/DB. Một chi tiết nhỏ có thể để mặc định và điều chỉnh sau nếu cần: thời gian debounce khi tra cứu MSSV tự động (đề xuất mặc định 400-500ms sau khi người dùng ngừng gõ).