import { useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { getAvailableBalance, lookupTuitionByStudentId } from "../api/tuition";
import { initiateTransaction } from "../api/transaction";
import { getApiErrorMessage } from "../api/client";
import { formatVnd } from "../utils/format";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconBanknote,
  IconCheckCircle,
  IconGraduationCap,
  IconIdCard,
  IconMail,
  IconPhone,
  IconUser,
  IconWallet,
} from "../components/icons";

const labelStyle: CSSProperties = {
  fontSize: 18,
  color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
};

function LabeledValue({ label, children, fullWidth, big, accent, mono, icon }: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
  big?: boolean;
  accent?: boolean;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 5 }}>
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: big ? 28 : 22,
          marginTop: 2,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontWeight: mono ? 600 : undefined,
          color: accent ? "var(--color-accent)" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PaymentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { payer } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const debouncedStudentId = useDebouncedValue(studentId.trim());

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: getAvailableBalance,
    refetchOnMount: "always",
  });

  const tuitionQuery = useQuery({
    queryKey: ["tuition-lookup", debouncedStudentId],
    queryFn: () => lookupTuitionByStudentId(debouncedStudentId),
    enabled: debouncedStudentId.length > 0,
    retry: false,
  });

  const initiateMutation = useMutation({
    mutationFn: initiateTransaction,
    onSuccess: (transaction) => {
      navigate("/otp", { state: { transaction } });
    },
  });

  const tuition = tuitionQuery.data;
  const isLoadingLookup = tuitionQuery.isFetching;
  const notFound = tuitionQuery.isError && debouncedStudentId.length > 0;
  const found = !!tuition;
  const unpaid = found && tuition.tuitionStatus === "UNPAID";
  const availableBalance = balanceQuery.data?.availableBalance ?? 0;
  const enoughBalance = unpaid && availableBalance >= tuition.tuitionAmount;
  const canConfirm = enoughBalance && agreedToTerms && !initiateMutation.isPending;

  let confirmHint = "";
  if (!found) confirmHint = "Nhập MSSV hợp lệ để tiếp tục.";
  else if (!unpaid) confirmHint = "Khoản học phí đã được thanh toán.";
  else if (!enoughBalance) confirmHint = "Số dư khả dụng không đủ.";
  else if (!agreedToTerms) confirmHint = "Cần đồng ý điều khoản.";

  function handleConfirm() {
    if (!canConfirm || !tuition) return;
    initiateMutation.mutate(
      { studentId: tuition.studentId, studentName: tuition.studentName },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["balance"] });
        },
      },
    );
  }

  const payerEmailValid = !!payer?.payerEmail;

  return (
    <div>
      <div className="stamp">SCR-02</div>
      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: "0 0 6px" }}>Thanh toán học phí</h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          fontSize: 20,
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        Tạo giao dịch đóng học phí cho sinh viên
      </p>

      <div
        className="payment-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 320px",
          gap: "calc(var(--space-8) * 1.4)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <section className="card">
            <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconUser size={18} />
              Nhóm 1 — Người nộp tiền
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3) var(--space-4)",
                marginTop: 4,
              }}
            >
              <LabeledValue label="Họ tên" icon={<IconUser size={18} />}>
                {payer?.payerFullName}
              </LabeledValue>
              <LabeledValue label="Điện thoại" icon={<IconPhone size={18} />}>
                {payer?.payerPhone}
              </LabeledValue>
              <LabeledValue label="Email" icon={<IconMail size={18} />} fullWidth>
                {payer?.payerEmail || "—"}
              </LabeledValue>
            </div>
            {!payerEmailValid && (
              <div className="notice" style={{ marginTop: "var(--space-3)" }}>
                <IconAlertTriangle size={22} />
                <div>Hồ sơ của bạn chưa có email hợp lệ nên chưa thể nhận OTP.</div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconIdCard size={18} />
              Nhóm 2 — Thông tin học phí
            </div>
            <div className="field" style={{ maxWidth: 360, marginTop: 4 }}>
              <label>Mã số sinh viên (MSSV)</label>
              <div className="field-icon">
                <IconIdCard size={22} />
                <input
                  className="input"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="52100001"
                  autoComplete="off"
                  disabled={!payerEmailValid}
                />
              </div>
            </div>

            {isLoadingLookup && (
              <div
                className="pulse"
                style={{ fontSize: 20, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}
              >
                Đang tra cứu…
              </div>
            )}

            {notFound && !isLoadingLookup && (
              <div className="notice otp-shake">
                <IconAlertCircle size={22} />
                <div>Không tìm thấy MSSV này.</div>
              </div>
            )}

            {found && !isLoadingLookup && (
              <div
                className="stagger-in"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--space-3) var(--space-4)",
                  paddingTop: "var(--space-2)",
                }}
              >
                <LabeledValue label="Họ tên sinh viên" icon={<IconGraduationCap size={18} />}>
                  {tuition.studentName}
                </LabeledValue>
                <div>
                  <div style={labelStyle}>Trạng thái</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={tuition.tuitionStatus === "PAID" ? "tag tag-success" : "tag tag-accent"}>
                      {tuition.tuitionStatus === "PAID" ? (
                        <IconCheckCircle size={17} />
                      ) : (
                        <IconAlertCircle size={17} />
                      )}
                      {tuition.tuitionStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"}
                    </span>
                  </div>
                </div>
                <LabeledValue label="Số tiền học phí" icon={<IconBanknote size={18} />} fullWidth>
                  <span style={{ fontSize: 34, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {formatVnd(tuition.tuitionAmount)}
                  </span>
                </LabeledValue>
              </div>
            )}

            {found && tuition.tuitionStatus === "PAID" && (
              <div className="notice">
                <IconCheckCircle size={22} />
                <div>Khoản học phí này đã được thanh toán.</div>
              </div>
            )}
          </section>

          <section className="card" style={{ opacity: unpaid ? 1 : 0.5 }}>
            <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWallet size={18} />
              Nhóm 3 — Thông tin thanh toán
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-4)",
                paddingTop: 4,
              }}
            >
              <LabeledValue label="Số dư khả dụng" icon={<IconWallet size={18} />} big mono>
                {formatVnd(availableBalance)}
              </LabeledValue>
              <LabeledValue label="Số tiền thanh toán" icon={<IconBanknote size={18} />} big accent mono>
                {unpaid ? formatVnd(tuition.tuitionAmount) : "—"}
              </LabeledValue>
            </div>

            <label
              className="radio"
              style={{ marginTop: "var(--space-3)", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={!unpaid}
              />
              <span className="dot dot--check" style={{ borderRadius: 3, marginTop: 2 }} />
              <span style={{ fontSize: 20, lineHeight: 1.5 }}>
                Tôi đồng ý với điều khoản giao dịch và xác nhận thông tin trên là chính xác.
              </span>
            </label>

            {initiateMutation.isError && (
              <div className="notice">
                <IconAlertCircle size={22} />
                <div>
                  {getApiErrorMessage(initiateMutation.error) ??
                    "Không thể tạo giao dịch, vui lòng thử lại."}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={!canConfirm}>
                {initiateMutation.isPending ? "Đang xử lý…" : "Xác nhận giao dịch"}
                {!initiateMutation.isPending && <IconArrowRight size={21} />}
              </button>
              <div style={{ fontSize: 19, color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
                {confirmHint}
              </div>
            </div>
          </section>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", position: "sticky", top: 96 }}>
          <div className="card stub elev-sm">
            <div className="card-kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWallet size={18} />
              Số dư
            </div>
            <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatVnd(availableBalance)}</div>
            <div
              style={{
                fontSize: 18,
                color: "color-mix(in srgb, var(--color-text) 40%, transparent)",
                lineHeight: 1.5,
              }}
            >
              Số dư khả dụng bằng số dư thực trừ phần đang giữ tạm, do hệ thống trả về.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
