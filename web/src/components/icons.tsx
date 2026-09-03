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

/*
 * Six borrowed from TailGrids, MIT-licensed (`@tailgrids/icons` 2.0.1).
 *
 * **Vendored, not depended on**, which is the pincode table's argument: the
 * package declares `@babel/core`, `@svgr/core` and `fs-extra` as *runtime*
 * dependencies — they are its build tools, mis-declared — so installing it puts
 * Babel and SVGR in this application's `node_modules` to draw six glyphs.
 *
 * **Six of 245, and the number is the finding.** `iconMap` already holds 103
 * keys, and almost everything the pack offers a hardware business is in it:
 * `cpu`, `bell`, `fire`, `speaker`, `mic`, `video`, `door`, `fingerprint`,
 * `printer`, `lock`, `laptop`, `monitor`, `scanner`, `projector`. The rest of
 * the 245 is UI chrome — arrows, chevrons, close, check, six menu variants —
 * which this file already has as direct-use icons, plus a retail set (a shoe, a
 * boxing glove, a scooter, a stocking) that a network integrator will never
 * point a solution at.
 *
 * **A wholesale import would also have been wrong in a way that is invisible.**
 * 36 of the 245 are `fill="currentColor"` with no stroke, and `base` sets
 * `fill: none` — every one of them would have rendered as nothing at all, on a
 * screen where a missing icon looks exactly like a record nobody gave one.
 * `IdCard` and `Printer` were both on the shortlist until they were measured.
 * Two more carry an 8x17 and a 16x16 viewBox rather than 24.
 *
 * They spread `base` like the borrowed Lucide ones, so they carry this set's
 * 1.7 stroke rather than TailGrids' 1.5 — mixed weights in one grid read as
 * sloppy before anyone can say why. The keys are this project's names, not
 * TailGrids', for the reason the Lucide note gives: a key is a value stored in
 * MySQL, and a rename upstream must not be a data migration here.
 */
export const IconKeyboard = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.25 18.75H19.7501C20.5785 18.75 21.2501 18.0784 21.2501 17.25V6.75C21.2501 5.92157 20.5785 5.25 19.7501 5.25H4.25C3.42157 5.25 2.75 5.92157 2.75 6.75V17.25C2.75 18.0784 3.42157 18.75 4.25 18.75Z"/>
    <path d="M8 15.375H16"/>
    <path d="M6.44 8.63h.01M6.44 12h.01M10.14 8.63h.01M10.16 12h.01M13.85 8.63h.01M17.55 8.63h.01M13.84 12h.01M17.56 12h.01"/>
  </svg>
);

export const IconHandshake = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11.3977 7.07126L10.6044 6.53796C9.76531 5.97394 8.65308 6.03882 7.88529 6.69659L5.93735 8.36541C5.66552 8.59829 5.31938 8.72628 4.96145 8.72628H2.75018V14.7558H4.83784C5.26901 14.7558 5.67933 14.9413 5.96411 15.2651L8.30335 17.9244C8.8058 18.4956 9.65629 18.6002 10.2822 18.1678L11.2766 17.4808L12.3675 17.8509C12.9879 18.0614 13.6731 17.8449 14.06 17.3162L14.7934 16.314L15.5615 16.4175C16.1776 16.5006 16.7811 16.195 17.0788 15.6492L17.3409 15.1688M13.9679 10.305L11.376 12.3407C10.7899 12.801 9.95469 12.7612 9.41501 12.2472L9.34692 12.1824C8.73781 11.6023 8.72465 10.6349 9.31775 10.0385L12.2822 7.05744C13.3932 5.94023 15.1791 5.87283 16.3712 6.90312L18.0581 8.36114C18.3306 8.59667 18.6787 8.72628 19.0389 8.72628H21.2502V15.1688H17.3409M13.9679 10.305L14.5045 9.88356M13.9679 10.305L17.095 13.3121C17.5824 13.7809 17.6959 14.5178 17.3721 15.1115L17.3409 15.1688"/>
  </svg>
);

