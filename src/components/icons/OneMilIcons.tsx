/**
 * OneMil Premium Icon System
 * Brand: dark luxury, outline style, Silver/Platinum inactive, Orange active/CTA
 * Usage: <OneMilTrophyIcon size={24} className="text-[#FF8A00]" />
 * All icons accept: size, className, color, strokeWidth
 */

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}

const base = (
  size: number,
  className: string,
  color: string,
  strokeWidth: number,
  children: React.ReactNode
) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

// ── Navigation ─────────────────────────────────────────────────────────────

export const OneMilHomeIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  <polyline points="9 22 9 12 15 12 15 22" />
</>);

export const OneMilTicketIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z" />
</>);

export const OneMilTrophyIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M6 9H3l1 5c.4 2.5 2.1 4 4 4h8c1.9 0 3.6-1.5 4-4l1-5h-3" />
  <path d="M6 9V6" />
  <path d="M18 9V6" />
  <path d="M8 13c.5 1.2 1.8 2 4 2s3.5-.8 4-2" />
  <line x1="12" y1="18" x2="12" y2="21" />
  <line x1="8" y1="21" x2="16" y2="21" />
</>);

export const OneMilMedalIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <circle cx="12" cy="9" r="5" />
  <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
</>);

export const OneMilMessageIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
</>);

export const OneMilProfileIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
  <circle cx="12" cy="7" r="4" />
</>);

// ── Commerce & Rewards ─────────────────────────────────────────────────────

export const OneMilGiftIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <polyline points="20 12 20 22 4 22 4 12" />
  <rect x="2" y="7" width="20" height="5" />
  <line x1="12" y1="22" x2="12" y2="7" />
  <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
  <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
</>);

export const OneMilVoucherIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
  <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth={3} />
</>);

export const OneMilHeartIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
</>);

export const OneMilCartIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <circle cx="9" cy="21" r="1" />
  <circle cx="20" cy="21" r="1" />
  <path d="M1 1h4l2.68 13.39a2 2 0 001.95 1.61h9.74a2 2 0 001.95-1.61L23 6H6" />
</>);

// ── Finance ────────────────────────────────────────────────────────────────

export const OneMilWalletIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M21 12V7H5a2 2 0 010-4h14v4" />
  <path d="M3 5v14a2 2 0 002 2h16v-5" />
  <path d="M18 12a2 2 0 000 4h4v-4z" />
</>);

export const OneMilCoinsIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <circle cx="8" cy="8" r="6" />
  <path d="M18.09 10.37A6 6 0 1110.34 18" />
  <path d="M7 6h1v4" />
  <line x1="16.71" y1="13.88" x2="17.09" y2="14.28" />
</>);

/** Alias for MioCoin visual */
export const OneMilMioCoinIcon = OneMilCoinsIcon;

// ── Security & Trust ───────────────────────────────────────────────────────

export const OneMilShieldIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
</>);

// ── Communication ──────────────────────────────────────────────────────────

export const OneMilBellIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
  <path d="M13.73 21a2 2 0 01-3.46 0" />
</>);

export const OneMilEmailIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
  <polyline points="22,6 12,13 2,6" />
</>);

export const OneMilInfoIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <circle cx="12" cy="12" r="10" />
  <line x1="12" y1="8" x2="12" y2="12" />
  <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={3} />
</>);

// ── Premium & Status ───────────────────────────────────────────────────────

export const OneMilCrownIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7z" />
  <line x1="2" y1="20" x2="22" y2="20" />
</>);

export const OneMilDiamondIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <path d="M6 3h12l4 6-10 13L2 9z" />
  <path d="M2 9h20" />
  <path d="M6 3l4 6m8-6l-4 6" />
</>);

export const OneMilStarIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
</>);

// ── UI Actions ─────────────────────────────────────────────────────────────

export const OneMilFilterIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <line x1="4" y1="6" x2="20" y2="6" />
  <line x1="7" y1="12" x2="17" y2="12" />
  <line x1="10" y1="18" x2="14" y2="18" />
</>);

export const OneMilZapIcon: React.FC<IconProps> = ({
  size = 24, className = '', color = 'currentColor', strokeWidth = 2,
}) => base(size, className, color, strokeWidth, <>
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
</>);
