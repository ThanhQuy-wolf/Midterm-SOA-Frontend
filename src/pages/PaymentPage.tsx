import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { getAvailableBalance, lookupTuitionByStudentId } from "../api/tuition";
import { TuitionChangedError, initiateTransaction } from "../api/transaction";
import { getApiErrorMessage, getApiErrorRetryAfterSeconds, getApiErrorStatus } from "../api/client";
import { formatDate, formatDuration, formatVnd } from "../utils/format";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBanknote,
  IconCheckCircle,
  IconClock,
  IconGraduationCap,
  IconIdCard,
  IconWallet,
} from "../components/icons";

// Màn OTP đẩy người dùng về đây khi giao dịch cũ hết lượt thử (HTTP 429).
interface PaymentLocationState {
  notice?: { kind: "otp-locked"; retryAfterSeconds?: number };
}

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const { payer } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const debouncedStudentId = useDebouncedValue(studentId.trim());

  // Giữ thông báo "hết lượt thử OTP" vào state cục bộ rồi xoá khỏi history ngay,
  // để F5 hoặc quay lại trang không làm nó hiện lại như một sự kiện vừa xảy ra.
  const [lockNotice] = useState(() => (location.state as PaymentLocationState | null)?.notice ?? null);
  useEffect(() => {
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rate limit gửi OTP (429 ở /payments/initiate). Backend cho biết phải chờ bao
  // lâu qua retryAfterSeconds, nên hiển thị đếm ngược thật thay vì câu tĩnh.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt === null || now >= retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt, now]);
  const retryMsLeft = retryAt === null ? 0 : Math.max(0, retryAt - now);
  const rateLimited = retryMsLeft > 0;

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: getAvailableBalance,
    refetchOnMount: "always",
  });

  // Contract: MSSV là 3 số + 1 chữ + 4 số (VD 524H0001). Backend trả 404 cho cả mã
  // sai định dạng lẫn mã không tồn tại, nên nếu để query chạy thì người dùng gõ
  // "abc123" cũng chỉ thấy "không tìm thấy sinh viên" — sai nguyên nhân. Chặn ở đây
  // để báo đúng lỗi định dạng và khỏi bắn 2 request rác lên gateway.
  const malformedStudentId =
    debouncedStudentId.length > 0 && !/^\d{3}[A-Za-z]\d{4}$/.test(debouncedStudentId);

  const tuitionQuery = useQuery({
    queryKey: ["tuition-lookup", debouncedStudentId],
    queryFn: () => lookupTuitionByStudentId(debouncedStudentId),
    enabled: debouncedStudentId.length > 0 && !malformedStudentId,
    retry: false,
  });

  const initiateMutation = useMutation({
    mutationFn: initiateTransaction,
    onSuccess: (transaction) => {
      navigate("/otp", { state: { transaction } });
    },
    onError: (error) => {
      // Khoản học phí đã đổi giữa lúc xem và lúc xác nhận: nạp lại phiếu thu để
      // người dùng thấy khoản mới, và bắt họ tick lại điều khoản cho khoản đó.
      if (error instanceof TuitionChangedError) {
        setAgreedToTerms(false);
        tuitionQuery.refetch();
        return;
      }
      // 429 ở initiate = vượt hạn mức gửi OTP theo giờ. Khoá nút cho tới khi
      // hết thời gian chờ backend chỉ định, thay vì để người dùng bấm lại vô ích.
      if (getApiErrorStatus(error) !== 429) return;
      const seconds = getApiErrorRetryAfterSeconds(error);
      if (seconds !== undefined) {
        setNow(Date.now());
        setRetryAt(Date.now() + seconds * 1000);
      }
    },
  });

  const tuition = tuitionQuery.data;
  const isLoadingLookup = tuitionQuery.isFetching;
  const notFound = tuitionQuery.isError && debouncedStudentId.length > 0;
  const found = !!tuition;
  const unpaid = found && tuition.tuitionStatus === "UNPAID";
  const availableBalance = balanceQuery.data?.availableBalance ?? 0;
  const enoughBalance = unpaid && availableBalance >= tuition.tuitionAmount;
  const canConfirm = enoughBalance && agreedToTerms && !rateLimited && !initiateMutation.isPending;

  let confirmHint = "";
  if (malformedStudentId) confirmHint = "MSSV phải gồm 3 số, 1 chữ cái rồi 4 số (VD 524H0001).";
  else if (!found) confirmHint = "Nhập MSSV hợp lệ để tiếp tục.";
  else if (!unpaid) confirmHint = "Khoản học phí đã được thanh toán.";
  else if (!enoughBalance) confirmHint = "Số dư khả dụng không đủ.";
  else if (rateLimited) confirmHint = `Thử lại sau ${formatDuration(retryMsLeft / 1000)}.`;
  else if (!agreedToTerms) confirmHint = "Cần đồng ý điều khoản.";

  function handleConfirm() {
    if (!canConfirm || !tuition) return;
    initiateMutation.mutate(
      {
        studentId: tuition.studentId,
        studentName: tuition.studentName,
        expectedTuitionId: tuition.tuitionId,
      },
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

      {lockNotice?.kind === "otp-locked" && (
        <div className="notice notice--warn payment-banner" role="alert">
          <IconAlertTriangle size={19} />
          <div>
            Giao dịch trước đã dùng hết lượt thử OTP và không tiếp tục được. Hãy tạo giao dịch mới bên
            dưới.
            {lockNotice.retryAfterSeconds !== undefined &&
              ` Nếu vẫn bị chặn, thử lại sau ${formatDuration(lockNotice.retryAfterSeconds)}.`}
          </div>
        </div>
      )}

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

            {malformedStudentId && (
              <div className="notice notice--warn otp-shake" role="alert">
                <IconAlertCircle size={19} />
                <div>MSSV phải gồm 3 số, 1 chữ cái rồi 4 số — ví dụ 524H0001.</div>
              </div>
            )}

            {notFound && !isLoadingLookup && !malformedStudentId && (
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
                  {/* Trạng thái là của một khoản học phí, không phải của sinh viên:
                      gắn học kỳ vào cùng badge để không đọc thành "sinh viên này
                      chưa đóng học phí" trong khi họ còn nợ vài kỳ khác. */}
                  <span className={tuition.tuitionStatus === "PAID" ? "tag tag-success" : "tag tag-accent"}>
                    {tuition.tuitionStatus === "PAID" ? (
                      <IconCheckCircle size={15} />
                    ) : (
                      <IconAlertCircle size={15} />
                    )}
                    <span className="fig">{tuition.semester}</span>
                    {tuition.tuitionStatus === "PAID" ? "· Đã thanh toán" : "· Chưa thanh toán"}
                  </span>
                </div>
                {unpaid && tuition.outstandingCount > 1 && (
                  <div className="lookup__meta">
                    Sinh viên còn <span className="fig">{tuition.outstandingCount}</span> khoản chưa đóng,
                    tổng <span className="fig">{formatVnd(tuition.outstandingTotal)}</span>.
                  </div>
                )}
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

                {/* Khoản đang thu phải tự định danh được: cùng một sinh viên có thể
                    bị thu số tiền khác nhau tuỳ học kỳ nào đến lượt. */}
                <div className="meta-label">
                  <IconGraduationCap size={16} />
                  Khoản đang thu
                </div>
                <div className="fig" style={{ marginTop: 4, fontSize: "var(--fs-lg)" }}>
                  {tuition.semester}
                </div>
                {tuition.dueDate && (
                  <div className="meta" style={{ marginTop: 2 }}>
                    Hạn đóng <span className="fig">{formatDate(tuition.dueDate)}</span>
                  </div>
                )}

                <hr className="perf" />

                <div className="meta-label">
                  <IconBanknote size={16} />
                  Số tiền thanh toán
                </div>
                <div className="fig fig-hero" style={{ color: "var(--color-accent)", marginTop: 4 }}>
                  {formatVnd(tuition.tuitionAmount)}
                </div>

                <hr className="perf" />

                {tuition.outstandingCount > 1 && (
                  <div className="inset inset--muted" style={{ marginBottom: "var(--space-4)" }}>
                    <div style={{ fontSize: "var(--fs-sm)", lineHeight: 1.6 }}>
                      Sinh viên còn <span className="fig">{tuition.outstandingCount}</span> khoản chưa
                      đóng, tổng <span className="fig">{formatVnd(tuition.outstandingTotal)}</span>. Hệ
                      thống thu theo thứ tự hạn đóng — kỳ cũ trước, nên phiếu này chỉ đóng được khoản{" "}
                      <span className="fig">{tuition.semester}</span>.
                    </div>
                  </div>
                )}

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

                {/* Khi bị chặn theo hạn mức, đếm ngược tự nó là thông tin hữu
                    ích nhất — nó thay cho câu "vui lòng thử lại sau" không số. */}
                {rateLimited ? (
                  <div className="notice notice--warn" role="alert">
                    <IconClock size={19} />
                    <div>
                      Bạn đã gửi quá nhiều yêu cầu OTP. Thử lại sau{" "}
                      <span className="fig">{formatDuration(retryMsLeft / 1000)}</span>.
                    </div>
                  </div>
                ) : (
                  initiateMutation.isError && (
                    <div className="notice notice--warn otp-shake" role="alert">
                      <IconAlertCircle size={19} />
                      <div>
                        {initiateMutation.error instanceof TuitionChangedError
                          ? initiateMutation.error.message
                          : getApiErrorMessage(initiateMutation.error) ??
                            "Không tạo được giao dịch. Thử lại sau ít phút."}
                      </div>
                    </div>
                  )
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
