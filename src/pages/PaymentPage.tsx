import { useState, type ReactNode } from "react";
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
  IconBanknote,
  IconCheckCircle,
  IconIdCard,
  IconWallet,
} from "../components/icons";

function Row({ label, children, stack, text }: {
  label: string;
  children: ReactNode;
  /** Wrap the value under its label instead of flushing it right. */
  stack?: boolean;
  /** Prose, not a figure — set in the body face rather than the mono one. */
  text?: boolean;
}) {
  return (
    <div className={stack ? "ledger-row ledger-row--stack" : "ledger-row"}>
      <span className="ledger-row__label">{label}</span>
      <span className="ledger-row__leader" />
      <span className={text ? "ledger-row__value ledger-row__value--text" : "ledger-row__value"}>
        {children}
      </span>
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
  // Derived, not fetched: what the payer is left with if this slip goes through.
  const balanceAfter = unpaid ? availableBalance - tuition.tuitionAmount : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Thanh toán học phí</h1>
          <p className="page-head__sub">
            Tra cứu học phí theo mã số sinh viên, rồi xác nhận để nhận mã OTP.
          </p>
        </div>
        <div className="stamp">SCR-02</div>
      </div>

      <div className="payment-grid">
        <div className="payment-form">
          <section className="card">
            <div className="card-kicker">
              <span className="step">1</span>
              Người nộp tiền
            </div>
            <div>
              <Row label="Họ tên" stack text>{payer?.payerFullName}</Row>
              <Row label="Điện thoại" stack>{payer?.payerPhone}</Row>
              <Row label="Email" stack text>
                {payer?.payerEmail || "Chưa có"}
              </Row>
            </div>
            {!payerEmailValid && (
              <div className="notice notice--warn">
                <IconAlertTriangle size={19} />
                <div>
                  Hồ sơ chưa có email hợp lệ nên chưa nhận được OTP. Cập nhật email trước khi thanh toán.
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-kicker">
              <span className="step">2</span>
              Học phí sinh viên
            </div>

            <div className="field" style={{ maxWidth: 300 }}>
              <label htmlFor="student-id">Mã số sinh viên</label>
              <div className="field-icon">
                <IconIdCard size={19} />
                <input
                  id="student-id"
                  className="input fig"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="524H0001"
                  autoComplete="off"
                  disabled={!payerEmailValid}
                />
              </div>
            </div>

            {isLoadingLookup && (
              <div className="meta pulse">Đang tra cứu…</div>
            )}

            {notFound && !isLoadingLookup && (
              <div className="notice notice--warn otp-shake" role="alert">
                <IconAlertCircle size={19} />
                <div>Không tìm thấy sinh viên nào mang mã này. Kiểm tra lại MSSV.</div>
              </div>
            )}

            {found && !isLoadingLookup && (
              <div className="inset lookup">
                <div className="lookup__name">{tuition.studentName}</div>
                <div className="lookup__meta">
                  <span className="fig">{tuition.studentId}</span>
                  <span className={tuition.tuitionStatus === "PAID" ? "tag tag-success" : "tag tag-accent"}>
                    {tuition.tuitionStatus === "PAID" ? (
                      <IconCheckCircle size={15} />
                    ) : (
                      <IconAlertCircle size={15} />
                    )}
                    {tuition.tuitionStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* The slip is the thing being signed: it fills in as the form above is
            filled, carries the one figure that matters, and holds the action. */}
        <aside className="slip">
          <div className="card stub elev-md">
            <div className="card-kicker">
              <span className="step">3</span>
              Phiếu thu
            </div>

            {!found ? (
              <p className="slip__empty" style={{ margin: 0 }}>
                Nhập mã số sinh viên ở bước 2 để lập phiếu thu. Số tiền và số dư còn lại sẽ hiện ở đây
                trước khi bạn xác nhận.
              </p>
            ) : !unpaid ? (
              <div className="notice notice--ok">
                <IconCheckCircle size={19} />
                <div>Học phí của sinh viên này đã được thanh toán. Không cần lập phiếu mới.</div>
              </div>
            ) : (
              <div className="stagger-in">
                <div>
                  <Row label="Sinh viên" stack text>
                    {tuition.studentName}
                  </Row>
                  <Row label="Mã số">{tuition.studentId}</Row>
                </div>

                <hr className="perf" />

                <div className="meta-label">
                  <IconBanknote size={16} />
                  Số tiền thanh toán
                </div>
                <div className="fig fig-hero" style={{ color: "var(--color-accent)", marginTop: 4 }}>
                  {formatVnd(tuition.tuitionAmount)}
                </div>

                <hr className="perf" />

                <div>
                  <Row label="Số dư khả dụng">{formatVnd(availableBalance)}</Row>
                  <Row label="Còn lại sau giao dịch">
                    <span style={{ color: enoughBalance ? undefined : "var(--color-stamp)" }}>
                      {formatVnd(balanceAfter ?? 0)}
                    </span>
                  </Row>
                </div>
              </div>
            )}

            {unpaid && (
              <>
                <label className="radio slip__terms">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    disabled={!unpaid}
                  />
                  <span className="dot dot--check" style={{ borderRadius: 3, marginTop: 2 }} />
                  <span>Tôi đồng ý với điều khoản giao dịch và xác nhận thông tin trên là chính xác.</span>
                </label>

                {initiateMutation.isError && (
                  <div className="notice notice--warn" role="alert">
                    <IconAlertCircle size={19} />
                    <div>
                      {getApiErrorMessage(initiateMutation.error) ??
                        "Không tạo được giao dịch. Thử lại sau ít phút."}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Nothing left to sign once the tuition is paid — the notice above
                already says so, so the slip drops the action entirely rather
                than showing a button that can never be pressed. */}
            {(!found || unpaid) && (
              <div>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                >
                  {initiateMutation.isPending ? "Đang xử lý…" : "Xác nhận và gửi OTP"}
                </button>
                {unpaid && confirmHint && <div className="meta slip__hint">{confirmHint}</div>}
              </div>
            )}
          </div>

          <p className="slip__note">
            <IconWallet size={15} />
            Số dư khả dụng là số dư thực trừ phần đang giữ tạm cho các giao dịch chưa xác thực.
          </p>
        </aside>
      </div>
    </div>
  );
}
