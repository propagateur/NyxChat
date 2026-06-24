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

export const Home = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 10.5 12 4l8 6.5M6 9.5V20h12V9.5" />
  </svg>
);

export const Message = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V17H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5Z" />
  </svg>
);

export const Globe = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
);

export const Settings = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2.4" />
    <circle cx="8" cy="17" r="2.4" />
  </svg>
);

export const Search = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

export const Copy = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M5.5 15.5A2 2 0 0 1 4 13.6V6a2 2 0 0 1 2-2h7.6a2 2 0 0 1 1.9 1.5" />
  </svg>
);

export const Smile = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </svg>
);

export const Plus = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Send = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12 20 5l-4.5 14.5-3.5-6.5-7-1Z" />
  </svg>
);

export const Check = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const Pin = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 13v8" />
  </svg>
);

export const BellOff = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5a3 3 0 0 1 5.7-1.3M17 9.5V12l2 3H8M6.5 6.4A6 6 0 0 0 5 12l-2 3h9M10 18a2 2 0 0 0 4 0M4 3l16 18" />
  </svg>
);

export const Lock = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const Users = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="7.5" r="3.2" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.7a3.2 3.2 0 0 1 0 5.8" />
  </svg>
);

export const UserPlus = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 3 17.5V19" />
    <circle cx="8.5" cy="7.5" r="3.2" />
    <path d="M18 8v6M21 11h-6" />
  </svg>
);

export const LogOut = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4" />
    <path d="M10 12h9M16 8l4 4-4 4" />
  </svg>
);

export const X = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Minimize = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </svg>
);

export const Maximize = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8.5V5a1 1 0 0 1 1-1h3.5M20 8.5V5a1 1 0 0 0-1-1h-3.5M20 15.5V19a1 1 0 0 1-1 1h-3.5M4 15.5V19a1 1 0 0 0 1 1h3.5" />
  </svg>
);
