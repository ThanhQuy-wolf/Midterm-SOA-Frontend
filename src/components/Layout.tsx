import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getAvailableBalance } from "../api/tuition";
import { formatVnd } from "../utils/format";
import { IconCreditCard, IconHistory, IconLogOut, IconWallet } from "./icons";

export function Layout() {
  const { payer, isAuthenticated, signOut } = useAuth();
  const location = useLocation();

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: getAvailableBalance,
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });

  const initials = (payer?.payerFullName ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {isAuthenticated && (
        <header className="nav appbar">
          <div className="nav-brand" style={{ marginRight: 0 }}>
            iBanking<span style={{ color: "var(--color-accent)" }}>.</span>
          </div>

          <nav className="appbar__links">
            <Link to="/payment" aria-current={location.pathname === "/payment" ? "page" : undefined}>
              <IconCreditCard size={19} />
              Thanh toán học phí
            </Link>
            <Link to="/history" aria-current={location.pathname === "/history" ? "page" : undefined}>
              <IconHistory size={19} />
              Lịch sử giao dịch
            </Link>
          </nav>

          <div className="appbar__id">
            <div className="avatar">{initials || <IconWallet size={18} />}</div>
            <div className="appbar__idtext">
              <div className="meta">{payer?.payerFullName}</div>
              <div className="fig fig-sm">
                {balanceQuery.data ? formatVnd(balanceQuery.data.availableBalance) : "—"}
              </div>
            </div>
          </div>

          <button type="button" className="btn btn-secondary" onClick={signOut}>
            <IconLogOut size={19} />
            <span className="appbar__signout">Đăng xuất</span>
          </button>
        </header>
      )}

      <main key={location.pathname} className="page-enter shell">
        <Outlet />
      </main>
    </div>
  );
}
