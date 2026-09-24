import type { SVGProps } from "react";

/** Network-V mark from the Vera brand mark. */
export function VeraMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 112"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="vera-arm-l" x1="50" y1="98" x2="14" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a3568" />
          <stop offset="0.55" stopColor="#2f5f9a" />
          <stop offset="1" stopColor="#4a9ab8" />
        </linearGradient>
        <linearGradient id="vera-arm-r" x1="50" y1="98" x2="86" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a3568" />
          <stop offset="0.55" stopColor="#2f7a9a" />
          <stop offset="1" stopColor="#6ec9c0" />
        </linearGradient>
      </defs>

      {/* Arms */}
      <path
        d="M50 90 L28 58 L14 20"
        stroke="url(#vera-arm-l)"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 90 L72 58 L86 20"
        stroke="url(#vera-arm-r)"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner bridge */}
      <path
        d="M14 20 L38 34 L62 34 L86 20"
        stroke="#4a9ab8"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path d="M38 34 H62" stroke="#6ec9c0" strokeWidth="5.5" strokeLinecap="round" />

      {/* Nodes */}
      <circle cx="50" cy="94" r="9.5" fill="#152a55" />
      <circle cx="28" cy="58" r="6.5" fill="#1e3d72" />
      <circle cx="72" cy="58" r="6.5" fill="#1e4a72" />
      <circle cx="14" cy="20" r="10" fill="#3d8fb0" />
      <circle cx="86" cy="20" r="10" fill="#6ec9c0" />
      <circle cx="38" cy="34" r="5.5" fill="#4a9ab8" />
      <circle cx="62" cy="34" r="5.5" fill="#6ec9c0" />
    </svg>
  );
}
