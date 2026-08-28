import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import type { Transaction, TransactionFailureReason } from "../types/domain";
import { getAvailableBalance } from "../api/tuition";
import { formatVnd } from "../utils/format";
import { IconCheckCircle, IconCreditCard, IconHistory, IconXCircle } from "../components/icons";

interface ResultLocationState {
  transaction: Transaction;
}

const FAIL_MSG: Record<TransactionFailureReason, string> = {
  OTP_EXPIRED:
    "Mã OTP đã hết hiệu lực sau 5 phút. Giao dịch không được thực hiện, số dư giữ tạm đã được giải phóng.",
  OTP_LOCKED: "Bạn đã nhập sai quá số lần cho phép, vui lòng thực hiện lại giao dịch.",
  TUITION_ALREADY_PAID:
    "Khoản học phí này vừa được thanh toán bởi một giao dịch khác. Giao dịch của bạn không được ghi nhận và số dư giữ tạm đã được hoàn lại.",
  INSUFFICIENT_BALANCE: "Số dư không đủ để hoàn tất giao dịch.",
  SYSTEM_ERROR: "Lỗi hệ thống, giao dịch không được thực hiện. Vui lòng thử lại sau.",
};

const FAIL_LABEL: Record<TransactionFailureReason, string> = {
  OTP_EXPIRED: "Hết hạn OTP",
  OTP_LOCKED: "Sai OTP quá số lần",
  TUITION_ALREADY_PAID: "Học phí đã được thanh toán",
  INSUFFICIENT_BALANCE: "Số dư không đủ",
  SYSTEM_ERROR: "Lỗi hệ thống",
};

export function TransactionResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ResultLocationState | null;

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: getAvailableBalance,
    enabled: !!state?.transaction,
  });

  useEffect(() => {
    if (!state?.transaction) {
      navigate("/payment", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.transaction) {
    return null;
  }

  const { transaction } = state;
  const isSuccess = transaction.status === "COMPLETED";
  const fail = transaction.failureReason ? FAIL_MSG[transaction.failureReason] : null;
  const failLabel = transaction.failureReason ? FAIL_LABEL[transaction.failureReason] : "Đã hủy";
  const availableBalance = balanceQuery.data?.availableBalance;

  const rows = isSuccess
    ? [
        { label: "Mã giao dịch", value: transaction.transactionId },
        { label: "Số tiền", value: formatVnd(transaction.amountToPay) },
        { label: "Sinh viên", value: `${transaction.studentId} — ${transaction.studentName}` },
        { label: "Số dư còn lại", value: availableBalance != null ? formatVnd(availableBalance) : "—" },
      ]
    : [
        { label: "Mã giao dịch", value: transaction.transactionId },
        { label: "Trạng thái", value: failLabel },
        { label: "Sinh viên", value: `${transaction.studentId} — ${transaction.studentName}` },
        { label: "Số dư khả dụng", value: availableBalance != null ? formatVnd(availableBalance) : "—" },
      ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: "var(--space-4)", textAlign: "center" }}>
      <div className="stamp">SCR-04</div>

      <div className={isSuccess ? "result-icon result-icon--success" : "result-icon result-icon--fail"}>
        {isSuccess ? <IconCheckCircle size={44} /> : <IconXCircle size={44} />}
      </div>

      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: "0 0 6px" }}>
        {isSuccess ? "Giao dịch thành công" : "Giao dịch không thành công"}
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: 20,
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        {isSuccess ? "Đã hoàn tất thanh toán" : "Thanh toán không thành công"}
      </p>

      <div
        className="card elev-md"
        style={{
          borderLeft: `3px solid ${isSuccess ? "var(--color-accent-2)" : "var(--color-stamp)"}`,
          textAlign: "left",
          padding: "var(--space-4)",
        }}
      >
        <div style={{ fontSize: 21, lineHeight: 1.6 }}>
          {isSuccess ? "Học phí đã được thanh toán và ghi nhận vào lịch sử giao dịch." : fail}
        </div>

        <div className="stagger-in" style={{ marginTop: "var(--space-2)" }}>
          {rows.map((row) => (
            <div key={row.label} className="ledger-row">
              <span className="ledger-row__label">{row.label}</span>
              <span className="ledger-row__leader" />
              <span className="ledger-row__value">{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/payment")}>
            <IconCreditCard size={21} />
            Về trang chủ
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/history")}>
            <IconHistory size={21} />
            Xem lịch sử giao dịch
          </button>
        </div>
      </div>
    </div>
  );
}
