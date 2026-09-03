import type { SVGProps } from "react";
import {
  Activity, BatteryCharging, Bell, Boxes, Bug, Building2, CalendarClock,
  ClipboardCheck, Cpu, CreditCard, DoorOpen, Droplets, Eye, FileText,
  Fingerprint, Flame, Fuel, Gauge, HardDrive, HardHat, Layers, Leaf, MapPin,
  Mic, Plane, RadioTower, Recycle, RefreshCw, Ruler, SatelliteDish, Scale,
  Ship, Signal, Speaker, Sun, Terminal, Thermometer, TrainFront, Tv, Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { hueFor } from "@/lib/hues";

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
// Used directly rather than through iconMap, so currentColor: an "opens
// elsewhere" mark is a job the icon does, not a thing it stands for.
export const IconExternal = (p: P) => (
  <svg {...base} {...p}><path d="M14 4.5h5.5V10M19 5l-8 8" /><path d="M18 14v4.6a1.9 1.9 0 0 1-1.9 1.9H5.4a1.9 1.9 0 0 1-1.9-1.9V7.9A1.9 1.9 0 0 1 5.4 6H10" /></svg>
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
/* --- Admin console nav. Same stroke geometry as the content icons. --- */

export const IconGauge = (p: P) => (
  <svg {...base} {...p}><path d="M3.6 17.2a9 9 0 1 1 16.8 0" /><path d="m12 13.4 4.2-4.2" /><circle cx="12" cy="17.2" r="1.4" /></svg>
);
export const IconPen = (p: P) => (
  <svg {...base} {...p}><path d="M4 20h4.2l9.6-9.6a2.1 2.1 0 0 0-3-3L5.2 17v3z" /><path d="M14.6 5.2 18.8 9.4" /></svg>
);
export const IconLifebuoy = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="3.6" /><path d="m5.9 5.9 3.5 3.5M14.6 14.6l3.5 3.5M18.1 5.9l-3.5 3.5M9.4 14.6l-3.5 3.5" /></svg>
);
export const IconBox = (p: P) => (
  <svg {...base} {...p}><path d="m12 2.9 8.4 4.4v9.4L12 21.1 3.6 16.7V7.3z" /><path d="M3.6 7.3 12 11.8l8.4-4.5M12 11.8v9.3" /></svg>
);
export const IconGrid = (p: P) => (
  <svg {...base} {...p}><rect x="3.4" y="3.4" width="7" height="7" rx="1.5" /><rect x="13.6" y="3.4" width="7" height="7" rx="1.5" /><rect x="3.4" y="13.6" width="7" height="7" rx="1.5" /><rect x="13.6" y="13.6" width="7" height="7" rx="1.5" /></svg>
);
export const IconLayers = (p: P) => (
  <svg {...base} {...p}><path d="m12 3.2 8.6 4.5-8.6 4.5-8.6-4.5z" /><path d="m3.4 12.4 8.6 4.5 8.6-4.5M3.4 16.9l8.6 4.5 8.6-4.5" /></svg>
);
export const IconImage = (p: P) => (
  <svg {...base} {...p}><rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2" /><circle cx="8.6" cy="9.6" r="1.7" /><path d="m3.6 17.4 4.8-4.4a2 2 0 0 1 2.7 0l5.4 5M14.4 14l1.7-1.6a2 2 0 0 1 2.7 0l1.6 1.5" /></svg>
);
export const IconArrows = (p: P) => (
  <svg {...base} {...p}><path d="M3.4 8.2h13.2M13.2 4.8l3.4 3.4-3.4 3.4" /><path d="M20.6 15.8H7.4M10.8 12.4 7.4 15.8l3.4 3.4" /></svg>
);
export const IconSearchChart = (p: P) => (
  <svg {...base} {...p}><circle cx="10.6" cy="10.6" r="6.6" /><path d="m15.5 15.5 4.6 4.6" /><path d="M8.2 12.2v-2M10.6 12.2V8.4M13 12.2v-3" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}><circle cx="9.2" cy="8.2" r="3.4" /><path d="M2.9 19.6a6.4 6.4 0 0 1 12.6 0" /><path d="M16.4 5.2a3.4 3.4 0 0 1 0 6.5M17.9 19.6a6.4 6.4 0 0 0-1.6-4.2" /></svg>
);
export const IconSliders = (p: P) => (
  <svg {...base} {...p}><path d="M4.6 6.4h14.8M4.6 12h14.8M4.6 17.6h14.8" /><circle cx="9.4" cy="6.4" r="1.9" /><circle cx="15" cy="12" r="1.9" /><circle cx="8" cy="17.6" r="1.9" /></svg>
);
export const IconTag = (p: P) => (
  <svg {...base} {...p}><path d="M11 3.4H4.6a1.2 1.2 0 0 0-1.2 1.2V11a2 2 0 0 0 .6 1.4l7.6 7.6a1.7 1.7 0 0 0 2.4 0l6.4-6.4a1.7 1.7 0 0 0 0-2.4L12.4 4a2 2 0 0 0-1.4-.6z" /><circle cx="7.9" cy="7.9" r="1.3" /></svg>
);

