/**
 * PicBeam Icons — inline SVG, no external icon libraries.
 * All icons: stroke 2.2, round caps/joins, 22px default.
 */
import { JSX } from 'preact';

interface IconProps {
  size?: number;
  class?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

export function ChevronLeft({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M14 5l-6 6 6 6"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Close({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M5 5l12 12M17 5L5 17"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function ArrowUp({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M11 18V4M5 10l6-6 6 6"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function ArrowDown({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M11 4v14M5 12l6 6 6-6"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Lock({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <rect x="4" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2.2" />
      <path
        d="M7 10V7.5a4 4 0 018 0V10"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function Plus({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M11 4v14M4 11h14"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Picture({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <rect x="2" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2.2" />
      <circle cx="8" cy="9" r="1.5" stroke="currentColor" stroke-width="2.2" />
      <path
        d="M2 15l5-4 4 4 3-3 6 5"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Check({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M4 11.5l5.5 5.5L18 6"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function ChevronUp({ size = 22, ...rest }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M5 14l6-6 6 6"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
