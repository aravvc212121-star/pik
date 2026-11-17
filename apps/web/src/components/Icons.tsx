/**
 * PicBeam SVG Icons — inline, no emoji
 */
import { JSX } from 'preact';

interface IconProps {
  size?: number;
  class?: string;
  color?: string;
  strokeWidth?: number;
}

/** Logo: black rounded square with a white right arrow */
export function LogoIcon({ size = 30 }: IconProps): JSX.Element {
  const r = 9 * (size / 30);
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect width="30" height="30" rx={r} fill="var(--color-ink)" />
      <path
        d="M10 15h10M16 11l4 4-4 4"
        stroke="#FFFFFF"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Lock icon for the Private button */
export function LockIcon({ size = 14, strokeWidth = 2 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" stroke="var(--color-ink)" stroke-width={strokeWidth} />
      <path
        d="M4.5 6V4.5a2.5 2.5 0 015 0V6"
        stroke="var(--color-ink)"
        stroke-width={strokeWidth}
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Check icon: solid circle with white check */
export function CheckIcon({ size = 64 }: IconProps): JSX.Element {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="var(--color-ink)" />
      <path
        d="M20 33l8 8 16-16"
        stroke="#FFFFFF"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Small check icon for file rows and sheets */
export function CheckIconSmall({ size = 22 }: IconProps): JSX.Element {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="11" fill="var(--color-ink)" />
      <path
        d="M6.5 11.5l3 3 6-6"
        stroke="#FFFFFF"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Error icon: outlined circle (no fill) */
export function ErrorIcon({ size = 64 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" stroke="var(--color-ink)" stroke-width="2" />
      <path
        d="M32 20v16M32 42v2"
        stroke="var(--color-ink)"
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Camera icon for scanner */
export function CameraIcon({ size = 24 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" stroke-width="2" />
      <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2" />
      <path d="M8 6l1-2h6l1 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

/** Close / X icon */
export function CloseIcon({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5L5 15"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Download icon */
export function DownloadIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2v10M5 8l4 4 4-4M3 14h12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Small remove badge — circle with ✕, for thumbnail corners */
export function RemoveIcon({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--color-ink)" />
      <path
        d="M6.5 6.5l7 7M13.5 6.5l-7 7"
        stroke="#FFFFFF"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** Plus icon — for "add more" button */
export function PlusIcon({ size = 20 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