export const IconEye = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.9" />
    <path d="M6.6 6.9A17.4 17.4 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 3.6-.7" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const IconRack = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="1.8"/><path d="M4 9h16M4 14.5h16M7.5 6.2h.01M7.5 11.7h.01M7.5 17.2h.01"/>
  </svg>
);

export const IconUps = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="6" width="17" height="12" rx="1.8"/><path d="M8 6V4.2h8V6"/><path d="m12.6 9.4-2.4 3.4h2.6l-.8 2.6 2.4-3.4h-2.6z"/>
  </svg>
);

export const IconCable = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6.5 3.5v4.2a2 2 0 0 0 2 2h1.2a2 2 0 0 1 2 2v4.6a2 2 0 0 0 2 2h1.3"/><rect x="4.4" y="2" width="4.2" height="3" rx="1"/><rect x="15.4" y="19" width="4.2" height="3" rx="1"/>
  </svg>
);

export const IconAntenna = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 10.5V21M8.4 21h7.2"/><path d="M7.6 8.4a5.4 5.4 0 0 1 8.8 0M4.8 5.6a9.2 9.2 0 0 1 14.4 0"/><circle cx="12" cy="10.4" r="1.4"/>
  </svg>
);

export const IconPrinter = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 9V3.8h10V9"/><rect x="3.5" y="9" width="17" height="7" rx="1.6"/><path d="M7 14h10v6.2H7z"/><path d="M6.6 12h.01"/>
  </svg>
);

export const IconLaptop = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="5" width="15" height="10" rx="1.6"/><path d="M2.6 18.6h18.8"/>
  </svg>
);

export const IconMonitor = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.2" y="4" width="17.6" height="12" rx="1.8"/><path d="M9 20h6M12 16v4"/>
  </svg>
);

export const IconMobile = (p: P) => (
  <svg {...base} {...p}>
    <rect x="7" y="2.6" width="10" height="18.8" rx="2.2"/><path d="M11 18.6h2"/>
  </svg>
);

export const IconDatabase = (p: P) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3.2"/><path d="M4.5 6v12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6"/><path d="M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2"/>
  </svg>
);

export const IconLock = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="10" width="15" height="10.4" rx="2"/><path d="M8 10V7.4a4 4 0 0 1 8 0V10"/><path d="M12 14.4v2.2"/>
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="7.6" cy="8.4" r="4.1"/><path d="m10.6 11.4 8 8M16.4 17.2l1.8-1.8M14 14.8l1.8-1.8"/>
  </svg>
);

export const IconChart = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 20h16"/><path d="M6.6 20V12M11 20V6.4M15.4 20v-5.4M19.8 20V9"/>
  </svg>
);

export const IconTeam = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.4"/><path d="M3.4 19.6a5.8 5.8 0 0 1 11.2 0"/><path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.6M17.6 19.6a5.6 5.6 0 0 0-2-4"/>
  </svg>
);

/**
 * A warning triangle, for the JavaScript-errors screen.
 *
 * Direct-use rather than an `iconMap` entry, so it keeps `currentColor`: this
 * does a job — it labels a nav row — rather than standing for a thing, and the
 * split is what stops an arrow inside a brand button turning lime.
 *
 * Drawn rather than reused. `IconLifebuoy` was the nearest already imported and
 * is already the FAQs row, and two nav entries sharing a glyph is a menu you
 * have to read twice.
 */
export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.9 21.2 19.6a1.4 1.4 0 0 1-1.2 2.1H4a1.4 1.4 0 0 1-1.2-2.1Z"/>
    <path d="M12 9.6v4.4"/><path d="M12 17.6v.01"/>
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>
  </svg>
);

export const IconWarehouse = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 10.2 12 4.4l9 5.8V20H3z"/><path d="M8 20v-6.2h8V20"/><path d="M8 16.6h8"/>
  </svg>
);

export const IconTruck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.8 6.6h10.4v9.2H2.8z"/><path d="M13.2 10h3.6l3.4 3.2v2.6h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
  </svg>
);

