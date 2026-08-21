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


/* ---------------------------------------------------------------- social

   Brand marks, so these are filled rather than stroked like the rest of the
   set — a stroked outline of a well-known logo reads as wrong, and these are
   recognised by silhouette. Sized and coloured by the same currentColor
   conventions as everything else.
*/
const brand = { viewBox: "0 0 24 24", fill: "currentColor", width: 24, height: 24, "aria-hidden": true };

export const IconLinkedin = (p: P) => (
  <svg {...brand} {...p}><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3.2 9.75h3.56V21H3.2zM9.4 9.75h3.41v1.54h.05c.48-.9 1.64-1.85 3.38-1.85 3.62 0 4.29 2.38 4.29 5.47V21h-3.56v-4.98c0-1.19-.02-2.72-1.66-2.72-1.66 0-1.91 1.3-1.91 2.64V21H9.4z" /></svg>
);
export const IconFacebook = (p: P) => (
  <svg {...brand} {...p}><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" /></svg>
);
export const IconX = (p: P) => (
  <svg {...brand} {...p}><path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-5.9l-4.62-6.04L5.94 21H2.92l7.06-8.07L2.4 3h6.05l4.18 5.52zm-1.06 16.2h1.67L7.6 4.71H5.81z" /></svg>
);
export const IconInstagram = (p: P) => (
  <svg {...brand} {...p}><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.98c-3.15 0-3.5.01-4.74.07-1.14.05-1.76.24-2.17.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.17-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05 1.14.24 1.76.4 2.17.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.17.4 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.14-.05 1.76-.24 2.17-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.14-.24-1.76-.4-2.17a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4-1.24-.06-1.59-.07-4.74-.07zm0 3.37a5.49 5.49 0 1 1 0 10.98 5.49 5.49 0 0 1 0-10.98zm0 9.05a3.56 3.56 0 1 0 0-7.12 3.56 3.56 0 0 0 0 7.12zm6.99-9.27a1.28 1.28 0 1 1-2.57 0 1.28 1.28 0 0 1 2.57 0z" /></svg>
);
export const IconYoutube = (p: P) => (
  <svg {...brand} {...p}><path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42A2.51 2.51 0 0 0 2.42 7.19C2 8.75 2 12 2 12s0 3.25.42 4.81a2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15.02V8.98L15.2 12z" /></svg>
);
export const IconWhatsapp = (p: P) => (
  <svg {...brand} {...p}><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 0 1-1.44-5.01c0-5.18 4.22-9.4 9.42-9.4 2.51 0 4.88.98 6.65 2.76a9.34 9.34 0 0 1 2.76 6.65c0 5.19-4.22 9.41-9.42 9.41zM19.11 4.9A11.3 11.3 0 0 0 12.05 2C5.8 2 .73 7.07.73 13.3c0 1.99.52 3.94 1.51 5.65L.63 24.5l5.68-1.49a11.33 11.33 0 0 0 5.74 1.46h.01c6.25 0 11.32-5.07 11.32-11.3 0-3.02-1.18-5.86-3.31-8z" /></svg>
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
