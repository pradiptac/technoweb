import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

/** Shared stroke geometry — one visual weight across the whole icon set. */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 24,
  height: 24,
  "aria-hidden": true,
};

export const IconNetwork = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="4.6" r="2.2" /><circle cx="4.8" cy="19.4" r="2.2" /><circle cx="19.2" cy="19.4" r="2.2" /><path d="M12 6.8v4.4M12 11.2 6.2 17.5M12 11.2l5.8 6.3" /></svg>
);
export const IconServer = (p: P) => (
  <svg {...base} {...p}><rect x="3.2" y="3.8" width="17.6" height="6.2" rx="1.7" /><rect x="3.2" y="14" width="17.6" height="6.2" rx="1.7" /><path d="M6.8 6.9h.01M6.8 17.1h.01M10.4 6.9h3M10.4 17.1h3" /></svg>
);
export const IconStorage = (p: P) => (
  <svg {...base} {...p}><ellipse cx="12" cy="6" rx="7.8" ry="3.2" /><path d="M4.2 6v12c0 1.8 3.5 3.2 7.8 3.2s7.8-1.4 7.8-3.2V6M4.2 12c0 1.8 3.5 3.2 7.8 3.2s7.8-1.4 7.8-3.2" /></svg>
);
export const IconFirewall = (p: P) => (
  <svg {...base} {...p}><rect x="2.8" y="4.4" width="18.4" height="15.2" rx="2" /><path d="M2.8 9.5h18.4M2.8 14.6h18.4M8.6 4.4v5.1M15.4 4.4v5.1M6 9.5v5.1M12 9.5v5.1M18 9.5v5.1M9 14.6v5M15.6 14.6v5" /></svg>
);
export const IconWifi = (p: P) => (
  <svg {...base} {...p}><path d="M2.6 8.9a14 14 0 0 1 18.8 0M5.8 12.6a9.4 9.4 0 0 1 12.4 0M9 16.2a4.8 4.8 0 0 1 6 0" /><circle cx="12" cy="19.6" r=".9" fill="currentColor" /></svg>
);
export const IconBackup = (p: P) => (
  <svg {...base} {...p}><path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1" /><path d="M20.6 3.6v5.1h-5.1" /><path d="M12 8v4.4l2.9 1.7" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 2.8 4.8 5.9v6.2c0 4.4 3 7.7 7.2 9.1 4.2-1.4 7.2-4.7 7.2-9.1V5.9z" /><path d="m9.2 12 1.9 1.9 3.7-3.8" /></svg>
);
export const IconCamera = (p: P) => (
  <svg {...base} {...p}><path d="M3.4 8.6 18.2 4.2l1.7 5.6L5.1 14.2z" /><path d="m6.5 13.3 1.4 4.6M12 4.2l1.7 5.6M8.4 19.6H4.6" /><circle cx="6" cy="19.6" r="1.8" /></svg>
);
export const IconTools = (p: P) => (
  <svg {...base} {...p}><path d="M14.2 6.4a3.9 3.9 0 0 0 5.2 5.2l-8 8a2.4 2.4 0 1 1-3.4-3.4l8-8z" /><path d="m6.6 4.2 2.6 2.6-2 2-2.6-2.6a2 2 0 0 1 2-2z" /></svg>
);
export const IconSwitch = (p: P) => (
  <svg {...base} {...p}><rect x="2.4" y="8.4" width="19.2" height="7.2" rx="1.6" /><path d="M5.4 11.6v.01M8.2 11.6v.01M11 11.6v.01M13.8 11.6v.01M16.6 11.6v.01M19 11.6v.01" /></svg>
);
export const IconRouter = (p: P) => (
  <svg {...base} {...p}><rect x="2.8" y="13.2" width="18.4" height="7.2" rx="1.8" /><path d="M6.4 16.8h.01M9.6 16.8h.01M12.8 16.8h.01M16.6 13.2V8.4M16.6 8.4l3-3M16.6 8.4l-3-3" /></svg>
);
export const IconPower = (p: P) => (
  <svg {...base} {...p}><path d="M12 2.6v8.2" /><path d="M18 6.4a8.4 8.4 0 1 1-12 0" /></svg>
);
export const IconPlug = (p: P) => (
  <svg {...base} {...p}><path d="M9 2.8v5.4M15 2.8v5.4M6.4 8.2h11.2v3.2a5.6 5.6 0 0 1-11.2 0z" /><path d="M12 17v4.2" /></svg>
);
export const IconGlobe = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9.2" /><path d="M2.8 12h18.4M12 2.8a14 14 0 0 1 0 18.4 14 14 0 0 1 0-18.4z" /></svg>
);
export const IconCloud = (p: P) => (
  <svg {...base} {...p}><path d="M17.4 18.6H7a4.6 4.6 0 0 1-.7-9.1 6 6 0 0 1 11.5 1.4 3.9 3.9 0 0 1-.4 7.7z" /></svg>
);
export const IconMail = (p: P) => (
  <svg {...base} {...p}><rect x="2.6" y="4.8" width="18.8" height="14.4" rx="2.2" /><path d="m2.6 7.4 9.4 6 9.4-6" /></svg>
);
export const IconCert = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="9.4" r="6" /><path d="m8.4 14.6-1 6.6 4.6-2.4 4.6 2.4-1-6.6" /></svg>
);
export const IconVps = (p: P) => (
  <svg {...base} {...p}><rect x="2.8" y="4" width="18.4" height="12" rx="2" /><path d="M8.4 20h7.2M12 16v4" /></svg>
);
export const IconCode = (p: P) => (
  <svg {...base} {...p}><path d="m8.4 7.8-5 4.2 5 4.2M15.6 7.8l5 4.2-5 4.2M13.4 4.6l-2.8 14.8" /></svg>
);
export const IconBuilding = (p: P) => (
  <svg {...base} {...p}><path d="M3.6 21h16.8M5.4 21V4.6a1.6 1.6 0 0 1 1.6-1.6h6.4a1.6 1.6 0 0 1 1.6 1.6V21M15 9.8h2.8a1.6 1.6 0 0 1 1.6 1.6V21" /><path d="M8.6 7h3.2M8.6 11h3.2M8.6 15h3.2" /></svg>
);
export const IconHealth = (p: P) => (
  <svg {...base} {...p}><path d="M2.8 12.4h4l2-4.4 3.2 8.4 2.4-5.2 1.6 1.2h5.2" /></svg>
);
export const IconEducation = (p: P) => (
  <svg {...base} {...p}><path d="m12 3.4 9.4 4.6L12 12.6 2.6 8z" /><path d="M6.4 10.2v5.4c0 1.6 2.5 2.9 5.6 2.9s5.6-1.3 5.6-2.9v-5.4M20.6 8.6v5.6" /></svg>
);
export const IconFactory = (p: P) => (
  <svg {...base} {...p}><path d="M2.8 21V10.4l6 3.6V10.4l6 3.6V6.6h6.4V21z" /><path d="M2.8 21h18.4" /></svg>
);
export const IconGov = (p: P) => (
  <svg {...base} {...p}><path d="M3 9.6 12 4l9 5.6M4.8 9.6V19M9.6 9.6V19M14.4 9.6V19M19.2 9.6V19M2.6 21h18.8" /></svg>
);
export const IconShop = (p: P) => (
  <svg {...base} {...p}><path d="M3.4 8.4h17.2L19.2 21H4.8z" /><path d="M8.4 8.4V6a3.6 3.6 0 0 1 7.2 0v2.4" /></svg>
);
export const IconTicket = (p: P) => (
  <svg {...base} {...p}><path d="M20.6 8.4V6.2A1.6 1.6 0 0 0 19 4.6H5a1.6 1.6 0 0 0-1.6 1.6v2.2a3.6 3.6 0 0 1 0 7.2v2.2A1.6 1.6 0 0 0 5 19.4h14a1.6 1.6 0 0 0 1.6-1.6v-2.2a3.6 3.6 0 0 1 0-7.2z" /></svg>
);
export const IconBook = (p: P) => (
  <svg {...base} {...p}><path d="M3.6 4.6A1.8 1.8 0 0 1 5.4 2.8H20v18.4H5.4a1.8 1.8 0 0 1-1.8-1.8z" /><path d="M3.6 17.4h16.4" /></svg>
);
export const IconPhone = (p: P) => (
  <svg {...base} {...p}><path d="M21 16.6v2.8a1.9 1.9 0 0 1-2.1 1.9 18.6 18.6 0 0 1-16-16A1.9 1.9 0 0 1 4.8 3.2h2.8a1.9 1.9 0 0 1 1.9 1.6c.1 1 .4 1.9.7 2.8a1.9 1.9 0 0 1-.4 2l-1.2 1.2a15 15 0 0 0 5.6 5.6l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.8.7a1.9 1.9 0 0 1 1.6 1.9z" /></svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M4.8 12h14.4M13.2 6l6 6-6 6" /></svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><path d="m6 9.4 6 5.6 6-5.6" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="m5 12.5 4.6 4.6L19 7.6" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconBolt = (p: P) => (
  <svg {...base} strokeWidth={1.6} {...p}><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z" /></svg>
);

/** Name → component, so CMS-driven records can reference an icon by string. */
export const iconMap = {
  network: IconNetwork, server: IconServer, storage: IconStorage, firewall: IconFirewall,
  wifi: IconWifi, backup: IconBackup, shield: IconShield, camera: IconCamera, tools: IconTools,
  switch: IconSwitch, router: IconRouter, power: IconPower, plug: IconPlug, globe: IconGlobe,
  cloud: IconCloud, mail: IconMail, cert: IconCert, vps: IconVps, code: IconCode,
  building: IconBuilding, health: IconHealth, education: IconEducation, factory: IconFactory,
  gov: IconGov, shop: IconShop, ticket: IconTicket, book: IconBook,
} as const;

export type IconName = keyof typeof iconMap;
