import type { IconName } from "@/components/icons";

/**
 * Static site content.
 *
 * Phase 1 renders the homepage from this file so the frontend is reviewable
 * before the CMS exists. In Phase 3 each block is replaced by an API read —
 * the component props are already shaped like the API resources, so swapping
 * the source should not require touching the components.
 */

export const contact = {
  phone: "+91 98765 43210",
  phoneHref: "tel:+919876543210",
  email: "support@technoware.in",
} as const;

export const mainNav = [
  { label: "Solutions", href: "/solutions", hasChildren: true },
  { label: "Products", href: "/products", hasChildren: true },
  { label: "Web Services", href: "/services", hasChildren: true },
  { label: "Industries", href: "/industries" },
  { label: "Support", href: "/support" },
  { label: "Resources", href: "/resources" },
] as const;

export const solutions: { title: string; slug: string; icon: IconName; summary: string; cta: string }[] = [
  { title: "Enterprise networking", slug: "networking", icon: "network",
    summary: "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.", cta: "networking" },
  { title: "Server infrastructure", slug: "servers", icon: "server",
    summary: "Physical and virtualised compute sized to the workload — domain services, line-of-business apps, hypervisor clusters.", cta: "servers" },
  { title: "Storage & NAS", slug: "storage", icon: "storage",
    summary: "Centralised storage with sane permissions, snapshots and capacity headroom — so shared drives stop being a liability.", cta: "storage" },
  { title: "Firewall & UTM", slug: "firewall", icon: "firewall",
    summary: "Next-gen firewall deployment, policy tuning, content filtering and site-to-site VPN, reviewed on a schedule rather than after an incident.", cta: "firewall" },
  { title: "Enterprise Wi-Fi", slug: "enterprise-wifi", icon: "wifi",
    summary: "Surveyed, controller-managed wireless built for density and roaming — offices, warehouses, campuses and shop floors.", cta: "Wi-Fi" },
  { title: "Backup & recovery", slug: "backup", icon: "backup",
    summary: "On-site and off-site backup with a documented, tested restore path — because an untested backup is just a hope.", cta: "backup" },
  { title: "Cybersecurity", slug: "cybersecurity", icon: "shield",
    summary: "Endpoint protection, patch discipline, access control and awareness — layered defence appropriate to your size and risk.", cta: "security" },
  { title: "CCTV & surveillance", slug: "surveillance", icon: "camera",
    summary: "IP camera design, NVR storage planning and remote viewing, integrated with the same network you already trust us with.", cta: "surveillance" },
  { title: "IT infrastructure AMC", slug: "amc", icon: "tools",
    summary: "Annual maintenance with defined SLAs, preventive visits, asset register and a support desk your staff can actually reach.", cta: "AMC" },
];

export const productCategories: { name: string; slug: string; icon: IconName; note: string }[] = [
  { name: "Servers", slug: "servers", icon: "server", note: "Rack, tower & blade" },
  { name: "Switches", slug: "switches", icon: "switch", note: "Access, core & PoE" },
  { name: "Routers", slug: "routers", icon: "router", note: "Edge & SD-WAN" },
  { name: "Firewalls", slug: "firewalls", icon: "firewall", note: "NGFW & UTM appliances" },
  { name: "Wi-Fi", slug: "wifi", icon: "wifi", note: "APs & controllers" },
  { name: "Storage", slug: "storage", icon: "storage", note: "NAS, SAN & drives" },
  { name: "UPS & power", slug: "ups-power", icon: "power", note: "Online & line-interactive" },
  { name: "Surveillance", slug: "surveillance", icon: "camera", note: "Cameras & NVR" },
  { name: "Accessories", slug: "accessories", icon: "plug", note: "Racks, cabling & optics" },
];

export const partners = [
  "Cisco", "Fortinet", "HPE Aruba", "Dell EMC", "Sophos", "Ubiquiti", "Synology", "APC",
] as const;

export const processSteps = [
  { n: "01", title: "Assess before we quote",
    body: "A site visit and an honest audit of what you have. We would rather tell you a switch has three good years left than sell you a new one." },
  { n: "02", title: "Design for the next five years",
    body: "Capacity, growth, failure modes and budget on paper before a single cable is pulled — with the reasoning written down, not kept in someone's head." },
  { n: "03", title: "Deploy with documentation",
    body: "Labelled racks, IP schemas, credentials handed over properly and an as-built document you own — even if you later leave us." },
  { n: "04", title: "Support with a real desk",
    body: "A ticket portal, a named engineer and an SLA clock that starts when you raise the ticket, not when someone gets around to it." },
] as const;

export const amcInclusions = [
  "Defined response & resolution SLAs",
  "Scheduled preventive site visits",
  "Live asset & warranty register",
  "Named engineer and escalation path",
  "Quarterly infrastructure review",
] as const;

export const industries: { name: string; slug: string; icon: IconName; note: string }[] = [
  { name: "Small & mid-size business", slug: "smb", icon: "shop", note: "Right-sized infrastructure without enterprise overhead." },
  { name: "Healthcare", slug: "healthcare", icon: "health", note: "Uptime, data protection and device segmentation." },
  { name: "Education", slug: "education", icon: "education", note: "High-density Wi-Fi, content filtering, lab networks." },
  { name: "Manufacturing", slug: "manufacturing", icon: "factory", note: "Shop-floor resilience and OT/IT separation." },
  { name: "Corporate", slug: "corporate", icon: "building", note: "Multi-site connectivity and standardised builds." },
  { name: "Government", slug: "government", icon: "gov", note: "Compliance-aware deployment and documentation." },
];

