import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { PaymentPage } from "./pages/PaymentPage";
import { OtpVerificationPage } from "./pages/OtpVerificationPage";
import { TransactionResultPage } from "./pages/TransactionResultPage";
import { TransactionHistoryPage } from "./pages/TransactionHistoryPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/otp" element={<OtpVerificationPage />} />
          <Route path="/result" element={<TransactionResultPage />} />
          <Route path="/history" element={<TransactionHistoryPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/payment" replace />} />
        <Route path="*" element={<Navigate to="/payment" replace />} />
      </Route>
    </Routes>
  );
}
