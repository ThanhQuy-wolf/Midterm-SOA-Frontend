import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { login } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { IconAlertCircle, IconFlask, IconLock, IconUser } from "../components/icons";

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      signIn(data.accessToken, data.userId, data.payer);
      navigate("/payment", { replace: true });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate({ username, password });
  }

  return (
    <div className="auth-shell">
      {/* /login sits outside the app bar, so the wordmark has to appear here
          or the screen carries no identity at all. */}
      <div className="auth-brand">
        iBanking<span style={{ color: "var(--color-accent)" }}>.</span>
      </div>

      <div className="card auth-card">
        <div className="stamp auth-card__seal">SCR-01</div>

        <header>
          <h1 style={{ fontSize: "var(--fs-title)", margin: 0 }}>Đăng nhập</h1>
          <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
            Tra cứu và đóng học phí bằng tài khoản iBanking của bạn.
          </p>
        </header>

        <form onSubmit={handleSubmit} autoComplete="off" className="auth-form">
          <div className="field">
            <label htmlFor="login-username">Tên đăng nhập</label>
            <div className="field-icon">
              <IconUser size={19} />
              <input
                id="login-username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="login-password">Mật khẩu</label>
            <div className="field-icon">
              <IconLock size={19} />
              <input
                id="login-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
          </div>

          {loginMutation.isError && (
            <div className="notice notice--warn otp-shake" role="alert">
              <IconAlertCircle size={19} />
              <div>Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại và thử lần nữa.</div>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </div>

      {import.meta.env.DEV && (
        <div className="card stub auth-demo">
          <div className="card-kicker mock-badge">
            <IconFlask size={15} />
            Tài khoản demo
          </div>
          <dl className="demo-list">
            <dt>
              <code>524h0088</code> / <code>123456</code>
            </dt>
            <dd>Số dư 100.000.000, học phí HK1-2526 chưa đóng</dd>
            <dt>
              <code>524h0456</code> / <code>123456</code>
            </dt>
            <dd>Dựng sẵn tình huống thiếu số dư</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
