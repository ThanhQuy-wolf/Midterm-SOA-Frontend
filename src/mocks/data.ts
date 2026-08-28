import type { Payer, TuitionLookupResult } from "../types/domain";

// Tài khoản đăng nhập mock — username "nguyenvana", mật khẩu "123456" (1->6).
export const MOCK_CREDENTIALS = {
  username: "nguyenvana",
  password: "123456",
};

export const MOCK_PAYER: Payer = {
  payerFullName: "Nguyễn Văn A",
  payerPhone: "0901234567",
  payerEmail: "nguyenvana@example.com",
};

// Số dư khả dụng ban đầu: 1 tỷ VND để test thoải mái.
export const MOCK_INITIAL_BALANCE = 1_000_000_000;

// 3 sinh viên mock — học phí và trạng thái khác nhau để test các nhánh UI.
export const MOCK_STUDENTS: TuitionLookupResult[] = [
  {
    studentId: "52100001",
    studentName: "Trần Thị Bình",
    tuitionAmount: 15_000_000,
    tuitionStatus: "UNPAID",
  },
  {
    studentId: "52100002",
    studentName: "Lê Minh Châu",
    tuitionAmount: 45_800_000,
    tuitionStatus: "UNPAID",
  },
  {
    studentId: "52100003",
    studentName: "Phạm Quốc Dũng",
    tuitionAmount: 8_200_000,
    tuitionStatus: "PAID",
  },
];