export const IconHeadset = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.4 14.6v-2.4a7.6 7.6 0 0 1 15.2 0v2.4"/><rect x="2.8" y="13.4" width="4" height="6" rx="1.6"/><rect x="17.2" y="13.4" width="4" height="6" rx="1.6"/><path d="M19.6 19.4a3.4 3.4 0 0 1-3.4 2.2h-1.8"/>
  </svg>
);

export const IconScanner = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8V5.4A1.4 1.4 0 0 1 5.4 4H8M16 4h2.6A1.4 1.4 0 0 1 20 5.4V8M20 16v2.6a1.4 1.4 0 0 1-1.4 1.4H16M8 20H5.4A1.4 1.4 0 0 1 4 18.6V16"/><path d="M3.4 12h17.2"/>
  </svg>
);

export const IconProjector = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.8" y="7.6" width="18.4" height="9.4" rx="2"/><circle cx="14.4" cy="12.3" r="2.8"/><path d="M6 12.3h.01M6 19v1.6M18 19v1.6"/>
  </svg>
);

export const IconWrench = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.2 3.6a5.4 5.4 0 0 0-6.4 7l-5 5a1.8 1.8 0 0 0 2.6 2.6l5-5a5.4 5.4 0 0 0 7-6.4l-3 3-2.6-2.6z"/>
  </svg>
);


/**
 * A Lucide icon wearing this project's stroke geometry.
 *
 * Lucide draws on the same 24 grid with the same round caps, so the only thing
 * that gives a borrowed icon away is its 2px stroke sitting beside this set's
 * 1.7 — spreading `base` settles it, and `base` stays the single place the
 * weight is decided.
 *
 * **Borrow, never re-export wholesale.** Lucide ships ~1,600 icons; an editor
 * handed all of them cannot find any of them, and every name in `iconMap` is a
 * value stored in MySQL (`solutions.icon`, `services.icon`,
 * `product_categories.icon`). Adding a key is free. Renaming or removing one
 * silently blanks the icon on every record pointing at it — which is why the
 * keys below are this project's names, not Lucide's, and are free to stay put
 * if Lucide ever renames its export.
 */
const fromLucide = (L: LucideIcon) => {
  const Borrowed = (p: P) => <L {...base} {...p} />;
  Borrowed.displayName = `Borrowed(${L.displayName ?? "icon"})`;
  return Borrowed;
};

/*
 * Twelve added for the verticals and the products this catalogue was missing.
 *
 * Drawn here rather than imported, and that was a decision taken by looking:
 * Freepik has 960 hardware and networking icons and they inherit `currentColor`
 * correctly, but they are filled outlines drawn far thinner and busier than
 * this set — legible at 34px, mush at the 20px a list row uses, and with no
 * stroke-width to raise because there is no stroke. Rendered beside these they
 * do not belong in the same grid, which is the same finding that had the 41
 * Lucide icons re-registered at 1.7 rather than used as they came.
 */

/** A desk handset — VoIP and IP telephony, which the map had no icon for at all: `mobile` is a smartphone and `headset` is the support desk. */
export const IconDeskPhone = (p: P) => (
  <svg {...base} {...p}><rect x="3.6" y="12.6" width="16.8" height="7.4" rx="1.8"/><rect x="5.8" y="6.4" width="12.4" height="3.6" rx="1.8"/><path d="M12 10v2.6"/><path d="M7.2 15.6h1.1M11.4 15.6h1.1M15.6 15.6h1.1M7.2 17.9h1.1M11.4 17.9h1.1M15.6 17.9h1.1"/></svg>
);

/** Structured cabling's own icon. `cable` is a lead; this is the panel it lands on, which is what a cabling job is actually quoted around. */
export const IconPatchPanel = (p: P) => (
  <svg {...base} {...p}><rect x="2.9" y="6.6" width="18.2" height="10.8" rx="1.7"/><path d="M6.1 10.2v3.6M9.4 10.2v3.6M12.7 10.2v3.6M16 10.2v3.6M19.3 10.2v.01"/></svg>
);

/** A network video recorder. Distinct from `camera` on purpose — the camera is what somebody points at a car park and the recorder is the box in the rack that everything depends on. */
export const IconRecorder = (p: P) => (
  <svg {...base} {...p}><rect x="2.9" y="7.4" width="18.2" height="9.2" rx="1.7"/><circle cx="7.2" cy="12" r="1.5"/><path d="M11.6 10.4h6.2M11.6 13.6h3.4"/></svg>
);

