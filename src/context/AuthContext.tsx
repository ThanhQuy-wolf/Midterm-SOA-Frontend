import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Payer } from "../types/domain";

interface AuthContextValue {
  payer: Payer | null;
  isAuthenticated: boolean;
  signIn: (accessToken: string, payer: Payer) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Token và payer đi cùng nhau trong localStorage: có token mà không rehydrate lại payer
// sẽ khiến session bị coi là "hết hạn" mỗi khi refresh trang dù token vẫn còn hiệu lực.
function loadStoredPayer(): Payer | null {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;
  const raw = localStorage.getItem("payer");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Payer;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [payer, setPayer] = useState<Payer | null>(loadStoredPayer);

  const value = useMemo<AuthContextValue>(
    () => ({
      payer,
      isAuthenticated: payer !== null,
      signIn: (accessToken, nextPayer) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("payer", JSON.stringify(nextPayer));
        setPayer(nextPayer);
      },
      signOut: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("payer");
        setPayer(null);
      },
    }),
    [payer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
