import { base, type P } from "./icon-base";

/** The filled base the social marks use — `IconWhatsApp` is drawn solid, like a logo. */
const brand = { viewBox: "0 0 24 24", fill: "currentColor", width: 24, height: 24, "aria-hidden": true };

/**
 * The glyphs that draw the site's *chrome* — arrows, close, menu, search,
 * the basket — in a module of their own, and the reason is the client bundle.
 *
 * Turbopack keeps an application module whole: importing one export from
 * `icons.tsx` ships every glyph in it, all ~130 hand-drawn SVG components
 * plus the forty borrowed from Lucide and the map that names them — 47KB,
 * 14KB gzipped — on every public page, because the header wanted a chevron
 * and the basket wanted a trash can. Measured, not reasoned: the chunk was
 * still there after every identity-icon lookup had moved to the server.
 *
 * So a **client component imports from here**, never from `icons.tsx`. Every
 * icon in this file is one a client component uses; `icons.tsx` re-exports
 * them so server code and the icon map keep importing from one place. Add a
 * glyph here when a client component needs it, and nowhere else.
 */
export const IconCart = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
    <path d="M2.5 3.5h2.6l2.3 11.2h11l2.1-8.2H6.4" />
  </svg>
);
export const IconBox = (p: P) => (
  <svg {...base} {...p}><path d="m12 2.9 8.4 4.4v9.4L12 21.1 3.6 16.7V7.3z" /><path d="M3.6 7.3 12 11.8l8.4-4.5M12 11.8v9.3" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M4.8 12h14.4M13.2 6l6 6-6 6" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></svg>
);
export const IconEye = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="m5 12.5 4.6 4.6L19 7.6" /></svg>
);
export const IconZoomIn = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4M11 8.2v5.6M8.2 11h5.6" /></svg>
);
export const IconWhatsApp = (p: P) => (
  <svg {...brand} {...p}><path d="M12.04 2A9.9 9.9 0 0 0 2.1 11.9c0 1.75.46 3.46 1.33 4.97L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01a9.9 9.9 0 0 0 9.9-9.9A9.9 9.9 0 0 0 12.04 2zm0 18.14h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.22 8.22 0 1 1 6.99 3.87zm4.51-6.16c-.25-.12-1.46-.72-1.69-.8-.22-.09-.39-.13-.55.12-.16.25-.63.8-.77.96-.14.17-.28.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.71-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.07.15-1.17-.06-.11-.22-.17-.47-.29z" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
    <path d="M10.5 10.5v6M13.5 10.5v6" />
  </svg>
);
export const IconSliders = (p: P) => (
  <svg {...base} {...p}><path d="M4.6 6.4h14.8M4.6 12h14.8M4.6 17.6h14.8" /><circle cx="9.4" cy="6.4" r="1.9" /><circle cx="15" cy="12" r="1.9" /><circle cx="8" cy="17.6" r="1.9" /></svg>
);
export const IconPhone = (p: P) => (
  <svg {...base} {...p}><path d="M21 16.6v2.8a1.9 1.9 0 0 1-2.1 1.9 18.6 18.6 0 0 1-16-16A1.9 1.9 0 0 1 4.8 3.2h2.8a1.9 1.9 0 0 1 1.9 1.6c.1 1 .4 1.9.7 2.8a1.9 1.9 0 0 1-.4 2l-1.2 1.2a15 15 0 0 0 5.6 5.6l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.8.7a1.9 1.9 0 0 1 1.6 1.9z" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconMail = (p: P) => (
  <svg {...base} {...p}><rect x="2.6" y="4.8" width="18.8" height="14.4" rx="2.2" /><path d="m2.6 7.4 9.4 6 9.4-6" /></svg>
);
export const IconLink = (p: P) => (
  <svg {...base} {...p}><path d="M10 14a4.4 4.4 0 0 0 6.2.3l2.6-2.6a4.4 4.4 0 0 0-6.2-6.2l-1.5 1.5" /><path d="M14 10a4.4 4.4 0 0 0-6.2-.3l-2.6 2.6a4.4 4.4 0 0 0 6.2 6.2l1.5-1.5" /></svg>
);
export const IconEyeOff = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.9" />
    <path d="M6.6 6.9A17.4 17.4 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 3.6-.7" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base} strokeWidth={2.4} {...p}><path d="m6 9.4 6 5.6 6-5.6" /></svg>
);