/** A duplex fibre connector — the ferrules and the body of an LC lead. Drawn as the connector rather than as a strand, because a strand at 20px is a diagonal line and the connector is what a fibre job is terminated on. */
export const IconFibre = (p: P) => (
  <svg {...base} {...p}><rect x="6.2" y="8.6" width="9.6" height="6.8" rx="1.5"/><path d="M15.8 10.9h4.4M15.8 13.1h4.4"/><path d="M6.2 12H3.2"/><path d="M9.2 11.1v1.8M12.6 11.1v1.8"/></svg>
);

/** A licence rather than a disc: software here is a thing with a key and a term, not media. */
export const IconSoftware = (p: P) => (
  <svg {...base} {...p}><rect x="3.6" y="4.4" width="16.8" height="15.2" rx="1.9"/><path d="M7.2 9h9.6M7.2 12.4h6"/><circle cx="15.6" cy="15.8" r="1.6"/><path d="M15.6 17.4v1.6"/></svg>
);

/** Video conferencing — two people in a screen on a stand. The first cut had one person and two text lines beside them, which read as an ID badge rather than a call: an icon that reads as the wrong thing is worse than no icon. */
export const IconMeeting = (p: P) => (
  <svg {...base} {...p}><rect x="2.9" y="4.2" width="18.2" height="12.4" rx="1.9"/><circle cx="9.2" cy="9.2" r="1.9"/><path d="M5.8 13.6a3.5 3.5 0 0 1 6.8 0"/><circle cx="16.2" cy="10" r="1.4"/><path d="M13.8 13.6a2.6 2.6 0 0 1 4.8 0"/><path d="M12 16.6v3.4M8.8 20h6.4"/></svg>
);

/** A SIM, for leased lines and mobile connectivity — the thing a failover link is billed on. */
export const IconSim = (p: P) => (
  <svg {...base} {...p}><path d="M5.8 3.6h8l4.4 4.4v12.4a1.7 1.7 0 0 1-1.7 1.7H5.8a1.7 1.7 0 0 1-1.7-1.7V5.3a1.7 1.7 0 0 1 1.7-1.7Z"/><rect x="7.6" y="11.4" width="8.8" height="6.6" rx="1.2"/><path d="M10.8 11.4v6.6M7.6 14.7h8.8"/></svg>
);

/** Banking and finance. `payment` is a card and `building` is an office; a vertical wants the institution. */
export const IconBank = (p: P) => (
  <svg {...base} {...p}><path d="M3.4 9.6 12 4.4l8.6 5.2"/><path d="M5.4 9.6v8.2M10 9.6v8.2M14 9.6v8.2M18.6 9.6v8.2"/><path d="M3.4 19.6h17.2"/></svg>
);

/** Hospitality — a bed. Hotels are among the heaviest buyers of guest Wi-Fi and surveillance, and the map had nothing for them. */
export const IconHotel = (p: P) => (
  <svg {...base} {...p}><path d="M3.4 18.4V7.2"/><path d="M3.4 12.6h17.2a1.7 1.7 0 0 1 1.7 1.7v4.1"/><path d="M3.4 15.8h18.9"/><circle cx="7.8" cy="9.6" r="1.9"/><path d="M11 12.6V9.9a.7.7 0 0 1 .7-.7h4.9"/></svg>
);

/** Food service. A fork and a knife rather than a plate, because a plate at 20px is a circle. */
export const IconRestaurant = (p: P) => (
  <svg {...base} {...p}><path d="M8 3.6v7.2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V3.6"/><path d="M6 3.6v9.2M6 12.8v7.6"/><path d="M17.4 3.6c-1.6 1.4-2.4 3.2-2.4 5.4 0 1.9.9 2.9 2.4 3.2"/><path d="M17.4 3.6v16.8"/></svg>
);

/** Pharmaceuticals and laboratories — a flask. A regulated environment, which is why it is a distinct vertical from `health`. */
export const IconPharma = (p: P) => (
  <svg {...base} {...p}><path d="M9.6 3.6v6.1L4.9 17.9a1.7 1.7 0 0 0 1.5 2.5h11.2a1.7 1.7 0 0 0 1.5-2.5l-4.7-8.2V3.6"/><path d="M8.4 3.6h7.2"/><path d="M7.1 14.4h9.8"/></svg>
);