export const IconBriefcase = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.25002 9.75L11.4092 13.2468C11.7866 13.4085 12.2137 13.4085 12.591 13.2468L20.7502 9.75M4.74982 18.75H19.25C20.0784 18.75 20.75 18.0784 20.75 17.25V8.25C20.75 7.42157 20.0784 6.75 19.25 6.75H4.74982C3.92139 6.75 3.24982 7.42157 3.24982 8.25V17.25C3.24982 18.0784 3.92139 18.75 4.74982 18.75ZM15.5 6.75V5.25C15.5 4.42157 14.8284 3.75 14 3.75H10C9.17159 3.75 8.50002 4.42157 8.50002 5.25V6.75H15.5Z"/>
  </svg>
);

export const IconMegaphone = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10.3311 7.64845H4.25C3.42157 7.64845 2.75 8.32003 2.75 9.14845V12.2498C2.75 13.0782 3.42157 13.7498 4.25 13.7498H7.37224M10.3311 7.64845V13.7498M10.3311 7.64845L21.25 4.00002V17.3987L10.3311 13.7498M10.3311 13.7498H10.2552M21.25 3.19934V18.1993M10.2552 13.7498H7.37224M10.2552 13.7498L10.7995 17.0456C10.947 17.9383 10.2583 18.75 9.35355 18.75C8.62361 18.75 8.00493 18.2129 7.90248 17.4901L7.37224 13.7498"/>
  </svg>
);

export const IconBrain = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12.0009 5.40779C12.0009 4.15031 13.0203 3.13092 14.2778 3.13092C15.3281 3.13092 16.2122 3.842 16.4751 4.80898H16.6699C18.3268 4.80898 19.6699 6.15212 19.6699 7.80898V8.20534C20.6234 8.85183 21.25 9.94428 21.25 11.1831C21.25 12.4219 20.6234 13.5143 19.6699 14.1608V15.3731C19.6699 17.0299 18.3268 18.3731 16.6699 18.3731H16.5547V18.5897C16.5547 19.8472 15.5353 20.8666 14.2778 20.8666C13.0203 20.8666 12.0009 19.8472 12.0009 18.5897M4.33008 15.3743L4.33008 14.1617C3.37657 13.5153 2.75 12.4228 2.75 11.184C2.75 9.94522 3.37657 8.85276 4.33008 8.20628V7.8102C4.33008 6.15335 5.67322 4.81021 7.33008 4.81021H7.52507C7.78822 3.8436 8.6722 3.13287 9.72219 3.13287C10.9797 3.13287 11.9991 4.15226 11.9991 5.40974V18.5916C11.9991 19.8491 10.9797 20.8685 9.72219 20.8685C8.4647 20.8685 7.44531 19.8491 7.44531 18.5916V18.3743H7.33008C5.67322 18.3743 4.33008 17.0311 4.33008 15.3743Z"/>
  </svg>
);

export const IconNewspaper = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.25 18.75H19.75C20.5784 18.75 21.25 18.0784 21.25 17.25V6.75C21.25 5.92157 20.5784 5.25 19.75 5.25H7.25C6.42157 5.25 5.75 5.92157 5.75 6.75V12M4.25 18.75C3.42157 18.75 2.75 18.0784 2.75 17.25V6.75M4.25 18.75C5.07843 18.75 5.75 18.0784 5.75 17.25V8.25M18.25 15.3926H8.75M18.25 9L15.75 9M18.25 12H15.75M8.75 8.25H12.75V12.25H8.75V8.25Z"/>
  </svg>
);

