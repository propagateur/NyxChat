import type { SVGProps } from "react";

type P = { size?: number; className?: string };

function base(size: number): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

export const Moon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20.5 13.2A8 8 0 1 1 10.8 3.5a6.3 6.3 0 0 0 9.7 9.7Z" />
  </svg>
);

export const Paperclip = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20 11.5 12 19.4a4.5 4.5 0 0 1-6.4-6.4l8.2-8.2a3 3 0 0 1 4.3 4.3l-8.2 8.2a1.5 1.5 0 0 1-2.2-2.1l7.5-7.6" />
  </svg>
);

export const Phone = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6.8 4H4.3a1.3 1.3 0 0 0-1.3 1.4A16 16 0 0 0 18.6 21a1.3 1.3 0 0 0 1.4-1.3v-2.5a1.3 1.3 0 0 0-1.1-1.3l-2.6-.4a1.3 1.3 0 0 0-1.2.5l-.9 1.1a12 12 0 0 1-5.3-5.3l1.1-.9a1.3 1.3 0 0 0 .5-1.2L9.5 6a1.3 1.3 0 0 0-1.3-1.1Z" />
  </svg>
);

export const Video = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="m15.5 10 5-2.6v9.2l-5-2.6" />
  </svg>
);

export const Mic = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

export const MicOff = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5a3 3 0 0 1 6 0v5m-.5 3.4A3 3 0 0 1 9 11.5" />
    <path d="M5.5 11a6.5 6.5 0 0 0 10 5.5M12 17.5V21M4 3l16 18" />
  </svg>
);

export const PhoneDown = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 14.5c5-4 13-4 18 0a1.4 1.4 0 0 0 2-.3l.7-1.4a1.4 1.4 0 0 0-.4-1.7C18.5 6.5 5.5 6.5.7 11.1a1.4 1.4 0 0 0-.4 1.7L1 14.2a1.4 1.4 0 0 0 2 .3Z" />
  </svg>
);

export const FileDoc = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8Z" />
    <path d="M13.5 3v4A1.5 1.5 0 0 0 15 8.5h3.5" />
  </svg>
);

export const ShieldCheck = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3 5 6v5.5c0 4 3 7.2 7 8.5 4-1.3 7-4.5 7-8.5V6Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
