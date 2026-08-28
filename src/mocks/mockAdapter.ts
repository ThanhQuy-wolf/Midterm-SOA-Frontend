import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import type { Transaction, TransactionHistoryItem, TuitionLookupResult } from "../types/domain";
import { MOCK_CREDENTIALS, MOCK_INITIAL_BALANCE, MOCK_PAYER, MOCK_STUDENTS } from "./data";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const NETWORK_DELAY_MS = 250;

let ledgerBalance = MOCK_INITIAL_BALANCE;
let reservedBalance = 0;
const students: TuitionLookupResult[] = MOCK_STUDENTS.map((s) => ({ ...s }));
const transactions = new Map<string, Transaction>();
// Mã OTP hiện tại cho mỗi giao dịch — tách riêng khỏi Transaction vì backend thật sẽ không
// bao giờ trả mã OTP về cho FE. Chỉ dùng để lộ ra UI test, xem getMockOtp() bên dưới.
const otpCodes = new Map<string, string>();
let nextTransactionSeq = 1;

function availableBalance(): number {
  return ledgerBalance - reservedBalance;
}

function generateOtp(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

// MOCK ONLY — xóa cùng với thư mục src/mocks khi tích hợp backend thật.
// Cho phép UI hiển thị mã OTP hiện tại của một giao dịch để test mà không cần xem console/email.
export function getMockOtp(transactionId: string): string | undefined {
  return otpCodes.get(transactionId);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

function findStudent(studentId: string) {
  return students.find((s) => s.studentId === studentId);
}

function respond<T>(config: InternalAxiosRequestConfig, status: number, data: T): Promise<AxiosResponse<T>> {
  return Promise.resolve({
    data,
    status,
    statusText: "OK",
    headers: {},
    config,
  } as AxiosResponse<T>);
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string): Promise<never> {
  const response = {
    data: { message },
    status,
    statusText: message,
    headers: {},
    config,
  } as AxiosResponse;
  return Promise.reject(new AxiosError(message, String(status), config, {}, response));
}

// Custom axios adapter — thay thế network call bằng dữ liệu mock trong bộ nhớ.
// Bật qua VITE_USE_MOCK=true (xem src/api/client.ts).
export async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method ?? "get").toLowerCase();
  const url = (config.url ?? "").split("?")[0];
  const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : (config.data ?? {});

  await new Promise((resolve) => setTimeout(resolve, NETWORK_DELAY_MS));

  if (method === "post" && url === "/auth/login") {
    const { username, password } = body as { username: string; password: string };
    if (username === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password) {
      return respond(config, 200, {
        accessToken: `mock-token-${Date.now()}`,
        payer: MOCK_PAYER,
      });
    }
    return fail(config, 401, "Invalid username or password");
  }

  if (method === "post" && url === "/auth/logout") {
    return respond(config, 200, {});
  }

  const tuitionMatch = url.match(/^\/tuitions\/([^/]+)$/);
  if (method === "get" && tuitionMatch) {
    const studentId = decodeURIComponent(tuitionMatch[1]);
    const student = findStudent(studentId);
    if (!student) return fail(config, 404, "Student not found");
    return respond(config, 200, { ...student });
  }

  if (method === "get" && url === "/accounts/me/available-balance") {
    return respond(config, 200, { availableBalance: availableBalance() });
  }

  if (method === "post" && url === "/transactions") {
    const { studentId } = body as { studentId: string };
    const student = findStudent(studentId);
    if (!student) return fail(config, 404, "Student not found");
    if (student.tuitionStatus === "PAID") return fail(config, 409, "Tuition already paid");

    const transactionId = `TXN${String(nextTransactionSeq++).padStart(6, "0")}`;
    const now = Date.now();
    const transaction: Transaction = {
      transactionId,
      studentId: student.studentId,
      studentName: student.studentName,
      amountToPay: student.tuitionAmount,
      status: "OTP_SENT",
      createdAt: new Date(now).toISOString(),
      maskedEmail: maskEmail(MOCK_PAYER.payerEmail),
      otpExpiresAt: new Date(now + OTP_TTL_MS).toISOString(),
      attemptsLeft: MAX_OTP_ATTEMPTS,
    };
    reservedBalance += transaction.amountToPay;
    transactions.set(transactionId, transaction);
    otpCodes.set(transactionId, generateOtp());
    return respond(config, 200, { ...transaction });
  }

  const verifyMatch = url.match(/^\/transactions\/([^/]+)\/verify-otp$/);
  if (method === "post" && verifyMatch) {
    const transaction = transactions.get(verifyMatch[1]);
    if (!transaction) return fail(config, 404, "Transaction not found");
    const { otp } = body as { otp: string };

    if (transaction.status !== "OTP_SENT") return respond(config, 200, { ...transaction });

    const expired = !!transaction.otpExpiresAt && Date.now() >= new Date(transaction.otpExpiresAt).getTime();
    if (expired) {
      reservedBalance -= transaction.amountToPay;
      transaction.status = "EXPIRED";
      transaction.failureReason = "OTP_EXPIRED";
      otpCodes.delete(transaction.transactionId);
      return respond(config, 200, { ...transaction });
    }

    if (otp === otpCodes.get(transaction.transactionId)) {
      reservedBalance -= transaction.amountToPay;
      ledgerBalance -= transaction.amountToPay;
      transaction.status = "COMPLETED";
      const student = findStudent(transaction.studentId);
      if (student) student.tuitionStatus = "PAID";
      otpCodes.delete(transaction.transactionId);
      return respond(config, 200, { ...transaction });
    }

    transaction.attemptsLeft = Math.max((transaction.attemptsLeft ?? MAX_OTP_ATTEMPTS) - 1, 0);
    if (transaction.attemptsLeft <= 0) {
      reservedBalance -= transaction.amountToPay;
      transaction.status = "FAILED";
      transaction.failureReason = "OTP_LOCKED";
      otpCodes.delete(transaction.transactionId);
    }
    return respond(config, 200, { ...transaction });
  }

  const resendMatch = url.match(/^\/transactions\/([^/]+)\/resend-otp$/);
  if (method === "post" && resendMatch) {
    const transaction = transactions.get(resendMatch[1]);
    if (!transaction) return fail(config, 404, "Transaction not found");
    if (transaction.status === "OTP_SENT") {
      transaction.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
      // Mã cũ không còn hiệu lực — sinh mã mới, không reset số lần thử (khớp UI hint hiện tại).
      otpCodes.set(transaction.transactionId, generateOtp());
    }
    return respond(config, 200, { ...transaction });
  }

  const cancelMatch = url.match(/^\/transactions\/([^/]+)\/cancel$/);
  if (method === "post" && cancelMatch) {
    const transaction = transactions.get(cancelMatch[1]);
    if (!transaction) return fail(config, 404, "Transaction not found");
    if (transaction.status === "OTP_SENT" || transaction.status === "INITIATED") {
      reservedBalance -= transaction.amountToPay;
      transaction.status = "CANCELLED";
      otpCodes.delete(transaction.transactionId);
    }
    return respond(config, 200, { ...transaction });
  }

  // Phải khớp trước /transactions/:id bên dưới — "me" cũng khớp [^/]+.
  if (method === "get" && url === "/transactions/me") {
    const history: TransactionHistoryItem[] = Array.from(transactions.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => ({
        transactionId: t.transactionId,
        createdAt: t.createdAt,
        studentId: t.studentId,
        amountToPay: t.amountToPay,
        status: t.status,
      }));
    return respond(config, 200, history);
  }

  const getTxMatch = url.match(/^\/transactions\/([^/]+)$/);
  if (method === "get" && getTxMatch) {
    const transaction = transactions.get(getTxMatch[1]);
    if (!transaction) return fail(config, 404, "Transaction not found");
    return respond(config, 200, { ...transaction });
  }

  return fail(config, 404, `Mock endpoint not implemented: ${method.toUpperCase()} ${url}`);
}