export const webServices: { title: string; slug: string; icon: IconName; body: string; note: string }[] = [
  { title: "Domain registration", slug: "domains", icon: "globe",
    body: "Register, transfer and renew domains with DNS managed correctly from day one.", note: ".com · .in · .co.in · .org" },
  { title: "Web hosting", slug: "web-hosting", icon: "cloud",
    body: "Linux and Windows hosting on managed infrastructure with backups and SSL included.", note: "Shared · Business · Managed" },
  { title: "Business email", slug: "business-email", icon: "mail",
    body: "Professional mailboxes on your own domain, with anti-spam, archiving and mobile sync.", note: "Google Workspace · Microsoft 365" },
  { title: "SSL certificates", slug: "ssl", icon: "cert",
    body: "DV, OV and wildcard certificates issued, installed and renewed before they expire.", note: "DV · OV · EV · Wildcard" },
  { title: "VPS & cloud servers", slug: "vps", icon: "vps",
    body: "Dedicated resources with root access for applications that have outgrown shared hosting.", note: "Linux · Windows · Managed" },
  { title: "Website services", slug: "website-services", icon: "code",
    body: "Corporate websites, migrations and ongoing maintenance built on modern, fast foundations.", note: "Design · Build · Maintain" },
];

/* ------------------------------------------------------------------
   PLACEHOLDER CONTENT — every figure below is invented to make the
   layout realistic. Replace with real numbers before launch.
   ------------------------------------------------------------------ */

export const heroStats = [
  { value: "16 yrs", label: "In the field" },
  { value: "340+", label: "Sites under AMC" },
  { value: "< 4 hrs", label: "First response SLA" },
  { value: "99.9%", label: "Managed uptime" },
] as const;

export const supportStats = [
  { value: "< 4h", label: "First response" },
  { value: "24/7", label: "Critical escalation" },
  { value: "96%", label: "Resolved in SLA" },
  { value: "340+", label: "Sites covered" },
] as const;

export const testimonial = {
  quote: "They inherited a network held together by guesswork. Six weeks later we had documentation, a firewall policy that made sense, and — for the first time — someone who picks up.",
  initials: "RK",
  name: "R. Kulkarni",
  role: "Head of IT, manufacturing group · 6 sites",
} as const;

export const caseStudies: { tag: string; title: string; slug: string; icon: IconName; body: string; results: { value: string; label: string }[] }[] = [
  { tag: "Manufacturing", title: "Six-plant network consolidation", slug: "six-plant-consolidation", icon: "factory",
    body: "Replaced six independently-built site networks with one standardised design, central firewall policy and site-to-site VPN.",
    results: [{ value: "-71%", label: "Network tickets" }, { value: "6 wks", label: "Cutover" }] },
  { tag: "Healthcare", title: "Hospital Wi-Fi & device segmentation", slug: "hospital-wifi", icon: "health",
    body: "High-density wireless across four floors with clinical devices, staff and guest traffic properly separated.",
    results: [{ value: "180", label: "Access points" }, { value: "Zero", label: "Clinical downtime" }] },
  { tag: "Corporate", title: "Server room rebuild & backup", slug: "server-room-rebuild", icon: "building",
    body: "Virtualised ageing physical servers, rebuilt the rack, and introduced a tested off-site restore path.",
    results: [{ value: "18 → 4", label: "Physical servers" }, { value: "22 min", label: "Tested RTO" }] },
];

export const posts = [
  { day: "12", month: "Aug", title: "Firewall rules that quietly stop working", slug: "firewall-rules-that-stop-working",
    excerpt: "Five policy patterns that pass review but fail in production, and how to catch them early.", meta: "Guide · 7 min read" },
  { day: "04", month: "Aug", title: "Sizing a UPS for a small server room", slug: "sizing-a-ups",
    excerpt: "Load calculation, runtime targets and the mistake almost everyone makes with power factor.", meta: "Guide · 5 min read" },
  { day: "28", month: "Jul", title: "Configuring business email on mobile", slug: "business-email-on-mobile",
    excerpt: "Step-by-step IMAP and Exchange setup for iOS and Android, with the ports that matter.", meta: "Knowledge base · 4 min read" },
  { day: "19", month: "Jul", title: "Why your Wi-Fi survey was wrong", slug: "why-your-wifi-survey-was-wrong",
    excerpt: "Predictive surveys assume an empty building. Here is what changes once the racking goes in.", meta: "Blog · 6 min read" },
] as const;

export const footerNav = [
  // Full titles — an earlier `.replace(" infrastructure", "")` turned
  // "Server infrastructure" into a bare "Server" in the footer.
  { heading: "Solutions", links: solutions.slice(0, 7).map((s) => ({ label: s.title, href: `/solutions/${s.slug}` })) },
  { heading: "Products", links: productCategories.slice(0, 7).map((c) => ({ label: c.name, href: `/products/${c.slug}` })) },
  { heading: "Web services", links: webServices.map((s) => ({ label: s.title, href: `/services/${s.slug}` })) },
  { heading: "Support", links: [
    { label: "Customer login", href: "/portal/login" },
    { label: "Submit a ticket", href: "/portal/tickets/new" },
    { label: "Track a ticket", href: "/portal/tickets" },
    { label: "Knowledge base", href: "/knowledge-base" },
    { label: "Downloads", href: "/downloads" },
    { label: "Contact", href: "/contact" },
  ] },
];