/** Dealerships and workshops — a site type with cameras, a network and almost no IT staff. */
export const IconAutomotive = (p: P) => (
  <svg {...base} {...p}><path d="M6.4 12.2 8 8.5a1.8 1.8 0 0 1 1.7-1.1h4.6A1.8 1.8 0 0 1 16 8.5l1.6 3.7"/><path d="M3.6 12.2h16.8a1.6 1.6 0 0 1 1.6 1.6v2.8H2v-2.8a1.6 1.6 0 0 1 1.6-1.6Z"/><circle cx="6.9" cy="16.6" r="1.9"/><circle cx="17.1" cy="16.6" r="1.9"/></svg>
);

export const iconMap = {
  network: IconNetwork, server: IconServer, storage: IconStorage, firewall: IconFirewall,
  wifi: IconWifi, backup: IconBackup, shield: IconShield, camera: IconCamera, tools: IconTools,
  switch: IconSwitch, router: IconRouter, power: IconPower, plug: IconPlug, globe: IconGlobe,
  cloud: IconCloud, mail: IconMail, cert: IconCert, vps: IconVps, code: IconCode,
  building: IconBuilding, health: IconHealth, education: IconEducation, factory: IconFactory,
  gov: IconGov, shop: IconShop, ticket: IconTicket, book: IconBook,
  rack: IconRack, ups: IconUps, cable: IconCable, antenna: IconAntenna, printer: IconPrinter,
  laptop: IconLaptop, monitor: IconMonitor, mobile: IconMobile, database: IconDatabase, lock: IconLock,
  key: IconKey, chart: IconChart, users: IconTeam, clock: IconClock, warehouse: IconWarehouse,
  truck: IconTruck, headset: IconHeadset, scanner: IconScanner, projector: IconProjector, wrench: IconWrench,

  phone: IconDeskPhone, "patch-panel": IconPatchPanel, nvr: IconRecorder, fibre: IconFibre,
  software: IconSoftware, meeting: IconMeeting, sim: IconSim, bank: IconBank, hotel: IconHotel,
  restaurant: IconRestaurant, pharma: IconPharma, automotive: IconAutomotive,

  // Borrowed from Lucide — see fromLucide above.
  eye: fromLucide(Eye), fingerprint: fromLucide(Fingerprint), door: fromLucide(DoorOpen),
  fire: fromLucide(Flame), thermometer: fromLucide(Thermometer), droplet: fromLucide(Droplets),
  pulse: fromLucide(Activity), bell: fromLucide(Bell), calendar: fromLucide(CalendarClock),
  document: fromLucide(FileText), checklist: fromLucide(ClipboardCheck), pin: fromLucide(MapPin),
  office: fromLucide(Building2), aviation: fromLucide(Plane), shipping: fromLucide(Ship),
  rail: fromLucide(TrainFront), fuel: fromLucide(Fuel), recycle: fromLucide(Recycle),
  leaf: fromLucide(Leaf), compliance: fromLucide(Scale), payment: fromLucide(CreditCard),
  disk: fromLucide(HardDrive), cpu: fromLucide(Cpu), workflow: fromLucide(Workflow),
  inventory: fromLucide(Boxes), helmet: fromLucide(HardHat), ruler: fromLucide(Ruler),
  sync: fromLucide(RefreshCw), satellite: fromLucide(SatelliteDish), tower: fromLucide(RadioTower),
  signal: fromLucide(Signal), terminal: fromLucide(Terminal), bug: fromLucide(Bug),
  gauge: fromLucide(Gauge), layers: fromLucide(Layers), mic: fromLucide(Mic),
  speaker: fromLucide(Speaker), tv: fromLucide(Tv), video: fromLucide(Video),
  battery: fromLucide(BatteryCharging), solar: fromLucide(Sun),
} as const;

export type IconName = keyof typeof iconMap;

/**
 * An icon that stands for a thing — a solution, a category, an industry.
 *
 * Renders the icon registered under `name` in `iconMap`, in that name's own
 * fluorescent hue, falling back to `fallback` when the CMS holds a name this
 * build does not have. That fallback matters: icon names come from the
 * database, so a value can outlive the icon it referred to.
 *
 * Colour is applied here rather than at each call site so a new entry in
 * `iconMap` is coloured the moment it exists, and so the rule has exactly one
 * home. Icons used directly — arrows, chevrons, the social marks — deliberately
 * do not come through here and keep `currentColor`.
 */
export function IdentityIcon({
  name, fallback = "network", className,
}: {
  name: string | null | undefined;
  fallback?: IconName;
  className?: string;
}) {
  const key = (name && name in iconMap ? name : fallback) as IconName;
  const Icon = iconMap[key];

  return <Icon className={className} style={{ color: hueFor(key) }} />;
}
