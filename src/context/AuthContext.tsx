import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Payer } from "../types/domain";

interface AuthContextValue {
  payer: Payer | null;
  userId: string | null;
  isAuthenticated: boolean;
  signIn: (accessToken: string, userId: string, payer: Payer) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface StoredSession {
  userId: string;
  payer: Payer;
}

// Token, userId và payer đi cùng nhau trong localStorage: có token mà không rehydrate lại
// userId/payer sẽ khiến session bị coi là "hết hạn" mỗi khi refresh trang dù token vẫn còn.
function loadStoredSession(): StoredSession | null {
  const token = localStorage.getItem("accessToken");
  const userId = localStorage.getItem("userId");
  const raw = localStorage.getItem("payer");
  if (!token || !userId || !raw) return null;
  try {
    return { userId, payer: JSON.parse(raw) as Payer };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(loadStoredSession);

  const value = useMemo<AuthContextValue>(
    () => ({
      payer: session?.payer ?? null,
      userId: session?.userId ?? null,
      isAuthenticated: session !== null,
      signIn: (accessToken, userId, nextPayer) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("userId", userId);
        localStorage.setItem("payer", JSON.stringify(nextPayer));
        setSession({ userId, payer: nextPayer });
      },
      signOut: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userId");
        localStorage.removeItem("payer");
        setSession(null);
      },
    }),
    [session],
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
