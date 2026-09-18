import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getTransactionHistory } from "../api/history";
import type { PaymentHistoryStatus } from "../types/domain";
import { formatDateTime, formatVnd, shortenId } from "../utils/format";
import {
  IconCheckCircle,
  IconClock,
  IconCreditCard,
  IconInbox,
  IconXCircle,
} from "../components/icons";
import type { ComponentType } from "react";

// Trạng thái lấy thẳng từ backend. Giao dịch hết lượt thử OTP giờ được
// payment-service ghi FAILED kèm errorMessage giải thích, nên dòng đó tự hiện
// "Thất bại" + lý do — FE không cần suy đoán hay tự nhớ gì thêm.
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
      <div className="page-head">
        <div>
          <h1>Lịch sử giao dịch</h1>
          <p className="page-head__sub">Mọi giao dịch học phí của bạn, mới nhất trước.</p>
        </div>
        <div className="stamp">SCR-05</div>
      </div>

      {history.length === 0 ? (
        <div className="empty page-enter">
          <IconInbox size={40} />
          <p className="empty__title">Chưa có giao dịch nào</p>
          <p className="empty__body">
            Giao dịch sẽ xuất hiện ở đây ngay sau khi bạn đóng học phí lần đầu.
          </p>
          <Link to="/payment" className="btn btn-primary">
            <IconCreditCard size={19} />
            Thanh toán học phí
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table history-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Sinh viên</th>
                <th>Mã giao dịch</th>
                <th className="col-amount">Số tiền</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const [label, tagClass, StatusIcon] = STATUS_LABEL[row.status];
                const detail = row.status === "FAILED" ? row.errorMessage : null;
                return (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.createdAt)}</td>
                    <td>
                      {row.studentName ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{row.studentName}</div>
                          {row.mssv && <div className="history-sub">{row.mssv}</div>}
                        </>
                      ) : (
                        <span className="history-sub">Không có thông tin</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} title={row.id}>
                      {shortenId(row.id)}
                    </td>
                    <td className="col-amount" style={{ fontWeight: 600 }}>
                      {formatVnd(row.amount)}
                    </td>
                    <td>
                      <span className={tagClass}>
                        <StatusIcon size={15} />
                        {label}
                      </span>
                      {detail && <div className="history-error">{detail}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
