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
        <header
          className="nav"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <div className="nav-brand" style={{ marginRight: "var(--space-6)" }}>
            iBanking<span style={{ color: "var(--color-accent)" }}>.</span>
          </div>
          <nav style={{ display: "flex", gap: 25, marginRight: "auto" }}>
            <Link
              to="/payment"
              aria-current={location.pathname === "/payment" ? "page" : undefined}
              style={{ fontSize: 21 }}
            >
              <IconCreditCard size={22} />
              Thanh toán học phí
            </Link>
            <Link
              to="/history"
              aria-current={location.pathname === "/history" ? "page" : undefined}
              style={{ fontSize: 21 }}
            >
              <IconHistory size={22} />
              Lịch sử giao dịch
            </Link>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-8) * 1.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 17,
                  fontFamily: "var(--font-heading)",
                  fontWeight: "var(--font-heading-weight)",
                  color: "var(--color-accent)",
                  background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                }}
              >
                {initials || <IconWallet size={20} />}
              </div>
              <div style={{ textAlign: "right", lineHeight: 1.3 }}>
                <div style={{ fontSize: 20 }}>{payer?.payerFullName}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    justifyContent: "flex-end",
                    fontSize: 18,
                    color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                  }}
                >
                  <IconWallet size={18} />
                  {balanceQuery.data ? (
                    <>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-text)" }}>
                        {formatVnd(balanceQuery.data.availableBalance)}
                      </span>
                      &nbsp;khả dụng
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={signOut}
              style={{ paddingLeft: 10, paddingRight: 10 }}
            >
              <IconLogOut size={21} />
              Đăng xuất
            </button>
          </div>
        </header>
      )}
      <main
        key={location.pathname}
        className="page-enter"
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1180,
          margin: "0 auto",
          padding: "calc(var(--space-8) * 1.5) calc(var(--space-8) * 1.8) calc(var(--space-8) * 2.5)",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
