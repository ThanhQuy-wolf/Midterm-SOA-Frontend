import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { verifyOtp } from "../api/transaction";
import { getApiErrorMessage } from "../api/client";
import type { Transaction } from "../types/domain";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconClock,
  IconMail,
  IconXCircle,
} from "../components/icons";

interface OtpLocationState {
  transaction: Transaction;
}

const FAIL_MSG_OTP_EXPIRED =
  "Mã OTP đã hết hiệu lực sau 5 phút. Giao dịch không được thực hiện, số dư giữ tạm đã được giải phóng.";

function formatCountdown(msLeft: number): string {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function OtpVerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const queryClient = useQueryClient();
  const initialTransaction = (location.state as OtpLocationState | null)?.transaction ?? null;
  // location.state chỉ là ảnh chụp lúc push, vẫn ghi "OTP_SENT" kể cả khi giao dịch đã
  // hủy hoặc hết hạn sau đó, nên transaction.status không dùng để phát hiện được. Phân
  // biệt bằng navigationType: "PUSH" là vừa bấm "Xác nhận giao dịch" bên SCR-02, "POP"
  // là bấm back/forward. Vào lại màn OTP bằng đường nào khác PUSH đều coi như giao dịch
  // đã mất hiệu lực, không phục hồi form.
  const validInitialTransaction = navigationType === "PUSH" ? initialTransaction : null;

  const [transaction, setTransaction] = useState<Transaction | null>(validInitialTransaction);
  const [otpInput, setOtpInput] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

  const isLive = transaction?.status === "OTP_SENT";
  const deadline = transaction?.otpExpiresAt ? new Date(transaction.otpExpiresAt).getTime() : 0;
  const timedOut = isLive && deadline > 0 && now >= deadline;

  useEffect(() => {
    if (!isLive || timedOut) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isLive, timedOut]);

  // Backend tự ghi nhận giao dịch (GET /api/payments/history) — chỉ cần cập nhật state
  // cục bộ và làm mới lịch sử để phản ánh trạng thái mới nhất từ server.
  function finalize(next: Transaction) {
    setTransaction(next);
    queryClient.invalidateQueries({ queryKey: ["history"] });
  }

  // Backend không đẩy sự kiện hết hạn về — FE tự chuyển EXPIRED khi hết 5 phút.
  useEffect(() => {
    if (timedOut && transaction && transaction.status === "OTP_SENT") {
      finalize({ ...transaction, status: "EXPIRED", failureReason: "OTP_EXPIRED", attemptsLeft: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedOut]);

  const verifyMutation = useMutation({
    mutationFn: (code: string) => verifyOtp(transaction!, code),
    onSuccess: (updated) => {
      // Hết lượt thử (429): giao dịch này không verify lại được nữa dù OTP còn
      // hạn, nên đưa thẳng người dùng về bước tạo giao dịch thay vì màn kết quả
      // — ở đó chỉ có nút quay lại, thêm một bước thừa.
      if (updated.status === "FAILED" && updated.failureReason === "OTP_LOCKED") {
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["history"] });
        navigate("/payment", {
          replace: true,
          state: {
            notice: {
              kind: "otp-locked",
              retryAfterSeconds: updated.retryAfterSeconds,
            },
          },
        });
        return;
      }
      if (updated.status === "COMPLETED" || updated.status === "FAILED") {
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["history"] });
        navigate("/result", { state: { transaction: updated }, replace: true });
        return;
      }
      if (updated.status === "EXPIRED") {
        finalize(updated);
        return;
      }
      setTransaction(updated);
      setOtpInput("");
      // Số lần thử còn lại đã hiển thị ngay dưới ô nhập — không lặp lại ở đây.
      setMessage(
        updated.attemptsLeft === 0
          ? "Mã OTP không đúng. Bạn đã dùng hết lượt thử cho giao dịch này."
          : "Mã OTP không đúng. Nhập lại mã mới nhất trong email.",
      );
    },
  });

  useEffect(() => {
    if (!transaction) {
      navigate("/payment", { replace: true });
    }
  }, [transaction, navigate]);

  if (!transaction) {
    return null;
  }

  function handleCancel() {
    const t = transaction;
    if (!t) return;
    // Không có endpoint hủy — backend tự giải phóng số dư giữ tạm theo TTL 5 phút của OTP.
    if (t.status === "OTP_SENT") {
      finalize({ ...t, status: "CANCELLED" });
    }
    navigate("/payment", { replace: true });
  }

  function handleCellInput(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const next = (otpInput.slice(0, index) + digit).slice(0, 6);
    setOtpInput(next);
    if (index < 5) cellRefs.current[index + 1]?.focus();
  }

  function handleCellKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (index < otpInput.length) {
        setOtpInput(otpInput.slice(0, index));
      } else if (index > 0) {
        setOtpInput(otpInput.slice(0, index - 1));
        cellRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  function handleCellPaste(e: ClipboardEvent<HTMLDivElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setOtpInput(digits);
    cellRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  const countdown = formatCountdown(deadline - now);
  const running = isLive && !timedOut;
  const urgent = running && deadline - now <= 30000;
  const expired = transaction.status === "EXPIRED" || timedOut;
  // Backend chỉ nói số lần còn lại sau lần sai đầu tiên — trước đó là undefined
  // và ta không hiển thị gì, thay vì đoán một con số.
  const attemptsLeft = transaction.attemptsLeft;
  // Hết lượt: theo contract, lần bấm tiếp theo chắc chắn nhận 429. Khoá form
  // ngay tại đây thay vì bắt người dùng bấm thêm một lần mới báo lỗi.
  const outOfAttempts = attemptsLeft === 0;
  const disabledInput = !isLive || timedOut || outOfAttempts || verifyMutation.isPending;
  const displayMessage = expired ? FAIL_MSG_OTP_EXPIRED : message;

  return (
    <div className="otp-shell">
      <div className="page-head">
        <div>
          <h1>Xác thực OTP</h1>
          <p className="page-head__sub">
            Giao dịch <span className="fig">{transaction.transactionId}</span>
          </p>
        </div>
        <div className="stamp">SCR-03</div>
      </div>

      <div className="card elev-sm">
        <div className="notice">
          <IconMail size={19} />
          <div>
            Mã OTP đã gửi tới <span className="fig">{transaction.maskedEmail}</span>. Mã có hiệu lực trong
            5 phút.
          </div>
        </div>

        <div className="otp-block">
          <div className="otp-block__head">
            <label htmlFor="otp-cell-0">Mã OTP — 6 chữ số</label>
            <div
              className={urgent ? "otp-timer pulse" : "otp-timer"}
              style={{ color: urgent ? "var(--color-stamp)" : undefined }}
            >
              <IconClock size={16} />
              <span className="fig">{running ? countdown : "0:00"}</span>
            </div>
          </div>

          <div
            key={message}
            className={message.startsWith("Mã OTP không đúng") ? "otp-cells otp-shake" : "otp-cells"}
            onPaste={handleCellPaste}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <input
                key={i}
                id={i === 0 ? "otp-cell-0" : undefined}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                className={otpInput[i] ? "otp-cell filled" : "otp-cell"}
                value={otpInput[i] ?? ""}
                onChange={(e) => handleCellInput(i, e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(i, e)}
                maxLength={1}
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={disabledInput}
                aria-label={`Chữ số OTP thứ ${i + 1}`}
              />
            ))}
          </div>

          {/* Chỉ nói về lượt thử khi backend đã cho biết con số. */}
          {(expired || attemptsLeft !== undefined) && (
            <div className="meta otp-block__foot">
              {expired || outOfAttempts ? "Không còn lượt thử." : `Còn ${attemptsLeft} lần thử.`}
            </div>
          )}
        </div>

        {displayMessage && (
          <div className="notice notice--warn" role="alert">
            <IconAlertCircle size={19} />
            <div>{displayMessage}</div>
          </div>
        )}

        {/* Sự cố phía server hoặc mất mạng: verifyOtp ném ra thay vì trừ lượt
            thử, nên phải báo ở đây — nếu không thao tác sẽ im lặng không phản hồi. */}
        {verifyMutation.isError && (
          <div className="notice notice--warn" role="alert">
            <IconAlertTriangle size={19} />
            <div>
              {getApiErrorMessage(verifyMutation.error) ??
                "Không xác thực được lúc này. Lượt thử của bạn chưa bị trừ, hãy thử lại."}
            </div>
          </div>
        )}

        {expired || outOfAttempts ? (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => navigate("/payment", { replace: true })}
          >
            {outOfAttempts ? "Tạo giao dịch mới" : "Quay lại trang thanh toán"}
          </button>
        ) : (
          <div className="otp-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => verifyMutation.mutate(otpInput)}
              disabled={disabledInput || otpInput.length !== 6}
            >
              {!verifyMutation.isPending && <IconCheckCircle size={19} />}
              {verifyMutation.isPending ? "Đang xác thực…" : "Xác nhận"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={verifyMutation.isPending}
            >
              <IconXCircle size={19} />
              Hủy giao dịch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
