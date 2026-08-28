import type { ReactNode, SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

// Icon set cho iBanking — line-art tối giản, dùng chung stroke 1.75 / currentColor
// để tự động ăn theo màu chữ hiện tại (label, accent, muted...) ở mọi nơi được đặt vào.
function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </Icon>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </Icon>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Icon>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h3l1.3 4.2-2 1.6a11 11 0 0 0 5.4 5.4l1.6-2 4.2 1.3v3a1.7 1.7 0 0 1-1.9 1.7A16 16 0 0 1 4.3 5.4 1.7 1.7 0 0 1 6 3.5Z" />
    </Icon>
  );
}

export function IconIdCard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <circle cx="8.5" cy="11" r="1.8" />
      <path d="M5.7 16c.5-1.4 1.6-2.1 2.8-2.1s2.3.7 2.8 2.1" />
      <path d="M14.5 9.8h4M14.5 13h4" />
    </Icon>
  );
}

export function IconGraduationCap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 9 12 5l9.5 4-9.5 4-9.5-4Z" />
      <path d="M6.5 11.3V16c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4.7" />
      <path d="M21.5 9v5.5" />
    </Icon>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z" />
      <path d="M16 12.2h3" />
      <path d="M14.5 5.5 12 3 4.5 7.2" />
    </Icon>
  );
}

export function IconBanknote(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M5.5 9v0M18.5 15v0" />
    </Icon>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.3 2.4 2.4 5-5.2" />
    </Icon>
  );
}

export function IconXCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Icon>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.4" />
      <path d="M12 16.3v.1" />
    </Icon>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4 21.5 20h-19Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.5v.1" />
    </Icon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.3 2" />
    </Icon>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6.5v5c0 5-3 7.7-7 8.9-4-1.2-7-3.9-7-8.9v-5Z" />
      <path d="m8.7 12.2 2.2 2.2 4.4-4.5" />
    </Icon>
  );
}

export function IconKey(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M10.8 12.7 18.5 5" />
      <path d="M15.3 8.5 18 5.8M17.7 10.9 21 7.6" />
    </Icon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5L19.5 8" />
      <path d="M19.5 4.5V8h-3.5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5L4.5 16" />
      <path d="M4.5 19.5V16H8" />
    </Icon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 20H5.7a1.7 1.7 0 0 1-1.7-1.7V5.7A1.7 1.7 0 0 1 5.7 4H9.5" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9.5" />
    </Icon>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 8v4.3l3 1.9" />
    </Icon>
  );
}

export function IconCreditCard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </Icon>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12.5 6.5 5h11L20 12.5" />
      <path d="M4 12.5v5a1.7 1.7 0 0 0 1.7 1.7h12.6A1.7 1.7 0 0 0 20 17.5v-5" />
      <path d="M4 12.5h5l1 2h4l1-2h5" />
    </Icon>
  );
}

export function IconFlask(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.5h4" />
      <path d="M10.5 4v6.2L5.8 18a1.8 1.8 0 0 0 1.6 2.7h9.2a1.8 1.8 0 0 0 1.6-2.7l-4.7-7.8V4" />
      <path d="M8.3 15.5h7.4" />
    </Icon>
  );
}
