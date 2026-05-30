import type { SVGProps } from 'react';

type OneMilIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  active?: boolean;
};

const SILVER = '#BFC6CF';
const PLATINUM = '#E7EBF0';
const ORANGE = '#FF8A00';
const AMBER = '#FFB547';

function iconColor(active?: boolean, color?: string) {
  return color ?? (active ? ORANGE : SILVER);
}

function accentColor(active?: boolean) {
  return active ? AMBER : ORANGE;
}

function BaseIcon({
  size = 24,
  active = false,
  className,
  children,
  viewBox = '0 0 24 24',
  ...props
}: OneMilIconProps & { children: React.ReactNode }) {
  const color = iconColor(active, props.color);

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
      color={color}
    >
      {children}
    </svg>
  );
}

export function OneMilTrophyIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M8 4h8v3.8c0 3.8-1.6 6.3-4 7.2-2.4-.9-4-3.4-4-7.2V4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 6H5.8C4.8 6 4 6.8 4 7.8v.4c0 2.3 1.8 4.2 4.1 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 6h2.2c1 0 1.8.8 1.8 1.8v.4c0 2.3-1.8 4.2-4.1 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 15v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 20h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M13.6 5.3 10.9 12h2.2l-2.7 5.7" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilWinIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="m12 3.4 2.45 5.05 5.55.8-4.02 3.92.95 5.53L12 16.1 7.07 18.7l.95-5.53L4 9.25l5.55-.8L12 3.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m12 8.8.75 1.55 1.7.25-1.22 1.2.29 1.68L12 12.68l-1.52.8.29-1.68-1.22-1.2 1.7-.25L12 8.8Z" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilVoucherIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M4.5 7.2h15a1.5 1.5 0 0 1 1.5 1.5v2.1a2.2 2.2 0 0 0 0 4.4v2.1a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.3v-2.1a2.2 2.2 0 0 0 0-4.4V8.7a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 8.2v7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2" />
      <path d="M18.2 12h.02" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilWalletIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M4 8.2c0-1.1.9-2 2-2h10.6c1 0 1.8.8 1.8 1.8v1.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 8.4h14.6c.8 0 1.4.6 1.4 1.4v7.4c0 .9-.7 1.6-1.6 1.6H6c-1.1 0-2-.9-2-2V8.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.8 12.2H21v3.6h-4.2a1.8 1.8 0 1 1 0-3.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17.1 14h.02" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilMessageIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M5.2 6.2h13.6c1 0 1.8.8 1.8 1.8v7.1c0 1-.8 1.8-1.8 1.8h-7.3l-4.2 3v-3H5.2c-1 0-1.8-.8-1.8-1.8V8c0-1 .8-1.8 1.8-1.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.4 11.7h.02M12 11.7h.02M15.6 11.7h.02" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilProfileIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = active ? ORANGE : PLATINUM;

  return (
    <BaseIcon {...props}>
      <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.6 20.3c.8-3.6 3.7-5.6 7.4-5.6s6.6 2 7.4 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 6.1v.01" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilHomeIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M3.8 11.1 12 4.2l8.2 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 10.8v8.4h11.6v-8.4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10.1 19.2v-5h3.8v5" stroke={accent} strokeWidth="1.7" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilHeartIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = active ? ORANGE : 'currentColor';

  return (
    <BaseIcon {...props}>
      <path d="M12 20.2S4.2 15.7 4.2 9.4c0-2.5 1.9-4.4 4.2-4.4 1.5 0 2.8.8 3.6 2 .8-1.2 2.1-2 3.6-2 2.3 0 4.2 1.9 4.2 4.4 0 6.3-7.8 10.8-7.8 10.8Z" stroke={accent} strokeWidth="1.7" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilGiftIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M4 10h16v10H4V10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 7h18v3H3V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 7v13" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7c-1.8 0-3.2-.8-3.2-2.1 0-1 .8-1.7 1.8-1.7 1.3 0 2.4 1.4 1.4 3.8Z" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 7c1.8 0 3.2-.8 3.2-2.1 0-1-.8-1.7-1.8-1.7-1.3 0-2.4 1.4-1.4 3.8Z" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilDiamondIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M7.2 4.8h9.6l4 5.2L12 20.2 3.2 10l4-5.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.2 5 12 20M15.8 5 12 20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 5v5" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilZapIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = active ? ORANGE : 'currentColor';

  return (
    <BaseIcon {...props}>
      <path d="M13.4 3.7 5.6 13h6l-1 7.3 7.8-9.6h-6l1-7Z" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilShieldIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M12 3.8 19 6v5.4c0 4.3-2.8 7.5-7 9-4.2-1.5-7-4.7-7-9V6l7-2.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m12 8.2.9 1.8 2 .3-1.45 1.42.34 2L12 12.78l-1.79.94.34-2L9.1 10.3l2-.3.9-1.8Z" stroke={accent} strokeWidth="1.3" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilInfoIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10.4v5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 7.6h.02" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilFilterIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = active ? ORANGE : 'currentColor';

  return (
    <BaseIcon {...props}>
      <path d="M4 6h16l-6.4 7.2v4.4l-3.2 1.8v-6.2L4 6Z" stroke={accent} strokeWidth="1.7" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilMioCoinIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);
  const main = active ? ORANGE : SILVER;

  return (
    <BaseIcon {...props}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke={main} strokeWidth="1.7" />
      <path d="M7.7 15.7V8.3h1.7l2.6 4.2 2.6-4.2h1.7v7.4" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.4 8.3v7.4M14.6 8.3v7.4" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilCoinsIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <ellipse cx="9" cy="7" rx="4.4" ry="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.6 7v4.2c0 1.2 2 2.2 4.4 2.2s4.4-1 4.4-2.2V7" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="15" cy="12.5" rx="4.4" ry="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.6 12.5v4.2c0 1.2 2 2.2 4.4 2.2s4.4-1 4.4-2.2v-4.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 12.5h.02" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilCartIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M4 5h2.2l1.4 9.2h9.8l2.1-6.2H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 19.2h.02M17 19.2h.02" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilEmailIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m4.2 8 7.8 5.4L19.8 8" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilCrownIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M3.4 17h17.2l-2-9.5-4.6 4.5L12 5.2l-2 6.8L5.4 7.5 3.4 17Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.4 17h17.2" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 5.2v.01" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilStarIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="m12 3.4 2.45 5.05 5.55.8-4.02 3.92.95 5.53L12 16.1 7.07 18.7l.95-5.53L4 9.25l5.55-.8L12 3.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m12 8.5.75 1.55 1.7.25-1.23 1.2.29 1.68L12 12.38l-1.51.8.29-1.68-1.23-1.2 1.7-.25L12 8.5Z" stroke={accent} strokeWidth="1.3" strokeLinejoin="round" />
    </BaseIcon>
  );
}

export function OneMilMedalIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="9.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 14.2 7 21l5-2.8 5 2.8-1.5-6.8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 7v.01" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10.2 9.5h3.6" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilTicketIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M3.5 8.6A1.5 1.5 0 0 1 5 7.1h14A1.5 1.5 0 0 1 20.5 8.6v1.6a2.3 2.3 0 0 0 0 4.6v1.6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16.4v-1.6a2.3 2.3 0 0 0 0-4.6V8.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15 7v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2.5 2" />
      <path d="M8.5 12h4" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
    </BaseIcon>
  );
}

export function OneMilBellIcon(props: OneMilIconProps) {
  const active = props.active ?? false;
  const accent = accentColor(active);

  return (
    <BaseIcon {...props}>
      <path d="M18 10.6c0-3.2-2.2-5.5-6-5.5s-6 2.3-6 5.5v4.2l-1.7 2.4h15.4L18 14.8v-4.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 20h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 14.7h.02" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
    </BaseIcon>
  );
}
