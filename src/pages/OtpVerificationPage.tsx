import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelTransaction, resendOtp, verifyOtp } from "../api/transaction";
import type { Transaction } from "../types/domain";
// MOCK ONLY — xóa import này cùng với thư mục src/mocks khi tích hợp backend thật.
import { getMockOtp } from "../mocks/mockAdapter";
import {
  IconAlertCircle,
  IconCheckCircle,
  IconClock,
  IconFlask,
  IconKey,
  IconMail,
  IconRefresh,
  IconShieldCheck,
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
  // location.state là snapshot tĩnh chụp tại thời điểm push — nó vẫn ghi status "OTP_SENT" ngay cả
  // khi giao dịch đã bị hủy/hết hạn sau đó (vd. do rời màn hình OTP trước đó), nên KHÔNG thể dùng
  // transaction.status để phát hiện trường hợp này. Chỉ có navigationType mới phân biệt được:
  // "PUSH" là điều hướng thật từ SCR-02 (bấm "Xác nhận giao dịch"), còn "POP" là quay lại bằng
  // back/forward button. Theo quyết định 1: quay lại SCR-03 bằng bất kỳ cách nào khác ngoài PUSH
  // đều coi giao dịch đã mất hiệu lực, không cố phục hồi form nhập OTP.
  const validInitialTransaction = navigationType === "PUSH" ? initialTransaction : null;

  const [transaction, setTransaction] = useState<Transaction | null>(validInitialTransaction);
  const [otpInput, setOtpInput] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const transactionRef = useRef(transaction);
  const pendingCancelTimeout = useRef<number | null>(null);
  const cellRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    transactionRef.current = transaction;
  }, [transaction]);

  const isLive = transaction?.status === "OTP_SENT";
  const deadline = transaction?.otpExpiresAt ? new Date(transaction.otpExpiresAt).getTime() : 0;
  const timedOut = isLive && deadline > 0 && now >= deadline;

  useEffect(() => {
    if (!isLive || timedOut) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isLive, timedOut]);

  useEffect(() => {
    // React StrictMode (dev only) mounts -> cleans up -> remounts effects synchronously.
    // Cancel is deferred one tick so a StrictMode remount can cancel the pending cancel below.
    if (pendingCancelTimeout.current !== null) {
      clearTimeout(pendingCancelTimeout.current);
      pendingCancelTimeout.current = null;
    }
    return () => {
      const t = transactionRef.current;
      if (t?.status === "OTP_SENT") {
        pendingCancelTimeout.current = window.setTimeout(() => {
          pendingCancelTimeout.current = null;
          cancelTransaction(t.transactionId).catch(() => {});
        }, 0);
      }
    };
  }, []);

  const verifyMutation = useMutation({
    mutationFn: (code: string) => verifyOtp(transaction!.transactionId, code),
    onSuccess: (updated) => {
      setTransaction(updated);
      if (updated.status === "COMPLETED" || updated.status === "FAILED") {
        queryClient.invalidateQueries({ queryKey: ["balance"] });
        queryClient.invalidateQueries({ queryKey: ["history"] });
        navigate("/result", { state: { transaction: updated }, replace: true });
        return;
      }
      setOtpInput("");
      setMessage(`Mã OTP không đúng. Bạn còn ${updated.attemptsLeft} lần thử.`);
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => resendOtp(transaction!.transactionId),
    onSuccess: (updated) => {
      setTransaction(updated);
      setOtpInput("");
      setMessage("Đã gửi mã OTP mới. Mã cũ không còn hiệu lực; số lần thử không được đặt lại.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTransaction(transaction!.transactionId),
    onSuccess: (updated) => {
      setTransaction(updated);
      navigate("/payment", { replace: true });
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
  const countdownColor = deadline - now <= 30000 ? "var(--color-accent)" : "var(--color-text)";
  const expired = transaction.status === "EXPIRED" || timedOut;
  const disabledInput = !isLive || timedOut || verifyMutation.isPending;
  const displayMessage = timedOut ? FAIL_MSG_OTP_EXPIRED : message;

  // MOCK ONLY — xóa khối này cùng với thư mục src/mocks khi tích hợp backend thật.
  const mockOtpHint = import.meta.env.VITE_USE_MOCK === "true" ? getMockOtp(transaction.transactionId) : undefined;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", paddingTop: "var(--space-4)", textAlign: "center" }}>
      <div className="stamp">SCR-03</div>
      <h1
        style={{
          fontSize: 44,
          lineHeight: 1.1,
          margin: "0 0 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <IconShieldCheck size={38} />
        Xác thực OTP
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: 20,
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        Mã giao dịch <span style={{ fontFamily: "var(--font-mono)" }}>{transaction.transactionId}</span>
      </p>

      <div className="card elev-sm" style={{ textAlign: "left", padding: "var(--space-8)", width: "800px" }}>
        <div style={{ display: "flex", gap: 8, fontSize: 20, lineHeight: 1.6 }}>
          <IconMail size={23} style={{ flex: "none", marginTop: 2, color: "var(--color-accent)" }} />
          <div>
            Mã OTP đã gửi tới <strong style={{ fontFamily: "var(--font-mono)" }}>{transaction.maskedEmail}</strong>
          </div>
        </div>

        {mockOtpHint && (
          // MOCK ONLY — xóa khối UI này khi tích hợp backend thật.
          <div className="notice" style={{ marginTop: "var(--space-2)" }}>
            <IconFlask size={22} />
            <div className="mock-badge" style={{ color: "inherit" }}>
              [THỬ NGHIỆM] Mã OTP hiện tại:{" "}
              <strong style={{ fontFamily: "var(--font-mono)", letterSpacing: ".15em" }}>{mockOtpHint}</strong>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 18,
                color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
              }}
            >
              <IconClock size={18} />
              Hiệu lực
            </div>
            <div
              className={isLive && !timedOut && deadline - now <= 30000 ? "pulse" : undefined}
              style={{ fontSize: 40, fontFamily: "var(--font-mono)", fontWeight: 600, color: countdownColor }}
            >
              {isLive && !timedOut ? countdown : "0:00"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 18, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              Số lần thử còn lại
            </div>
            <div style={{ fontSize: 40, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {transaction.attemptsLeft ?? 0}
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: "var(--space-2)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconKey size={17} />
            Mã OTP (6 chữ số)
          </label>
          <div
            key={message}
            className={message.startsWith("Mã OTP không đúng") ? "otp-cells otp-shake" : "otp-cells"}
            onPaste={handleCellPaste}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <input
                key={i}
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
        </div>

        {displayMessage && (
          <div className="notice">
            <IconAlertCircle size={22} />
            <div>{displayMessage}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => verifyMutation.mutate(otpInput)}
            disabled={!isLive || timedOut || verifyMutation.isPending || otpInput.length !== 6}
          >
            {!verifyMutation.isPending && <IconCheckCircle size={21} />}
            {verifyMutation.isPending ? "Đang xác thực…" : "Xác nhận"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => resendMutation.mutate()}
            disabled={!isLive || timedOut || resendMutation.isPending}
          >
            <IconRefresh size={21} className={resendMutation.isPending ? "pulse" : undefined} />
            Gửi lại OTP
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => cancelMutation.mutate()}
            disabled={!isLive || timedOut || verifyMutation.isPending || resendMutation.isPending || cancelMutation.isPending}
            style={{ marginLeft: "auto" }}
          >
            <IconXCircle size={21} />
            Hủy giao dịch
          </button>
        </div>

        {expired && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => navigate("/payment", { replace: true })}
          >
            Quay lại trang thanh toán
          </button>
        )}
      </div>
    </div>
  );
}
