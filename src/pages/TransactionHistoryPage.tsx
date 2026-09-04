import { useQuery } from "@tanstack/react-query";
import { getTransactionHistory } from "../api/history";
import type { PaymentHistoryStatus } from "../types/domain";
import { formatDateTime, formatVnd } from "../utils/format";
import {
  IconCheckCircle,
  IconClock,
  IconHistory,
  IconInbox,
  IconXCircle,
} from "../components/icons";
import type { ComponentType } from "react";

const STATUS_LABEL: Record<PaymentHistoryStatus, [string, string, ComponentType<{ size?: number }>]> = {
  PENDING: ["Chờ xác thực OTP", "tag tag-neutral", IconClock],
  PROCESSING: ["Đang xử lý", "tag tag-neutral", IconClock],
  SUCCESS: ["Thành công", "tag tag-success", IconCheckCircle],
  FAILED: ["Thất bại", "tag tag-stamp", IconXCircle],
};

export function TransactionHistoryPage() {
  const historyQuery = useQuery({
    queryKey: ["history"],
    queryFn: getTransactionHistory,
  });

  const history = historyQuery.data ?? [];

  return (
    <div>
      <div className="stamp">SCR-05</div>
      <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 10 }}>
        <IconHistory size={38} />
        Lịch sử giao dịch
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          fontSize: 20,
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        Danh sách giao dịch, mới nhất trước
      </p>

      {history.length === 0 ? (
        <div
          className="page-enter"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            textAlign: "center",
            fontSize: 21,
            color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
            padding: "calc(var(--space-8) * 2) 0",
          }}
        >
          <IconInbox size={46} style={{ opacity: 0.6 }} />
          <div>Chưa có giao dịch nào.</div>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Mã giao dịch</th>
              <th style={{ textAlign: "right", paddingRight: "calc(var(--space-8) * 2)" }}>Số tiền</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => {
              const [label, tagClass, StatusIcon] = STATUS_LABEL[row.status];
              return (
                <tr key={row.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{row.id}</td>
                  <td style={{ textAlign: "right", paddingRight: "calc(var(--space-8) * 2)", fontWeight: 600 }}>
                    {formatVnd(row.amount)}
                  </td>
                  <td>
                    <span className={tagClass}>
                      <StatusIcon size={17} />
                      {label}
                    </span>
                    {row.status === "FAILED" && row.errorMessage && (
                      <div
                        style={{
                          fontSize: 15,
                          marginTop: 3,
                          color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                        }}
                      >
                        {row.errorMessage}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
