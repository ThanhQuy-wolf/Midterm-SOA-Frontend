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
      signIn(data.accessToken, data.payer);
      navigate("/payment", { replace: true });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate({ username, password });
  }

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", paddingTop: "var(--space-6)", textAlign: "center" }}>
      <div className="stamp">SCR-01</div>
      <h1 style={{ fontSize: 50, lineHeight: 1.1, margin: "0 0 6px" }}>Đăng nhập</h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          fontSize: 20,
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        Đăng nhập vào hệ thống iBanking
      </p>

      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", textAlign: "left" }}
      >
        <div className="field">
          <label>Tên đăng nhập</label>
          <div className="field-icon">
            <IconUser size={22} />
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <div className="field-icon">
            <IconLock size={22} />
            <input
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
          <div className="notice otp-shake">
            <IconAlertCircle size={22} />
            <div>Tên đăng nhập hoặc mật khẩu không đúng.</div>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>

      {import.meta.env.VITE_USE_MOCK === "true" && (
        <div
          className="card"
          style={{ marginTop: "var(--space-4)", textAlign: "left", fontSize: 18, lineHeight: 1.7 }}
        >
          <div className="card-kicker mock-badge">
            <IconFlask size={18} />
            Dữ liệu thử nghiệm
          </div>
          <div>
            Tên đăng nhập: <code>nguyenvana</code> · Mật khẩu: <code>123456</code>
          </div>
          <div>
            Số dư khả dụng: <span style={{ fontFamily: "var(--font-mono)" }}>1.000.000.000 ₫</span>
          </div>
          <div>
            MSSV test: <code>52100001</code>, <code>52100002</code> (chưa thanh toán) ·{" "}
            <code>52100003</code> (đã thanh toán)
          </div>
        </div>
      )}
    </div>
  );
}