/*
 * Seven from Heroicons and three from Flowbite, both MIT.
 *
 * Same rule as the TailGrids six above, and the same arithmetic: three large,
 * well-made packs were read and **ten icons came out of them**, because
 * `iconMap` already held 109 keys covering this business's vocabulary. Nearly
 * everything each pack offers a network integrator was already here — server,
 * cpu, printer, lock, laptop, monitor, scanner, camera, fingerprint, fire — and
 * the rest is UI chrome this file has as direct-use icons, or a retail set
 * (a t-shirt, a teddy bear, a blender) nobody will point a solution at.
 *
 * Heroicons is the cleanest of the three structurally: 325 outline icons, one
 * viewBox, one stroke width, **nothing filled**, and no runtime dependencies.
 * Flowbite's paths carry no stroke width at all — it is inherited from a theme
 * store — which makes them pure geometry and the easiest of all to re-weight.
 *
 * The filled trap caught something in every pack: TailGrids' `IdCard` and
 * `Printer`, and Flowbite's `api-key`, are `fill="currentColor"` with no
 * stroke, and `base` sets `fill: none` — each would have rendered as nothing at
 * all. Heroicons' `Identification` is the outline equivalent and is what
 * `access-card` uses instead.
 *
 * Everything spreads `base`, so all ten carry this set's 1.7 rather than
 * Heroicons' 1.5 or Flowbite's 2. The keys are this project's names, for the
 * reason the Lucide note gives: a key is a value stored in MySQL.
 */

/* ---------------------------------------------------------- Heroicons */

/** Quoting and estimating — this catalogue is mostly priced per site. */
export const IconCalculator = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z"/>
  </svg>
);

/** A site survey — the visit before a quotation, which is a service here. */
export const IconSurvey = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"/>
  </svg>
);

/** A tablet, which `mobile`, `laptop` and `monitor` between them did not cover. */
export const IconTablet = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-15a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25Z"/>
  </svg>
);

/**
 * Access control, which sits next to CCTV in what this business installs.
 *
 * Heroicons' outline `Identification` rather than TailGrids' `IdCard`: that one
 * is `fill="currentColor"` with no stroke, so under `base` it renders as
 * nothing at all.
 */
export const IconAccessCard = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z"/>
  </svg>
);

/** System integration, which is most of what this company is hired to do. */
export const IconIntegration = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z"/>
  </svg>
);

/** Asset tagging, and the UPI code the shop already renders. */
export const IconQr = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/>
    <path d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z"/>
  </svg>
);

/** Consultancy — the part of the work that is advice rather than hardware. */
export const IconIdea = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/>
  </svg>
);

/* ----------------------------------------------------------- Flowbite */

/** Stock and asset labelling, which the store's own inventory implies. */
export const IconBarcode = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.992 4.983v13.934m6.97-13.934v13.934m5.976-13.934v13.934m2.987-13.934v13.934"/>
    <path d="M5.48 4.483v14.934M7.47 4.483v14.934M21.413 4.483v14.934M13.446 4.483v14.934"/>
  </svg>
);

/** A desktop tower, which `monitor` is not — one is the screen, one the machine. */
export const IconDesktop = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 15v5m-3 0h6M4 11h16M5 15h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1"/>
  </svg>
);

/** Asset and consignment tracking, distinct from `truck`, which is delivery. */
export const IconTracking = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 19h4m6 0h4m-6.963-4.384V8.634L17 5.94m-4.93 2.662L7.042 5.94M12 2.997l5.033 2.906v5.812L12 14.62l-5.033-2.906V5.903zM14 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>
  </svg>
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

  // Borrowed from TailGrids. See the note above them for why these six and not
  // the other 239.
  keyboard: IconKeyboard, handshake: IconHandshake, briefcase: IconBriefcase,
  megaphone: IconMegaphone, brain: IconBrain, newspaper: IconNewspaper,

  // Heroicons and Flowbite, both MIT. See the note above them for why ten out
  // of the 737 the two packs hold between them.
  calculator: IconCalculator, survey: IconSurvey, tablet: IconTablet,
  "access-card": IconAccessCard, integration: IconIntegration, qr: IconQr, idea: IconIdea,
  barcode: IconBarcode, desktop: IconDesktop, tracking: IconTracking,

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
