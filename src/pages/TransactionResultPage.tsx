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

  const balanceValue = availableBalance != null ? formatVnd(availableBalance) : "—";
  // `text: true` marks a value as prose so it stays in the body face — the
  // mono face is what tells you a value is a figure.
  // `stack: true` gives the value its own line under the label. The
  // transaction id is a 36-char UUID: sharing a line with its label leaves it
  // too little room and it wraps mid-string.
  const rows: Array<{ label: string; value: string; text?: boolean; stack?: boolean }> = isSuccess
    ? [
        { label: "Mã giao dịch", value: transaction.transactionId, stack: true },
        { label: "Sinh viên", value: transaction.studentName, text: true },
        { label: "Mã số sinh viên", value: transaction.studentId },
        { label: "Số dư còn lại", value: balanceValue },
      ]
    : [
        { label: "Mã giao dịch", value: transaction.transactionId, stack: true },
        { label: "Lý do", value: failLabel, text: true },
        { label: "Sinh viên", value: transaction.studentName, text: true },
        { label: "Mã số sinh viên", value: transaction.studentId },
        { label: "Số dư khả dụng", value: balanceValue },
      ];

  return (
    <div className="result-shell">
      <div className={isSuccess ? "result-icon result-icon--success" : "result-icon result-icon--fail"}>
        {isSuccess ? <IconCheckCircle size={40} /> : <IconXCircle size={40} />}
      </div>

      <h1 className="result-title">
        {isSuccess ? "Đã thanh toán học phí" : "Giao dịch không thành công"}
      </h1>

      {/* The receipt itself: sum first, then the line items that back it up. */}
      <div className="card receipt elev-md">
        <div className="stamp receipt__seal">SCR-04</div>

        {isSuccess ? (
          <div className="receipt__sum">
            <div className="meta">Số tiền đã thu</div>
            <div className="fig fig-hero" style={{ color: "var(--color-accent-2)", marginTop: 4 }}>
              {formatVnd(transaction.amountToPay)}
            </div>
          </div>
        ) : (
          <p className="receipt__reason">{fail}</p>
        )}

        <hr className="perf" />

        <div className="stagger-in">
          {rows.map((row) => (
            <div key={row.label} className={row.stack ? "ledger-row ledger-row--stack" : "ledger-row"}>
              <span className="ledger-row__label">{row.label}</span>
              <span className="ledger-row__leader" />
              <span className={row.text ? "ledger-row__value ledger-row__value--text" : "ledger-row__value"}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="result-actions">
        <button type="button" className="btn btn-primary" onClick={() => navigate("/payment")}>
          <IconCreditCard size={19} />
          Thanh toán khoản khác
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/history")}>
          <IconHistory size={19} />
          Xem lịch sử giao dịch
        </button>
      </div>
    </div>
  );
}
