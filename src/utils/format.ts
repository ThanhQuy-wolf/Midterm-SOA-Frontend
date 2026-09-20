export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
}

// Che một phần địa chỉ email để hiển thị ở màn OTP (backend không trả sẵn maskedEmail).
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

// Đếm ngược dạng m:ss cho các mốc chờ (hạn OTP, Retry-After của rate limit).
// Retry-After có thể lên tới hàng nghìn giây nên phần phút không giới hạn 2 chữ số.
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Rút gọn mã giao dịch UUID (36 ký tự) để hiển thị trong bảng, tránh xuống
// hàng làm vỡ layout. Mã đầy đủ vẫn xem được qua tooltip (title).
export function shortenId(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

// Ngày không kèm giờ (dueDate của khoản học phí, dạng "2025-10-15"). Tự tách chuỗi
// thay vì qua Date để không bị lệch một ngày khi trình duyệt hiểu chuỗi là UTC.
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
