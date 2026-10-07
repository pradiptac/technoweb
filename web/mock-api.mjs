import { createServer } from 'node:http';

/* Mock of the Laravel API, implementing exactly the /api/v1 contract the
   frontend was written against. Used to verify the portal end-to-end while
   the real backend cannot be booted in this sandbox. */

const TOKEN = 'mock-token-abc123';
// What `/admin/customers/:id/impersonate` mints: a staff member's "View as"
// session. `/auth/me` reports `meta.impersonated` by which bearer arrived.
const IMPERSONATION_TOKEN = 'mock-impersonation-token-456';
/* Two rows so the queue screen has both states in it: one waiting, one live. */
const adminCustomers = [
  {
    id: 2, name: 'Priya Raman', email: 'priya@example.test', company: 'Lakeview Retail',
    phone: null, status: 'pending', status_label: 'Pending approval', status_note: null,
    email_verified: true, email_verified_at: '2026-08-20T09:14:00+00:00',
    approved_at: null, approved_by: null, ticket_count: 0,
    last_login_at: null, created_at: '2026-08-20T09:02:00+00:00',
  },
  {
    id: 1, name: 'Neil Basu', email: 'neil@meridianfoods.in', company: 'Meridian Foods',
    phone: '+91 98200 11223', status: 'active', status_label: 'Active', status_note: null,
    email_verified: true, email_verified_at: '2026-01-08T11:00:00+00:00',
    approved_at: '2026-01-08T11:05:00+00:00', approved_by: 'Administrator', ticket_count: 5,
    last_login_at: '2026-08-24T08:30:00+00:00', created_at: '2026-01-08T10:58:00+00:00',
  },
];

const customer = { id: 1, name: 'Neil Basu', email: 'neil@meridianfoods.in', company: 'Meridian Foods', phone: '+91 98200 11223', status: 'active', status_label: 'Active', email_verified: true };

const STAFF_TOKEN = 'mock-admin-token-xyz789';
/* The code `verify-code` accepts here. Fixed rather than random, so a
   walkthrough against the mock can be scripted — and so the wrong-code path is
   reachable by typing anything else. */
const MOCK_SIGN_IN_CODE = '123456';
const staff = {
  id: 1, name: 'P. Nair', email: 'staff@technoware.in',
  roles: [{ slug: 'admin', label: 'Administrator' }], is_active: true,
};
const staffList = [
  { id: 3, name: 'S. Rao', email: 's.rao@technoware.in', roles: [{ slug: 'support_engineer', label: 'Support engineer' }], is_active: true },
  { id: 4, name: 'A. Fernandes', email: 'a.fernandes@technoware.in', roles: [{ slug: 'support_engineer', label: 'Support engineer' }], is_active: true },
  { id: 5, name: 'M. Iyer', email: 'm.iyer@technoware.in', roles: [{ slug: 'support_engineer', label: 'Support engineer' }], is_active: true },
];

/* Mirrors TicketStatus::canTransitionTo() — an unavoidable second copy, same
   as the search regex below mirroring KnowledgeArticle::scopeSearch. */
const STATUS_LABELS = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In progress',
  pending_customer: 'Pending customer', resolved: 'Resolved', closed: 'Closed',
};
const TRANSITIONS = {
  open: ['assigned', 'in_progress', 'resolved', 'closed'],
  assigned: ['in_progress', 'pending_customer', 'resolved', 'closed'],
  in_progress: ['pending_customer', 'resolved', 'closed'],
  pending_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};
const nextStatuses = (status) => (TRANSITIONS[status] || []).map((v) => ({ value: v, label: STATUS_LABELS[v] }));
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };

const mk = (o) => ({
  /* The opening description stored encrypted when set (`docs/tickets.md`); the mock has nothing to seal, the flag draws the lock. */
  is_sensitive: false,
  is_overdue: false, due_at: '2026-08-19T09:00:00Z', assigned_to: null, merged_into: null,
  category: { id: 1, name: 'Network / connectivity' },
  created_at: '2026-08-17T09:12:00Z', updated_at: '2026-08-18T11:02:00Z', ...o,
  allowed_transitions: nextStatuses(o.status),
});

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

/*
  The ticket volume chart's series over a period, in the API's buckets:
  30 days, 13 or 26 Monday weeks, or 12 calendar months. Deterministic
  figures so a screenshot is repeatable.
*/
const VOLUME_PERIODS = { month: ['day', 30], quarter: ['week', 13], half: ['week', 26], year: ['month', 12] };
function buildVolumeSeries(period) {
  const key = VOLUME_PERIODS[period] ? period : 'month';
  const [bucket, count] = VOLUME_PERIODS[key];
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const starts = [];
  if (bucket === 'day') {
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(today.getTime() - i * 864e5));
  } else if (bucket === 'week') {
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 864e5);
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(monday.getTime() - i * 7 * 864e5));
  } else {
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1)));
  }
  const scale = bucket === 'day' ? 1 : bucket === 'week' ? 5 : 20;
  const points = starts.map((s, i) => {
    const next = starts[i + 1] ?? (bucket === 'day' ? new Date(s.getTime() + 864e5)
      : bucket === 'week' ? new Date(s.getTime() + 7 * 864e5)
      : new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1)));
    const end = new Date(Math.min(next.getTime() - 864e5, today.getTime()));
    return {
      date: iso(s), end: iso(end),
      created: ((i * 7) % 5) * scale + (i % 3),
      resolved: ((i * 5) % 4) * scale,
    };
  });
  // The period before, the same shape: the API's `previous` (2026-10-05).
  const previous = points.map((pt, i) => ({ ...pt, created: Math.max(0, pt.created - (i % 2)), resolved: Math.max(0, pt.resolved - (i % 3 === 0 ? 1 : 0)) }));
  return { period: key, bucket, points, previous };
}

function buildAdminDashboard(volumePeriod = 'month') {
  const openStates = ['open', 'assigned', 'in_progress', 'pending_customer'];
  const openTickets = tickets.filter((t) => openStates.includes(t.status));
  const breakdown = {};
  // Keyed by the status value, like the real endpoint. It used to key on the
  // human label, which left the dashboard with a sentence where it needed a
  // status and every bar falling back to grey.
  tickets.forEach((t) => { breakdown[t.status] = (breakdown[t.status] || 0) + 1; });

  return {
    counts: {
      open_tickets: openTickets.length,
      overdue_tickets: tickets.filter((t) => t.is_overdue).length,
      customers: 1,
      products: products.length,
      blog_posts: posts.length,
      new_enquiries: 2,
    },
    /*
     * The sales pipeline. Present here because the mock signs in as an
     * administrator, who passes every role check — the real API sends null to
     * anyone without `sales_manager`, so the console must handle both.
     */
    leads: {
      new: 2, open: 3, overdue: 1, unassigned: 1,
      series: Array.from({ length: 30 }, (_, i) => (i * 7) % 4),
      funnel: { days: 90, received: 48, contacted: 31, won: 9 },
    },
    // Engineer visits (docs/visits.md): null for a role that cannot open the queue.
    visits: { awaiting: visitRequests.filter((v) => v.status === 'requested').length, today: 0 },
    // Online meetings (docs/meetings-contract.md): null for a role that cannot open the list.
    meetings: {
      today: meetings.filter((m) => m.status === 'scheduled' && m.starts_at.slice(0, 10) === isoDay(0)).length,
      needs_outcome: meetings.filter((m) => m.needs_outcome).length,
    },
    // Online meetings (docs/meetings-contract.md): null for a role that cannot open them.
    meetings: { today: 0, needs_outcome: 0 },
    recent_tickets: tickets.slice(0, 8),
    high_priority: openTickets.filter((t) => t.priority === 'critical' || t.priority === 'high').slice(0, 5),
    status_breakdown: breakdown,
    metrics: {
      window_days: 30,
      volume: buildVolumeSeries('month').points.map(({ date, created, resolved }) => ({ date, created, resolved })),
      volume_series: buildVolumeSeries(volumePeriod),
      volume_trend: { current: 12, previous: 9, change: 33 },
      first_response_hours: 3.4,
      resolution_hours: 41.2,
      sla_first_response: { pct: 88, of: 17 },
      open_by_priority: [{ label: 'high', total: 2 }, { label: 'medium', total: 1 }],
      open_by_category: [{ label: 'Networking', total: 2 }, { label: 'Hardware', total: 1 }],
      // A working week's shape: busy mornings Monday to Friday, quiet weekends.
      arrivals: (() => {
        const cells = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) =>
          d < 5 && h >= 9 && h <= 18 ? ((d + h) % 5) + (h < 13 ? 2 : 0) : (h % 7 === 0 ? 1 : 0)));
        const flat = cells.flat();
        return { days: 90, cells, peak: Math.max(...flat), total: flat.reduce((a, b) => a + b, 0) };
      })(),
    },
  };
}


/*
  Saved replies for the support desk. The management list carries the
  stored text with its {{placeholders}}; the per-ticket read fills them the
  way the API does, because the reply form pastes what it is given.
*/
const CANNED_PLACEHOLDERS = [
  { name: 'customer_name', about: "The customer's full name." },
  { name: 'first_name', about: 'Their first name — the first word of it.' },
  { name: 'company', about: 'Their company, or blank.' },
  { name: 'reference', about: 'The ticket reference.' },
  { name: 'subject', about: 'The ticket subject.' },
  { name: 'agent_name', about: 'Your own name, as the signed-in staff member.' },
];
const cannedReplies = [
  { id: 1, title: 'Looking into it', body: 'Hello {{first_name}},\n\nThanks for raising {{reference}}. An engineer is looking at it now and will update you here.\n\n— {{agent_name}}', sort_order: 1, created_by: { id: 1, name: 'Priya Sharma' }, created_at: '2026-09-01T09:00:00+05:30', updated_at: '2026-09-01T09:00:00+05:30' },
  { id: 2, title: 'Firmware rolled back', body: 'Hello {{first_name}},\n\nWe have rolled the switch back a firmware version. Please watch it this afternoon and reply on {{reference}} if it drops again.\n\n— {{agent_name}}', sort_order: 2, created_by: { id: 1, name: 'Priya Sharma' }, created_at: '2026-09-02T09:00:00+05:30', updated_at: '2026-09-02T09:00:00+05:30' },
];
function fillCannedReply(body, t) {
  const values = {
    customer_name: customer.name, first_name: customer.name.split(/\s+/)[0], company: customer.company || '',
    reference: t.reference, subject: t.subject, agent_name: staff.name,
  };
  return body
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => (k in values ? values[k] : ''));
}

const tickets = [
  mk({ id: 1, reference: 'TW-2026-00021', subject: 'AP-04 dropping clients in the warehouse',
    status: 'in_progress', status_label: 'In progress', priority: 'high', priority_label: 'High',
    is_overdue: true, assigned_to: { id: 3, name: 'S. Rao' }, channel: 'email',
    description: 'Since Tuesday morning the handheld scanners in the warehouse lose Wi-Fi every few minutes. The office side is completely fine. It started after the power cut.' }),
  mk({ id: 2, reference: 'TW-2026-00019', subject: 'New user setup — accounts team',
    status: 'assigned', status_label: 'Assigned', priority: 'normal', priority_label: 'Normal',
    assigned_to: { id: 4, name: 'A. Fernandes' }, category: { id: 9, name: 'New request / change' },
    description: 'Two new starters in accounts on Monday. Need AD accounts, email and access to the finance share.' }),
  mk({ id: 3, reference: 'TW-2026-00014', subject: 'NAS capacity nearing threshold',
    status: 'pending_customer', status_label: 'Pending customer', priority: 'high', priority_label: 'High',
    category: { id: 2, name: 'Server / storage' }, description: 'The NAS is at 91% capacity.' }),
  mk({ id: 4, reference: 'TW-2026-00009', subject: 'Quarterly firewall policy review',
    status: 'resolved', status_label: 'Resolved', priority: 'low', priority_label: 'Low',
    category: { id: 3, name: 'Firewall / security' }, description: 'Scheduled quarterly review.' }),
  mk({ id: 5, reference: 'TW-2026-00002', subject: 'Boardroom projector not reaching the network',
    status: 'closed', status_label: 'Closed', priority: 'low', priority_label: 'Low',
    description: 'Projector cannot see the network after the office move.' }),
];

const messages = {
  'TW-2026-00021': [
    { id: 11, body: 'Thanks — I can see AP-04 flapping in the controller logs. Could you confirm whether the racking in aisle 3 was moved during the power cut work?', is_internal: false, is_sensitive: false,
      author: { id: 3, name: 'S. Rao', type: 'staff' }, attachments: [], rating: 4, rated_at: '2026-08-17T12:00:00Z', report_reason: null, reported_at: null, created_at: '2026-08-17T11:40:00Z' },
    { id: 12, body: 'Yes — the contractors moved two pallet racks closer to that corner on Tuesday afternoon.', is_internal: false, is_sensitive: false,
      author: { id: 1, name: 'Neil Basu', type: 'customer' },
      attachments: [{ id: 5, filename: 'warehouse-layout.pdf', url: '#', size: 284000, mime: 'application/pdf' }],
      rating: null, rated_at: null, report_reason: null, reported_at: null, created_at: '2026-08-17T14:02:00Z' },
    { id: 14, body: 'Checked the install photos — the AP is mounted on a steel purlin, not the ceiling grid. Flagging in case the resurvey needs a bracket swap too.', is_internal: true, is_sensitive: false,
      author: { id: 5, name: 'M. Iyer', type: 'staff' }, attachments: [], rating: null, rated_at: null, report_reason: null, reported_at: null, created_at: '2026-08-17T15:20:00Z' },
    { id: 13, body: 'That will be it. Metal racking that close to an AP kills the 5 GHz coverage. I am scheduling a site visit Thursday to reposition AP-04 and re-survey that aisle.', is_internal: false, is_sensitive: true,
      author: { id: 3, name: 'S. Rao', type: 'staff' }, attachments: [], rating: null, rated_at: null, report_reason: 'A site visit on Thursday leaves the aisle without Wi-Fi for three more days.', reported_at: '2026-08-18T10:00:00Z', created_at: '2026-08-18T09:15:00Z' },
  ],
};

const categories = [
  { id: 1, name: 'Network / connectivity' }, { id: 2, name: 'Server / storage' },
  { id: 3, name: 'Firewall / security' }, { id: 4, name: 'Wi-Fi' },
  { id: 5, name: 'Email / hosting' }, { id: 6, name: 'Hardware fault' },
  { id: 9, name: 'New request / change' },
];


/* ---------------- marketing content (Phase 2) ---------------- */

const solutions = [
  { id:1, title:'Enterprise networking', slug:'networking', icon:'network',
    summary:'Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.' },
  { id:2, title:'Server infrastructure', slug:'servers', icon:'server',
    summary:'Physical and virtualised compute sized to the workload.' },
  { id:3, title:'Firewall & UTM', slug:'firewall', icon:'firewall',
    summary:'Next-gen firewall deployment, policy tuning and site-to-site VPN.' },
].map(s => ({ ...s, hero_image:null, hero_image_alt:null, hero_image_focus:null, status:'published' }));

const solutionDetail = {
  ...solutions[0],
  problem_statement:'Most office networks were never designed — they accreted. A switch here, an access point there, and eventually nobody can say which VLAN a device is on or why a cable run terminates where it does.',
  overview:'<p>We start with a survey of what is physically installed, then produce an addressing plan, a switching topology and a cable schedule before touching anything.</p><h2>How the work runs</h2><p>Cutover happens out of hours, in stages, with a documented rollback at every step.</p><ul><li>Core and access switching</li><li>VLAN segmentation</li><li>Inter-VLAN routing and ACLs</li></ul>',
  benefits:['A network diagram that matches reality','Labelled patching, both ends','Segmented traffic so one bad device cannot flood the network','Capacity headroom for three to five years'],
  technologies:['Cisco Catalyst','HPE Aruba CX','Ubiquiti UniFi','802.1X','LACP','RSTP'],
  products:[{ id:1, name:'Catalyst CBS350-24T-4G', slug:'cisco-cbs350-24t-4g', brand:{ id:1, name:'Cisco', slug:'cisco', logo:null } }],
  industries:[{ id:4, name:'Manufacturing', slug:'manufacturing', summary:'Shop-floor resilience.', icon:'factory' }],
  faqs:[
    { id:1, question:'Can you work around our production hours?', answer:'Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage.' },
    { id:2, question:'Do we have to replace everything at once?', answer:'Almost never. We stage the work so the oldest and riskiest equipment goes first, and the rest follows as budget allows.' },
  ],
  seo:null,
};

/*
  Service categories (2026-09-29): the tabs the services are grouped under,
  in the three the seeder makes. Hardware draws its services' pictures as the
  card (`image_background`), so the picture-background layout renders against
  the mock; the other two keep the ordinary card.
*/
const MOCK_PORT = Number(process.env.MOCK_PORT) || 8899;
const serviceCategories = [
  { id:1, name:'Web services', slug:'web-services', description:'Domains, hosting, email and the websites on top of them.', icon:'globe', sort_order:0, image_background:false, is_active:true },
  { id:2, name:'Hardware services', slug:'hardware-services', description:'Repairs and support for the machines your people use every day.', icon:'wrench', sort_order:1, image_background:true, is_active:true },
  { id:3, name:'Installation services', slug:'installation-services', description:'Cabling, cameras, Wi-Fi and racks, installed and documented.', icon:'cable', sort_order:2, image_background:false, is_active:true },
];
const serviceImage = (slug) => `http://127.0.0.1:${MOCK_PORT}/storage/media/services/${slug}.jpg`;
const serviceHighlights = {
  domains: ['.com', '.in', '.co.in', '.org'],
  'web-hosting': ['Shared', 'Business', 'Managed'],
  'business-email': ['Google Workspace', 'Microsoft 365'],
  ssl: ['DV', 'OV', 'EV', 'Wildcard'],
  vps: ['Linux', 'Windows', 'Managed'],
  'website-services': ['Design', 'Build', 'Maintain'],
  'laptop-desktop-repair': ['Laptops', 'Desktops', 'Data kept intact'],
  'server-hardware-support': ['Dell', 'HPE', 'Lenovo', 'On site'],
  'printer-peripheral-service': ['Laser', 'Inkjet', 'Multifunction'],
  'structured-network-cabling': ['Cat6', 'Cat6A', 'Fibre', 'Certified'],
  'cctv-installation': ['IP cameras', 'NVR', 'Remote viewing'],
  'wifi-installation': ['Site survey', 'Wi-Fi 6', 'Guest networks'],
  'server-rack-installation': ['Racks', 'UPS', 'Cable management'],
};
const serviceRow = (id, title, slug, icon, summary, categoryId, withImage) => {
  const c = serviceCategories.find((x) => x.id === categoryId) ?? null;
  return {
    id, title, slug, icon, summary, sort_order: id,
    highlights: serviceHighlights[slug] ?? [],
    category: c ? { id: c.id, name: c.name, slug: c.slug } : null,
    image: withImage ? serviceImage(slug) : null,
    image_alt: withImage ? `${title}.` : null,
    image_focus: null,
  };
};
const services = [
  serviceRow(1, 'Domain registration', 'domains', 'globe', 'Register, transfer and renew domains with DNS managed correctly from day one.', 1, true),
  serviceRow(2, 'Web hosting', 'web-hosting', 'cloud', 'Linux and Windows hosting with backups and SSL included.', 1, true),
  serviceRow(3, 'Business email', 'business-email', 'mail', 'Professional mailboxes on your own domain.', 1, false),
  serviceRow(4, 'SSL certificates', 'ssl', 'cert', 'DV, OV and wildcard certificates issued, installed and renewed on time.', 1, false),
  serviceRow(5, 'VPS & cloud servers', 'vps', 'vps', 'Dedicated resources with root access for applications that outgrew shared hosting.', 1, false),
  serviceRow(6, 'Website services', 'website-services', 'code', 'Corporate websites, migrations and ongoing maintenance.', 1, false),
  serviceRow(7, 'Laptop and desktop repair', 'laptop-desktop-repair', 'laptop', 'Diagnosis, parts and repair for the machines on every desk, on site or at our bench.', 2, true),
  serviceRow(8, 'Server hardware support', 'server-hardware-support', 'server', 'Disks, memory, power supplies and controllers replaced before a fault becomes an outage.', 2, true),
  serviceRow(9, 'Printer and peripheral service', 'printer-peripheral-service', 'printer', 'Printers, scanners and the rest of the desk kept working.', 2, false),
  serviceRow(10, 'Structured network cabling', 'structured-network-cabling', 'cable', 'Cat6 and fibre runs, patch panels and labels you can read a year later.', 3, true),
  serviceRow(11, 'CCTV installation', 'cctv-installation', 'camera', 'Cameras, recorders and remote viewing, placed where they see what matters.', 3, false),
  serviceRow(12, 'Wi-Fi installation', 'wifi-installation', 'wifi', 'Surveyed, installed and tuned wireless for offices, floors and campuses.', 3, false),
  serviceRow(13, 'Server rack installation', 'server-rack-installation', 'rack', 'Racks built, powered, cooled and cable-managed for the room they sit in.', 3, false),
];
const adminServiceCategory = (c) => ({
  ...c, services_count: services.filter((s) => s.category?.id === c.id).length,
  created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z',
});

const industries = [
  { id:1, name:'Small & mid-size business', slug:'smb', icon:'shop', summary:'Right-sized infrastructure without enterprise overhead.' },
  { id:4, name:'Manufacturing', slug:'manufacturing', icon:'factory', summary:'Shop-floor resilience and OT/IT separation.' },
];

const productCategories = [
  { id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null, image:null, image_alt:null, image_focus:null, product_count:1 },
  { id:2, name:'Firewalls', slug:'firewalls', description:'NGFW & UTM appliances', icon:'firewall', parent_id:null, image:null, image_alt:null, image_focus:null, product_count:0 },
];

/* Brands that have a published product — the same restriction Laravel applies,
   because a facet that can only return nothing is worse than an absent one. */
const brands = [
  { id:1, name:'Cisco', slug:'cisco', logo:null, partner_tier:'Select Partner' },
];

/* The company profile — three plain collections that answer 200 when empty.
   URLs, never paths; `image_alt`/`logo_alt`/`photo_alt` fall back to the name. */
const certifications = [
  { id:1, name:'ISO 9001:2015', issuer:'TÜV SÜD', certificate_number:'QM 09 1234 567',
    issued_on:'2024-03-14', valid_until:'2027-03-13',
    description:'Quality management for the supply, installation and support of IT infrastructure.',
    image:null, image_alt:'ISO 9001:2015', image_focus:null, file:null },
];
const clients = [
  { id:1, name:'Meridian Foods', logo:null, logo_alt:'Meridian Foods', logo_focus:null, website_url:'https://meridian.example',
    note:'Plant-wide network and CCTV across two sites.', is_featured:true,
    industry:{ id:1, name:'Manufacturing', slug:'manufacturing' } },
];
const team = [
  { id:1, name:'Priya Nair', designation:'Network Engineer', department:'Engineering',
    bio:'Wi-Fi surveys, VLAN design and the as-built documentation that goes with them.',
    photo:null, photo_alt:'Priya Nair', photo_focus:null, email:null, linkedin_url:null,
    certifications:[ { name:'CCNA', issuer:'Cisco', issued_on:'2023-08-01', expires_on:'2027-08-01' } ] },
];


/* Structured data, as the API now returns it.
   Mirrors App\Support\StructuredData: built server-side, on detail responses
   only, with anything unknown omitted rather than guessed -- a null in JSON-LD
   is a malformed value for a field that was declared, not "unknown". */
const SCHEMA_ORG = 'https://schema.org';
const prune = (o) => Object.fromEntries(Object.entries(o)
  .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? prune(v) : v])
  .filter(([, v]) => v !== null && v !== undefined && v !== '' &&
    !(Array.isArray(v) && v.length === 0) &&
    !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)));

const publisher = () => ({ '@type': 'Organization', name: 'Technoware', url: 'https://www.technoware.in' });

const productSchema = (p) => prune({
  '@context': SCHEMA_ORG, '@type': 'Product',
  name: p.name, description: p.short_description ?? null,
  url: `https://www.technoware.in/products/${p.slug}`,
  sku: p.sku ?? null,
  brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : null,
  // No offers node: an Offer without a price is an error, and nothing in the
  // marketing catalogue has a price. The store's own schema below does.
});

const rupees = (paise) => `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

/* Mirrors StructuredData::storeProduct(): a Product with a real price. */
const storeProductSchema = (p) => prune({
  '@context': SCHEMA_ORG, '@type': 'Product',
  name: p.name, description: p.short_description ?? null,
  url: `https://www.technoware.in/store/products/${p.slug}`,
  sku: p.sku ?? null,
  brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : null,
  offers: {
    '@type': 'Offer', price: rupees(p.price_paise),
    url: `https://www.technoware.in/store/products/${p.slug}`, priceCurrency: 'INR',
    priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'INR', valueAddedTaxIncluded: true },
    availability: `https://schema.org/${p.in_stock ? 'InStock' : 'OutOfStock'}`,
    itemCondition: 'https://schema.org/NewCondition',
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0.00', currency: 'INR' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
    },
    hasMerchantReturnPolicy: p.returnable
      ? { '@type': 'MerchantReturnPolicy', applicableCountry: 'IN', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7 }
      : { '@type': 'MerchantReturnPolicy', applicableCountry: 'IN', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' },
    seller: publisher(),
  },
});

/* Mirrors App\Support\Store\ProductFeed: one row per buyable thing. */
const storeFeedRows = () => storeProducts.flatMap((p) => {
  if (p.type === 'service') return [];
  const base = (v) => ({
    id: v ? `sp-${p.id}-${v.id}` : `sp-${p.id}`,
    ...(v ? { item_group_id: `sp-${p.id}` } : {}),
    title: v ? `${p.name} — ${v.name}` : p.name,
    description: p.short_description ?? p.name,
    link: `https://www.technoware.in/store/products/${p.slug}`,
    image_link: 'https://www.technoware.in/opengraph-image',
    price: `${rupees(p.compare_at_paise && p.compare_at_paise > (v?.price_paise ?? p.price_paise) ? p.compare_at_paise : (v?.price_paise ?? p.price_paise))} INR`,
    ...(p.compare_at_paise && p.compare_at_paise > (v?.price_paise ?? p.price_paise) ? { sale_price: `${rupees(v?.price_paise ?? p.price_paise)} INR` } : {}),
    availability: (v?.in_stock ?? p.in_stock) ? 'in_stock' : 'out_of_stock',
    condition: 'new',
    ...(p.brand ? { brand: p.brand.name } : {}),
    identifier_exists: 'no',
    ...(p.category ? { product_type: p.category.name } : {}),
    shipping_price: '0.00 INR', shipping_country: 'IN',
    shipping_service: 'Standard Shipping', min_transit_time: 3, max_transit_time: 7,
    min_handling_time: 0, max_handling_time: 2,
    ...(v?.options ? { product_detail: Object.entries(v.options).map(([name, value]) => ({ section: 'Specification', name, value })) } : {}),
  });
  return p.variations?.length ? p.variations.map(base) : [base(null)];
});

const articleSchema = (r, type, prefix) => prune({
  '@context': SCHEMA_ORG, '@type': type,
  headline: r.title, description: r.excerpt ?? null,
  datePublished: r.published_at ?? null,
  // updated_at, never published_at -- the defect that moved this server-side.
  dateModified: r.updated_at ?? r.published_at ?? null,
  author: publisher(), publisher: publisher(),
  url: `https://www.technoware.in${prefix}${r.slug}`,
});

const serviceSchema = (r, prefix) => prune({
  '@context': SCHEMA_ORG, '@type': 'Service',
  name: r.title, description: r.summary ?? null,
  url: `https://www.technoware.in${prefix}${r.slug}`,
  provider: publisher(), serviceType: r.title,
});

/* ------------------------------------------------------------------ store

   The shop is a **different list** from the catalogue below, which is the
   whole point of the module: what is sold online is maintained separately
   from what the site advertises. So these are their own rows with their own
   ids, and nothing here is derived from `products`.

   Every amount is paise, as an integer, exactly as Laravel sends it. */
const storeCategories = [
  // `icon_url` is the small 3D mark the rail renders; `image_url` is the
  // photograph a share preview uses. One category carries both and one carries
  // neither, because the rail draws an empty tile for the second and a fixture
  // that never sends null would hide that branch.
  // `filter_specs` (2026-09-26): the spec labels a category offers as filters.
  { id: 1, name: 'Switches', slug: 'switches', description: 'Managed and unmanaged access switches.', icon_url: 'http://127.0.0.1:8899/storage/mock/switch-icon.png', image_url: null, image_focus: null, product_count: 2, filter_specs: ['Ports', 'Rack units'] },
  { id: 2, name: 'Licences', slug: 'licences', description: 'Software and security licences, delivered by activation code.', icon_url: null, image_url: null, image_focus: null, product_count: 1, filter_specs: [] },
];

/*
 * The specification filter (2026-09-26), the same rules `SpecFilter` keeps:
 * a product's pairs are its sheet plus every variation's options, matched on
 * a trimmed, collapsed, lower-cased key; OR within a label, AND across; a
 * label counted under the *other* labels' choices only.
 */
const specKeyOf = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
const specPairsOf = (product) => [
  ...Object.entries(product.specifications || {}),
  ...(product.variations || []).flatMap((v) => Object.entries(v.options || {})),
].filter(([l, v]) => specKeyOf(l) && specKeyOf(v));
function specSelection(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) {
    const m = /^spec\[(.+)\]\[\d*\]$/.exec(k);
    if (!m || !specKeyOf(v)) continue;
    (out[specKeyOf(m[1])] ??= new Set()).add(specKeyOf(v));
  }
  return out;
}
function matchesSpecs(product, selection, except = null) {
  const pairs = specPairsOf(product).map(([l, v]) => [specKeyOf(l), specKeyOf(v)]);
  return Object.entries(selection).every(([label, values]) =>
    label === except || pairs.some(([l, v]) => l === label && values.has(v)));
}

const storeProducts = [
  { id: 1, name: 'CBS350-24T-4G Managed Switch', slug: 'cbs350-24t-4g', sku: 'CBS350-24T-4G', is_featured: true,
    type: 'physical',
    short_description: '24-port Gigabit managed switch with 4 SFP uplinks.',
    description: '<p>A managed access switch for wiring closets that need proper VLAN support.</p>',
    specifications: { Ports: '24 x 1G', Uplinks: '4 x SFP', 'Rack units': '1U' },
    features: ['Layer 3 lite static routing', 'Fanless', 'Limited lifetime warranty'],
    images: [], image_alts: [], image_focuses: [],
    price_paise: 4720000, compare_at_paise: 5310000,
    in_stock: true, availability: 'in_stock', handling_days: 2, returnable: true, is_featured: true,
    created_at: '2026-01-15T00:00:00Z',
    category: storeCategories[0], brand: { id: 1, name: 'Cisco', slug: 'cisco', logo: null },
    variations: [
      { id: 11, name: '24-Port', sku: 'CBS350-24T', options: { Ports: '24' }, price_paise: 4720000, in_stock: true, image_url: null, image_alt: null, image_focus: null },
      { id: 12, name: '48-Port', sku: 'CBS350-48T', options: { Ports: '48' }, price_paise: 7080000, in_stock: true, image_url: null, image_alt: null, image_focus: null },
    ] },
  { id: 2, name: 'Unmanaged 8-Port Switch', slug: 'unmanaged-8-port-switch', sku: 'SG108',
    type: 'physical',
    short_description: 'Eight Gigabit ports, no configuration, metal case.',
    description: null, specifications: {}, features: [],
    images: [], image_alts: [], image_focuses: [],
    price_paise: 129900, in_stock: false, returnable: true,
    created_at: '2026-01-15T00:00:00Z',
    category: storeCategories[0], brand: null, variations: [] },
  { id: 3, name: 'Endpoint Security 1 Year', slug: 'endpoint-security-1-year', sku: 'EPS-1Y',
    type: 'digital',
    short_description: 'One year of endpoint protection, delivered as an activation code.',
    description: null, specifications: {}, features: [],
    images: [], image_alts: [], image_focuses: [],
    price_paise: 236000, in_stock: true, returnable: false,
    // Deliberately recent, computed rather than a fixed date, so the "New"
    // ribbon (isNewProduct, 30-day window) has something to render against
    // under `npm run mock` however long the fixture has existed.
    created_at: new Date().toISOString(),
    category: storeCategories[1], brand: null, variations: [] },
];

/*
 * Store reviews (docs/store.md, "Reviews"): three published on the first
 * product, and one waiting in the console's queue. `rating` is the summary
 * the API keeps on the product — null until something is published.
 */
const storeReviews = [
  { id: 901, product_id: 1, display_name: 'Asha R.', verified: true, variant_label: '24-Port', rating: 5, title: 'Quiet and simple', body: 'Racked it on a Friday, VLANs up in an hour. Fanless means the office never hears it.', published_at: '2026-09-02T10:00:00+05:30', status: 'published', is_featured: true },
  { id: 902, product_id: 1, display_name: 'Vikram S.', verified: true, variant_label: '48-Port', rating: 4, title: null, body: 'Does what it says. The web UI is slow to load but everything is there.', published_at: '2026-09-10T15:30:00+05:30', status: 'published', is_featured: false },
  { id: 903, product_id: 1, display_name: 'Meera K.', verified: false, variant_label: null, rating: 4, title: 'Good value', body: 'Bought through a reseller, supported here anyway.', published_at: '2026-09-18T09:12:00+05:30', status: 'published', is_featured: false },
  { id: 904, product_id: 2, display_name: 'Neil B.', verified: true, variant_label: null, rating: 2, title: null, body: 'Arrived with a bent bracket.', published_at: null, status: 'pending', is_featured: false },
];
for (const sp of storeProducts) sp.rating = null;
storeProducts[0].rating = { average: 4.3, count: 3 };
const REVIEW_SORT = {
  featured: (a, b) => (b.is_featured - a.is_featured) || (b.rating - a.rating) || b.published_at.localeCompare(a.published_at),
  newest: (a, b) => b.published_at.localeCompare(a.published_at),
  highest: (a, b) => (b.rating - a.rating) || b.published_at.localeCompare(a.published_at),
  lowest: (a, b) => (a.rating - b.rating) || b.published_at.localeCompare(a.published_at),
};
const publicReview = (r) => ({ id: r.id, display_name: r.display_name, verified: r.verified, variant_label: r.variant_label, rating: r.rating, title: r.title, body: r.body, published_at: r.published_at });
const adminReview = (r) => {
  const sp = storeProducts.find((x) => x.id === r.product_id);
  const labels = { pending: 'Waiting', published: 'Published', rejected: 'Rejected', spam: 'Spam' };
  return { ...publicReview(r), product: sp ? { id: sp.id, name: sp.name, slug: sp.slug } : null, customer: { id: 1, name: r.display_name, email: 'reviewer@example.test' }, order_id: r.verified ? 1 : null, status: r.status, status_label: labels[r.status], is_featured: r.is_featured, moderated_at: null, moderated_by: null, created_at: r.published_at ?? '2026-09-25T10:00:00+05:30', updated_at: r.published_at ?? '2026-09-25T10:00:00+05:30' };
};

/* The basket, held in memory and keyed by token -- enough for the frontend to
   be built and audited against, and deliberately not persisted: a mock that
   survived a restart would hide the fact that a real cart is a database row. */
/* Orders, in memory. Enough for the checkout and the order page to be built
   and audited against; a mock that persisted them would hide the fact that a
   real order is a row with a status somebody moves. */
const orders = new Map();
let orderSeq = 0;

const carts = new Map();
/* The checkout's email and mobile per basket (`PATCH /cart/contact`). The
   mock never sends a reminder, so `reminders` is always false and no restore
   token is ever minted — `GET /cart/restore/{token}` answers 404. */
const cartContacts = new Map();

const cartFor = (token) => {
  const key = token && carts.has(token) ? token : `mock-cart-${carts.size + 1}`;
  if (!carts.has(key)) carts.set(key, []);
  return { token: key, lines: carts.get(key) };
};

/* Wishlists, in memory, the basket's arrangement: a guest's by the
   X-Wishlist-Token header, the one portal customer's by the bearer. A token
   never reaches the account's list, and a request carrying both merges the
   guest's into the account's and answers token null -- which is what makes
   the Next server forget the cookie, exactly as Laravel's Wishlists does. */
const wishlists = new Map();
let wishSeq = 0;
const ACCOUNT_WISHLIST = 'account';

const wishlistFor = (req, create = false) => {
  const guest = req.headers['x-wishlist-token'];
  const signedIn = [TOKEN, IMPERSONATION_TOKEN].includes((req.headers.authorization || '').replace('Bearer ', ''));
  const impersonated = (req.headers.authorization || '').replace('Bearer ', '') === IMPERSONATION_TOKEN;

  if (signedIn) {
    if (guest && guest !== ACCOUNT_WISHLIST && wishlists.has(guest) && !impersonated) mergeWishlist(guest);
    if (!wishlists.has(ACCOUNT_WISHLIST) && create) wishlists.set(ACCOUNT_WISHLIST, { lines: [], email: null, alertsOff: false });
    return wishlists.has(ACCOUNT_WISHLIST) ? { key: ACCOUNT_WISHLIST, list: wishlists.get(ACCOUNT_WISHLIST) } : null;
  }

  if (guest && guest !== ACCOUNT_WISHLIST && wishlists.has(guest)) return { key: guest, list: wishlists.get(guest) };
  if (!create) return null;

  const key = `mock-wishlist-${String(++wishSeq).padStart(50, '0')}`;
  wishlists.set(key, { lines: [], email: null, alertsOff: false });
  return { key, list: wishlists.get(key) };
};

const mergeWishlist = (guest) => {
  const from = wishlists.get(guest);
  if (!from) return;
  if (!wishlists.has(ACCOUNT_WISHLIST)) wishlists.set(ACCOUNT_WISHLIST, { lines: [], email: null, alertsOff: false });
  const into = wishlists.get(ACCOUNT_WISHLIST);
  for (const l of from.lines) {
    if (!into.lines.some((x) => x.product_id === l.product_id && x.variation_id === l.variation_id)) into.lines.push(l);
  }
  wishlists.delete(guest);
};

const wishlistSummary = (found) => {
  if (!found) return { token: null, account: false, items: [], item_count: 0, email: null, alerts: false, alerts_off: false };
  const account = found.key === ACCOUNT_WISHLIST;
  const items = found.list.lines.map((l) => {
    const product = storeProducts.find((x) => x.id === l.product_id);
    const variation = product?.variations?.find((v) => v.id === l.variation_id) ?? null;
    const now = variation?.price_paise ?? product?.price_paise ?? 0;
    return {
      id: l.id, product_id: l.product_id, variation_id: variation?.id ?? null,
      name: product?.name ?? 'Unknown', variation_name: variation?.name ?? null, slug: product?.slug ?? '',
      image_url: null, image_alt: null, price_paise: now, price_at_save_paise: l.price_at_save,
      saving_paise: now < l.price_at_save ? l.price_at_save - now : null,
      in_stock: product?.in_stock !== false,
      needs_choice: !variation && (product?.variations?.length ?? 0) > 0,
      added_at: l.added_at,
    };
  });
  const email = account ? null : found.list.email;
  return {
    token: account ? null : found.key, account, items, item_count: items.length, email,
    alerts: !found.list.alertsOff && (account || Boolean(email)), alerts_off: found.list.alertsOff,
  };
};

/* GST is extracted from the inclusive total, never added -- the same
   arithmetic App\Support\Money does, so the figures the frontend renders
   against the mock are the figures Laravel would send. */
const summarise = (token, lines) => {
  const items = lines.map((l) => {
    const product = storeProducts.find((x) => x.id === l.product_id);
    const variation = product?.variations?.find((v) => v.id === l.variation_id) ?? null;
    const unit = variation?.price_paise ?? product?.price_paise ?? 0;

    return {
      id: l.id, product_id: l.product_id, variation_id: variation?.id ?? null,
      name: product?.name ?? 'Unknown', variation_name: variation?.name ?? null,
      slug: product?.slug ?? '', sku: variation?.sku ?? product?.sku ?? null,
      type: product?.type ?? 'physical', image_url: null,
      quantity: l.quantity, unit_price_paise: unit, line_total_paise: unit * l.quantity,
      returnable: product?.returnable ?? true,
      shipped: (product?.type ?? 'physical') === 'physical',
      problem: product?.in_stock === false ? `"${product.name}" is out of stock.` : null,
    };
  });

  const subtotal = items.reduce((n, i) => n + i.line_total_paise, 0);
  const taxable = Math.floor((subtotal * 10000 + 5900) / 11800);

  return {
    token, items,
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal_paise: subtotal, discount_paise: 0, total_paise: subtotal,
    taxable_paise: taxable, gst_paise: subtotal - taxable, gst_rate: '18%',
    has_shippable: items.some((i) => i.shipped),
    problems: items.map((i) => i.problem).filter(Boolean),
    contact: { email: null, phone: null, ...(cartContacts.get(token) ?? {}), reminders: false },
  };
};

const products = [
  { id:1, name:'Catalyst CBS350-24T-4G', slug:'cisco-cbs350-24t-4g', sku:'CBS350-24T-4G',
    short_description:'24-port Gigabit managed switch with 4 SFP uplinks.',
    description:'<p>A managed access switch for wiring closets that need Layer 3 lite, static routing and proper VLAN support without a full enterprise licence.</p>',
    specifications:{ 'Ports':'24 × 10/100/1000', 'Uplinks':'4 × 1G SFP', 'Switching capacity':'56 Gbps', 'Rack units':'1U' },
    features:['Layer 3 lite static routing','802.1X port authentication','Rack-mount, fanless','Limited lifetime warranty'],
    images:[], image_alts:[], image_focuses:[], datasheet_url:null, status:'published',
    brand:{ id:1, name:'Cisco', slug:'cisco', logo:null },
    category:{ id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null },
    related_products:[], related_solutions:[{ id:1, title:'Enterprise networking', slug:'networking', icon:'network', summary:'', hero_image:null, hero_image_alt:null, hero_image_focus:null, status:'published' }],
    faqs:[{ id:9, question:'Does this support PoE?', answer:'No — this is the non-PoE variant. Ask us about the CBS350-24P if you need to power access points or phones.' }],
    seo:null },
];


const forms = [
  {
    id: 1, name: 'Contact', slug: 'contact', status: 'published',
    submit_label: 'Send enquiry',
    success_message: 'Thank you — we have your enquiry and will be in touch shortly.',
    // True here so `/embed/forms/contact` renders against the mock. The real
    // default is false; this fixture is the embeddable case, because the
    // refusal is the easy half to exercise and the render is not.
    embed_enabled: true,
    // Where a visitor is sent after sending, instead of the message; null shows the message.
    redirect_url: null,
    // Admin reads only — `publicForm()` below never sends it.
    notify_email: null,
    /*
     * Every field carries `settings` and `show_if`, null when the kind keeps
     * nothing and the field is always shown (0.117.0). This fixture stays the
     * plain case on purpose — no upload, no step break, no condition — so the
     * embed route and the raw-HTML snippet both still have a form to serve.
     */
    fields: [
      { id:1, kind:'text', name:'name', label:'Your name', placeholder:null, help:null, required:true, options:[], settings:null, show_if:null, width:'half' },
      { id:2, kind:'email', name:'email', label:'Work email', placeholder:null, help:null, required:true, options:[], settings:null, show_if:null, width:'half' },
      { id:3, kind:'tel', name:'phone', label:'Phone', placeholder:null, help:null, required:false, options:[], settings:null, show_if:null, width:'half' },
      { id:4, kind:'text', name:'company', label:'Company', placeholder:null, help:null, required:false, options:[], settings:null, show_if:null, width:'half' },
      { id:5, kind:'text', name:'subject', label:'Subject', placeholder:null, help:null, required:false, options:[], settings:null, show_if:null, width:'full' },
      { id:6, kind:'textarea', name:'message', label:'How can we help?', placeholder:null, help:null, required:true, options:[], settings:null, show_if:null, width:'full' },
    ],
  },
];

/*
 * The form builder's vocabulary, as `App\Support\Forms\FieldSpec::meta()`
 * sends it on the admin forms index and on every admin read of a form.
 *
 * The console draws its kind picker, its condition operators and an upload
 * field's "files accepted" boxes from this and keeps no list of its own, so a
 * mock without it renders a builder with seven kinds and no conditions — the
 * fallback for an older API, which would hide the feature from every CI run.
 * Sixteen kinds in `FormField::KINDS` order; an operator's flag is
 * `takes_value`, not `needs_value`.
 */
const FORM_LAYOUT_KINDS = ['heading', 'step'];
const FORM_OPTION_KINDS = ['select', 'radio', 'checkboxes'];
const FORM_NOT_A_SOURCE = ['file', 'hidden', 'heading', 'step'];
const FORM_META = {
  kinds: [
    ['text', 'Short text', 'One line: a name, a company, a subject.'],
    ['email', 'Email', 'An address, checked for shape. The first one on a form is where its receipt goes.'],
    ['tel', 'Phone', 'A telephone number, with spaces, brackets and a country code allowed.'],
    ['number', 'Number', 'A figure, with an optional lowest and highest.'],
    ['textarea', 'Paragraph', 'A longer answer over several lines.'],
    ['select', 'Dropdown', 'One choice from a list that opens.'],
    ['checkbox', 'Tick box', 'One box to tick, such as a consent.'],
    ['url', 'Web address', 'A link beginning http:// or https://.'],
    ['date', 'Date', 'A day, with an optional earliest and latest.'],
    ['radio', 'Single choice', 'One choice from a short list, every option visible.'],
    ['checkboxes', 'Multiple choice', 'Any number of choices from a list.'],
    ['rating', 'Rating', 'One to five stars.'],
    ['file', 'File upload', 'One file. Kept privately and downloaded from the console, never emailed.'],
    ['hidden', 'Hidden value', 'A fixed value stored with every submission. The visitor never sees or sends it.'],
    ['heading', 'Heading', 'A title and an optional paragraph between fields. Collects nothing.'],
    ['step', 'Step break', 'Starts a new step. Its label is that step’s title.'],
  ].map(([value, label, blurb]) => ({
    value, label, blurb,
    takes_options: FORM_OPTION_KINDS.includes(value),
    is_layout: FORM_LAYOUT_KINDS.includes(value),
    is_file: value === 'file',
    is_condition_source: !FORM_NOT_A_SOURCE.includes(value),
  })),
  ops: [
    { value: 'equals', label: 'is', takes_value: true },
    { value: 'not_equals', label: 'is not', takes_value: true },
    { value: 'includes', label: 'includes', takes_value: true },
    { value: 'filled', label: 'is answered', takes_value: false },
    { value: 'empty', label: 'is not answered', takes_value: false },
  ],
  file_accepts: [
    { value: 'image', label: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
    { value: 'pdf', label: 'PDF', extensions: ['pdf'] },
    { value: 'document', label: 'Office documents and text', extensions: ['doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'] },
  ],
  max_upload_kb: 20480,
  max_file_fields: 3,
};

/*
 * What people sent. `files` is an object keyed by field name — `{}` when
 * nothing was uploaded, never `[]` — and a file's `download_path` is this
 * API's own route under /api/v1, never a path on the disk. The mock holds no
 * bytes, so that route answers 404 below; the console's own handler turns
 * that into "not available" rather than a broken download.
 */
const formSubmissions = [
  {
    id: 1, form_id: 1, form_slug: 'contact',
    data: { name: 'Rahul Sen', email: 'rahul@meridianfoods.in', phone: '+91 98300 11223', company: 'Meridian Foods', subject: 'Warehouse Wi-Fi', message: 'We need coverage across two cold rooms and the loading bay.' },
    files: {}, ip_address: '203.0.113.7', read_at: null, created_at: '2026-10-05T11:20:00+05:30',
  },
];

/** A form as the public endpoint sends it: no notify address, and the two facts the page would otherwise work out. */
const publicForm = (f) => {
  const { notify_email, ...form } = f;
  void notify_email;
  return {
    ...form,
    has_files: f.fields.some((field) => field.kind === 'file'),
    steps: f.fields.filter((field) => field.kind === 'step').length + 1,
    // A hidden field's value is the server's own and never crosses to a page.
    fields: f.fields.map((field) => (field.kind === 'hidden' ? { ...field, settings: null } : field)),
  };
};

/** A form as the console reads it; the index row carries counts and no fields. */
const adminForm = (f, detail = true) => {
  const counts = { submissions_count: formSubmissions.filter((s) => s.form_id === f.id).length };
  if (!detail) {
    const { fields, ...row } = f;
    return { ...row, fields_count: fields.length, ...counts };
  }
  return { ...f, has_files: f.fields.some((field) => field.kind === 'file'), steps: f.fields.filter((field) => field.kind === 'step').length + 1, ...counts };
};

/**
 * Fields as `syncFields()` stores them: replaced wholesale with fresh ids, a
 * heading or a step break named by the server, and each row cut down to what
 * its kind keeps. The mock validates nothing — the API is the judge — but it
 * does pass `settings` and `show_if` through, which is the contract the
 * builder is written against.
 */
const storeFormFields = (rows) => {
  const taken = new Set(rows.map((r) => r?.name).filter(Boolean));
  const freeName = (base) => {
    let n = 1;
    while (taken.has(`${base}_${n}`)) n += 1;
    taken.add(`${base}_${n}`);
    return `${base}_${n}`;
  };
  let step = 1;
  return rows.map((r, i) => {
    const kind = r?.kind ?? 'text';
    const layout = FORM_LAYOUT_KINDS.includes(kind);
    if (kind === 'step') step += 1;
    return {
      id: 100 + i, kind,
      name: r?.name || freeName(kind === 'step' ? 'step' : 'section'),
      label: r?.label || `Step ${step}`,
      placeholder: r?.placeholder ?? null, help: r?.help ?? null,
      required: !layout && kind !== 'hidden' && Boolean(r?.required),
      options: FORM_OPTION_KINDS.includes(kind) ? (r?.options ?? []) : [],
      settings: r?.settings && Object.keys(r.settings).length ? r.settings : null,
      show_if: r?.show_if?.field ? r.show_if : null,
      width: r?.width ?? 'full',
    };
  });
};

/*
 * One live popup, targeting the shop. Enough for the renderer to be exercised
 * by a CI build: an image, a link, a subtree pattern and the natural size.
 */
const popups = [
  {
    id: 1,
    image: 'http://127.0.0.1:8899/storage/media/popups/offer.jpg',
    image_alt: 'Ten per cent off network switches until the end of the month',
    image_focus: null,
    image_width: 1120,
    image_height: 840,
    body: null,
    link_url: '/store',
    link_new_tab: false,
    paths: ['/store/*'],
    size: 'medium',
    width: 560,
    frequency: 'session',
    trigger: 'delay',
    delay_ms: 1500,
  },
];

const sliders = [
  {
    id: 1, name: 'Homepage hero', slug: 'homepage-hero', status: 'published',
    // `full` is the default every existing row has; `split` is the other
    // layout. Both are exercised here rather than only the default, since a
    // fixture that never sends the second value hides a renderer that ignores
    // it -- the reason the two slides below also carry different anchors.
    layout: 'full', transition: 'slide', caption_animation: 'none',
    autoplay: true, interval_ms: 6000,
    slides: [
      { id: 1, kind: 'image', url: null, poster_url: null, youtube_id: null,
        alt: 'A rack of network switches', focus: null, heading: null, caption: null,
        link_url: null, link_label: null, caption_position: 'bottom-left' },
      { id: 2, kind: 'youtube', url: null, poster_url: null, youtube_id: 'dQw4w9WgXcQ',
        alt: 'Product overview', focus: null, heading: 'Watch the walkthrough', caption: null,
        link_url: null, link_label: null, caption_position: 'middle-centre' },
    ],
  },
  {
    // The third layout, `cards`: the page picks a different component on the
    // value, so a fixture that never sends it would let a dispatcher that
    // ignored it pass CI. Three slides, because two cards is the least that
    // shows the row re-slotting when one is pressed.
    id: 2, name: 'Stacked cards demo', slug: 'cards-demo', status: 'published',
    layout: 'cards', transition: 'slide', caption_animation: 'rise',
    autoplay: false, interval_ms: 6000,
    slides: [
      { id: 3, kind: 'image', url: null, poster_url: null, youtube_id: null,
        alt: 'A server room', focus: null, heading: 'Built to be lived in', caption: 'Racks, power and cooling designed together.',
        link_url: '/solutions', link_label: 'See the solutions', caption_position: 'bottom-left' },
      { id: 4, kind: 'image', url: null, poster_url: null, youtube_id: null,
        alt: 'An engineer at a patch panel', focus: null, heading: 'Structured cabling', caption: null,
        link_url: null, link_label: null, caption_position: 'top-left' },
      { id: 5, kind: 'image', url: null, poster_url: null, youtube_id: null,
        alt: 'A wireless access point', focus: null, heading: 'Enterprise Wi-Fi', caption: 'Surveyed, then installed.',
        link_url: null, link_label: null, caption_position: 'middle-left' },
    ],
  },
];

/* The lead pipeline. Two rows so the queue shows a scored lead and a
   backfilled one that was never scored — the console renders those
   differently, and a fixture with only the first hides that. */
const leadReasons = [
  { key: 'business_email', label: 'Business email address', weight: 20, applies: true, passed: true, hint: null },
  { key: 'intent', label: 'Asks about buying', weight: 20, applies: true, passed: true, hint: null },
  { key: 'phone', label: 'Phone number given', weight: 15, applies: true, passed: true, hint: null },
  { key: 'company', label: 'Company named', weight: 15, applies: true, passed: true, hint: null },
  { key: 'substantial', label: 'Describes what they need', weight: 15, applies: true, passed: true, hint: null },
  { key: 'specific_page', label: 'Came from a specific page', weight: 10, applies: true, passed: true, hint: null },
  { key: 'clean_message', label: 'Message is not a link dump', weight: 10, applies: true, passed: true, hint: null },
  { key: 'returning', label: 'Has enquired before', weight: 5, applies: true, passed: false, hint: 'First time this address has been in touch.' },
];

const leads = [
  {
    id: 1, channel: 'enquiry', form_name: 'Product enquiry',
    name: 'Rahul Sen', email: 'rahul@meridianfoods.in', phone: '+91 98300 11223',
    company: 'Meridian Foods', subject: 'Switch refresh',
    message: 'We are replacing the access layer across two floors and need a quotation for 24-port PoE switches, plus what the lead time looks like this quarter.',
    source_url: 'https://www.technoware.in/products/cisco-cbs350-24t-4g',
    source_path: '/products/cisco-cbs350-24t-4g', source_title: 'Cisco CBS350 24-Port Switch',
    referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'switches-q3',
    status: 'new', status_label: 'New', is_open: true,
    assigned_to: null, assignee_name: null, follow_up_at: null, is_overdue: false,
    value_paise: null, contacted_at: null, closed_at: null,
    score: 95, score_band: 'hot', created_at: '2026-09-01T09:12:00+00:00',
    allowed_next: [
      { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' }, { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' }, { value: 'spam', label: 'Spam' },
    ],
    score_reasons: leadReasons, ip_address: '203.0.113.9', notes: [], related: [],
  },
  {
    id: 2, channel: 'form', form_name: 'Request a survey',
    name: 'Priya Das', email: 'priya@gmail.com', phone: null,
    company: null, subject: null, message: 'send details',
    source_url: null, source_path: null, source_title: null,
    referrer: null, utm_source: null, utm_medium: null, utm_campaign: null,
    status: 'contacted', status_label: 'Contacted', is_open: true,
    assigned_to: 3, assignee_name: 'S. Rao', follow_up_at: '2026-08-20T00:00:00+00:00', is_overdue: true,
    value_paise: null, contacted_at: '2026-08-18T10:00:00+00:00', closed_at: null,
    score: 0, score_band: 'unscored', created_at: '2026-08-18T09:00:00+00:00',
    allowed_next: [
      { value: 'contacted', label: 'Contacted' }, { value: 'qualified', label: 'Qualified' },
      { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }, { value: 'spam', label: 'Spam' },
    ],
    score_reasons: null, ip_address: null, notes: [], related: [],
  },
];

/* Outgoing webhooks: `meta.events` on the index is the enum's subscribable
   list, and `secret` appears on no read. */
const webhookEvents = [
  { value: 'lead.created', label: 'A lead arrived', blurb: 'Every enquiry, editor-built form and chatbot callback, as the lead it became.' },
  { value: 'ticket.created', label: 'A ticket was opened', blurb: 'A new support ticket, from the portal or the mailbox.' },
  { value: 'ticket.replied', label: 'A ticket was replied to', blurb: 'A customer-visible message from either side. Never an internal note.' },
  { value: 'ticket.status_changed', label: 'A ticket changed status', blurb: 'The ticket, with the status it moved from and to.' },
  { value: 'order.placed', label: 'An order was placed', blurb: 'The order as placed, before any payment.' },
  { value: 'order.paid', label: 'An order was paid', blurb: 'The moment an order is paid — by the gateway or recorded by hand.' },
  { value: 'order.status_changed', label: 'An order changed status', blurb: 'The order, with the status it moved from and to.' },
  { value: 'customer.registered', label: 'A customer confirmed their address', blurb: 'A portal account whose address has just been confirmed.' },
  { value: 'form.submitted', label: 'A form was submitted', blurb: 'The raw answers to an editor-built form.' },
  { value: 'subscriber.joined', label: 'A newsletter subscriber joined', blurb: 'A newsletter subscriber row being created, however it arrived.' },
];
const webhooks = [
  { id: 1, name: 'CRM', url: 'https://crm.example.com/hooks/technoware', events: ['lead.created', 'ticket.created'],
    event_labels: ['A lead arrived', 'A ticket was opened'], is_active: true, has_secret: true, created_by: 'P. Nair',
    last_delivered_at: '2026-09-19T10:12:00+05:30', last_error: null, deliveries_count: 2,
    created_at: '2026-09-18T09:00:00+05:30', updated_at: '2026-09-19T10:12:00+05:30' },
  { id: 2, name: 'Slack orders channel', url: 'https://hooks.example.com/services/T000/B000/x', events: ['order.placed', 'order.paid'],
    event_labels: ['An order was placed', 'An order was paid'], is_active: false, has_secret: true, created_by: 'P. Nair',
    last_delivered_at: null, last_error: 'order.placed: https://hooks.example.com/services/T000/B000/x answered 404.', deliveries_count: 1,
    created_at: '2026-09-18T09:30:00+05:30', updated_at: '2026-09-19T08:00:00+05:30' },
];
const webhookDeliveries = [
  { id: 12, webhook_id: 1, event: 'ticket.created', event_label: 'A ticket was opened', status: 'delivered', attempts: 1,
    response_status: 200, response_excerpt: 'ok', next_attempt_at: null, delivered_at: '2026-09-19T10:12:00+05:30',
    created_at: '2026-09-19T10:11:58+05:30', updated_at: '2026-09-19T10:12:00+05:30' },
  { id: 11, webhook_id: 1, event: 'lead.created', event_label: 'A lead arrived', status: 'failed', attempts: 5,
    response_status: 503, response_excerpt: 'Service Unavailable', next_attempt_at: null, delivered_at: null,
    created_at: '2026-09-18T15:40:00+05:30', updated_at: '2026-09-19T05:40:00+05:30' },
  { id: 10, webhook_id: 1, event: 'ping', event_label: 'Ping', status: 'pending', attempts: 1,
    response_status: null, response_excerpt: 'cURL error 7: Failed to connect', next_attempt_at: '2026-09-20T12:00:00+05:30', delivered_at: null,
    created_at: '2026-09-20T11:59:00+05:30', updated_at: '2026-09-20T11:59:00+05:30' },
  { id: 9, webhook_id: 2, event: 'order.placed', event_label: 'An order was placed', status: 'failed', attempts: 5,
    response_status: 404, response_excerpt: 'no_service', next_attempt_at: null, delivered_at: null,
    created_at: '2026-09-18T15:40:00+05:30', updated_at: '2026-09-19T05:40:00+05:30' },
];

/* Engineer visit requests (docs/visits.md). The mock's copy of the shapes
   `GET /visits/options`, the guest and portal reads and the console answer;
   the token is fixed so a browser check can open the guest page through
   `/visit/TV-2026-00001/open?token=…`. */
const VISIT_TOKEN = 'a'.repeat(64);
const visitWindows = [
  { value: 'morning', label: 'Morning', start: '09:00', end: '12:00' },
  { value: 'afternoon', label: 'Afternoon', start: '12:00', end: '15:00' },
  { value: 'evening', label: 'Evening', start: '15:00', end: '18:00' },
];
const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const visitRequests = [
  {
    id: 1, reference: 'TV-2026-00001', status: 'requested', status_label: 'Requested', is_open: true,
    allowed_next: [{ value: 'requested', label: 'Requested' }, { value: 'cancelled', label: 'Cancelled' }],
    topic: 'Network installation', name: 'Priya Sharma', email: 'priya@meridianfoods.test', phone: '+91 98765 43210',
    company: 'Meridian Foods', customer_id: 1,
    site_address: { line1: '14 Park Street', line2: null, city: 'Kolkata', state: 'West Bengal', pin: '700016', country: 'India' },
    service: { id: 1, title: 'Network installation', slug: 'network-installation' }, solution: null, location: null,
    notes: 'Two floors; the rack is in the basement.',
    preferred: [
      { date: isoDay(2), window: 'morning', label: 'Morning (09:00–12:00)' },
      { date: isoDay(3), window: 'afternoon', label: 'Afternoon (12:00–15:00)' },
    ],
    scheduled_start_at: null, scheduled_end_at: null, visit_date: '', visit_time: '',
    assigned_to: null, assignee_name: null, staff_note: null, cancel_reason: null,
    confirmed_at: null, completed_at: null, cancelled_at: null, reminded_at: null, lead_id: 1,
    source_url: 'https://www.technoware.in/book-a-visit', source_path: '/book-a-visit', source_title: 'Book a site visit',
    utm_source: null, utm_medium: null, utm_campaign: null, admin_path: '/admin/visits/TV-2026-00001',
    events: [{ id: 1, type: 'requested', from: null, to: null, note: '2 preferred times', actor_name: null, created_at: new Date().toISOString() }],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];
const customerVisit = (v) => ({
  reference: v.reference, status: v.status, status_label: v.status_label, topic: v.topic,
  name: v.name, email: v.email, phone: v.phone, company: v.company, site_address: v.site_address, notes: v.notes,
  preferred: v.preferred, scheduled_start_at: v.scheduled_start_at, scheduled_end_at: v.scheduled_end_at,
  visit_date: v.visit_date, visit_time: v.visit_time, cancel_reason: v.status === 'cancelled' ? v.cancel_reason : null,
  can_cancel: v.is_open, can_reschedule: v.is_open, created_at: v.created_at,
});
const visitMeta = {
  statuses: [
    { value: 'requested', label: 'Requested', open: true }, { value: 'confirmed', label: 'Confirmed', open: true },
    { value: 'completed', label: 'Completed', open: false }, { value: 'cancelled', label: 'Cancelled', open: false },
    { value: 'no_show', label: 'No-show', open: false },
  ],
  awaiting_count: 1, today_count: 0, unassigned_count: 0,
  assignees: [{ id: 1, name: 'Ada Admin' }], sorts: ['created', 'scheduled', 'name', 'status'],
  default_minutes: 90, windows: visitWindows,
};

/* Online meetings (docs/meetings.md, docs/meetings-contract.md). The mock's
   copy of `GET /meetings/options`, both forms of `GET /meetings/slots`, a
   booking (a 64-hex token, the order's and the visit's rule), the guest and
   portal reads, and the console's list and detail. Times are written with
   the +05:30 offset and labelled IST, the way the API writes them in
   APP_TIMEZONE. The build prerenders /book-a-meeting against this. */
const MEETING_TOKEN = 'b'.repeat(64);
const meetingTypes = [
  { id: 1, name: 'Product demo', slug: 'product-demo', description: 'A walk through the hardware and the support that comes with it.', minutes: 30,
    buffer_before: 0, buffer_after: 10, is_public: true, is_active: true, sort_order: 1, host_ids: [], hosts: [], meetings_count: 1,
    created_at: '2026-09-29T10:00:00+05:30', updated_at: '2026-09-29T10:00:00+05:30' },
  { id: 2, name: 'Network consultation', slug: 'network-consultation', description: 'An hour with an engineer about your network.', minutes: 60,
    buffer_before: 10, buffer_after: 10, is_public: true, is_active: true, sort_order: 2, host_ids: [1], hosts: [{ id: 1, name: 'Ada Admin', eligible: true }], meetings_count: 0,
    created_at: '2026-09-29T10:00:00+05:30', updated_at: '2026-09-29T10:00:00+05:30' },
];
const MEETING_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MEETING_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const meetingDateLabel = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${MEETING_DAY_LABELS[d.getUTCDay()]} ${d.getUTCDate()} ${MEETING_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const meetingIso = (ymd, hm) => `${ymd}T${hm}:00+05:30`;
const addMinutes = (hm, n) => {
  const [h, m] = hm.split(':').map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/* Weekdays 10:00–18:00 every 30 minutes, the seeded default hours; the
   weekend and any date outside the window have none. */
const meetingSlotsFor = (ymd, minutes) => {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6 || ymd < isoDay(1) || ymd > isoDay(30)) return [];
  const out = [];
  for (let hm = '10:00'; addMinutes(hm, minutes) <= '18:00'; hm = addMinutes(hm, 30)) {
    if (ymd === isoDay(2) && hm === '15:30') continue; // taken — a day with a gap in it
    out.push({ start: meetingIso(ymd, hm), end: meetingIso(ymd, addMinutes(hm, minutes)), time_label: hm });
  }
  return out;
};
const meetings = [
  {
    id: 1, reference: 'MT-2026-00001', status: 'scheduled', status_label: 'Scheduled', is_open: true, needs_outcome: false,
    allowed_next: [{ value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }, { value: 'no_show', label: 'No-show' }, { value: 'cancelled', label: 'Cancelled' }],
    meeting_type: { id: 1, name: 'Product demo', slug: 'product-demo', minutes: 30 }, meeting_type_id: 1,
    host_id: 1, host_name: 'Ada Admin', host: { id: 1, name: 'Ada Admin', email: 'admin@technoware.test' },
    customer_id: 1, name: 'Priya Sharma', email: 'priya@meridianfoods.test', phone: '+91 98765 43210', company: 'Meridian Foods',
    agenda: 'We are looking at replacing the core switches across two sites.',
    starts_at: meetingIso(isoDay(2), '11:00'), ends_at: meetingIso(isoDay(2), '11:30'),
    date_label: meetingDateLabel(isoDay(2)), time_label: '11:00 – 11:30', timezone: 'IST', minutes: 30,
    blocked_from: meetingIso(isoDay(2), '11:00'), blocked_until: meetingIso(isoDay(2), '11:40'),
    source: 'site', source_label: 'Website', created_by: null, reschedule_count: 0,
    cancel_reason: null, cancelled_at: null, completed_at: null, staff_note: null, lead_id: 1,
    meet_url: 'https://meet.google.com/abc-defg-hij',
    google: { status: 'synced', status_label: 'In Google Calendar', event_id: 'a1b2c3', account: 'meetings@technoware.test', attempts: 1, error: null },
    source_url: 'https://www.technoware.in/book-a-meeting', source_path: '/book-a-meeting', source_title: 'Book a meeting',
    utm_source: null, utm_medium: null, utm_campaign: null, admin_path: '/admin/meetings/MT-2026-00001',
    trail: [{ id: 1, type: 'booked', from: null, to: null, note: 'Booked from the website', actor_name: null, created_at: new Date().toISOString() }],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];
const customerMeeting = (m) => ({
  reference: m.reference, status: m.status, status_label: m.status_label,
  meeting_type: m.meeting_type ? { name: m.meeting_type.name, slug: m.meeting_type.slug, minutes: m.meeting_type.minutes } : null,
  host_name: m.host_name, name: m.name, email: m.email, phone: m.phone, company: m.company, agenda: m.agenda,
  starts_at: m.starts_at, ends_at: m.ends_at, date_label: m.date_label, time_label: m.time_label, timezone: m.timezone,
  meet_url: m.status === 'scheduled' ? m.meet_url : null, cancel_reason: m.status === 'cancelled' ? m.cancel_reason : null,
  can_cancel: m.status === 'scheduled', can_reschedule: m.status === 'scheduled', reschedules_left: 3 - m.reschedule_count,
  change_cutoff_hours: 12, created_at: m.created_at,
});
const meetingMeta = {
  statuses: [
    { value: 'scheduled', label: 'Scheduled', open: true }, { value: 'completed', label: 'Completed', open: false },
    { value: 'no_show', label: 'No-show', open: false }, { value: 'cancelled', label: 'Cancelled', open: false },
  ],
  types: meetingTypes.map((t) => ({ id: t.id, name: t.name, slug: t.slug, is_active: t.is_active })),
  hosts: [{ id: 1, name: 'Ada Admin' }],
  sources: [{ value: 'site', label: 'Website' }, { value: 'portal', label: 'Customer portal' }, { value: 'console', label: 'Console' }],
  needs_outcome_count: 0, today_count: 0, google_failed_count: 0,
  sorts: ['starts', 'created', 'name', 'status'], timezone: 'Asia/Kolkata', timezone_label: 'IST',
};
const meetingOf = (ref) => meetings.find((x) => x.reference === ref);
/* The hosts on Meetings → Hosts: one, on the default hours. */
const meetingHosts = [
  { id: 1, name: 'Ada Admin', email: 'admin@technoware.test', is_active: true, uses_default_hours: true,
    hours: [], time_off: [], upcoming_count: 1, free_busy: 'not_connected' },
];
const moveMeeting = (m, start) => {
  const ymd = String(start).slice(0, 10);
  const hm = String(start).slice(11, 16);
  const end = addMinutes(hm, m.minutes);
  Object.assign(m, {
    starts_at: meetingIso(ymd, hm), ends_at: meetingIso(ymd, end), date_label: meetingDateLabel(ymd),
    time_label: `${hm} – ${end}`, reschedule_count: m.reschedule_count + 1,
  });
};
const cancelMeeting = (m, reason = null) => Object.assign(m, {
  status: 'cancelled', status_label: 'Cancelled', is_open: false, cancel_reason: reason,
  cancelled_at: new Date().toISOString(), allowed_next: [{ value: 'cancelled', label: 'Cancelled' }], meet_url: null,
});

/* Events (0.118.0, docs/events-contract.md). The mock's copy of the public
   list, an event's page, its availability, its `.ics`, a registration and
   the registrant's own link, and the console's events and registrations.

   Stored in the **admin** shape — wall-clock `Y-m-d\TH:i` in the site's
   zone, paths beside their URLs, the join link — and presented two ways,
   the way the API's two resources do: `publicEvent()` never carries
   `online_url`, a path, a count or a staff field. Dates are offsets from
   today so the list always holds something upcoming and something past;
   times are labelled IST, the way the API writes them in APP_TIMEZONE. The
   build prerenders /events against this.

   The registration token is fixed so a browser check can open
   `/events/registration/<EVENT_TOKEN>`. */
const EVENT_TOKEN = 'c'.repeat(64);
const EVENT_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVENT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EVENT_FORMATS = [
  { value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }, { value: 'hybrid', label: 'In person and online' },
];
const EVENT_STATUSES = [
  { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' },
];
const EVENT_MODES = [
  { value: 'none', label: 'No registration', blurb: 'An announcement. The page gives the date and the place and nobody signs up.' },
  { value: 'open', label: 'Register on this site', blurb: 'People register here, free. You may set a capacity, a waiting list and a closing date.' },
  { value: 'external', label: 'Register somewhere else', blurb: 'A button to somebody else’s sign-up page — the organiser’s, or a ticketing site.' },
];
const EVENT_REGISTRATION_STATUSES = [
  { value: 'confirmed', label: 'Confirmed' }, { value: 'waitlisted', label: 'On the waiting list' }, { value: 'cancelled', label: 'Cancelled' },
  { value: 'attended', label: 'Attended' }, { value: 'no_show', label: 'No-show' },
];
const eventLabelOf = (list, value) => list.find((o) => o.value === value)?.label ?? value;
const EVENT_META = {
  formats: EVENT_FORMATS, statuses: EVENT_STATUSES, registration_modes: EVENT_MODES,
  registration_statuses: EVENT_REGISTRATION_STATUSES, max_speakers: 12, max_agenda: 30, timezone: 'IST',
};
/** "15:00" → "3:00 pm". */
const eventClock = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
/** "2026-11-12" → "Thursday 12 November 2026", or without the year. */
const eventDate = (ymd, year = true) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${EVENT_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${EVENT_MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
};
/** A stored wall clock as the instant it names, with the site's offset. */
const eventIso = (wall) => (wall ? `${wall}:00+05:30` : null);
const eventLabels = (e) => {
  const ymd = e.starts_at.slice(0, 10);
  const d = new Date(`${ymd}T00:00:00Z`);
  const start = eventClock(e.starts_at.slice(11, 16));
  return {
    date_label: eventDate(ymd),
    time_label: e.ends_at ? `${start} – ${eventClock(e.ends_at.slice(11, 16))} IST` : `${start} IST`,
    day: String(d.getUTCDate()), month: EVENT_MONTHS[d.getUTCMonth()].slice(0, 3), year: String(d.getUTCFullYear()),
  };
};
/* Upcoming until it **ends** — or until the end of its start day when it has no end. */
const eventIsPast = (e) => Date.parse(eventIso(e.ends_at ?? `${e.starts_at.slice(0, 10)}T23:59`)) < Date.now();
const eventHasStarted = (e) => Date.parse(eventIso(e.starts_at)) <= Date.now();
const events = [
  {
    id: 1, title: 'Wi-Fi 7 for the office: a working session', slug: 'wifi-7-working-session',
    summary: 'Ninety minutes on what Wi-Fi 7 changes for a 200-seat office.',
    body: '<p>Wi-Fi 7 is not a faster Wi-Fi 6. It changes how a client uses the spectrum it is given, and that changes how an office is surveyed.</p><h2>Who it is for</h2><p>IT managers planning a refresh in the next eighteen months.</p><ul><li>What multi-link operation means for a roaming laptop</li><li>Which of your clients can use 6 GHz today</li></ul>',
    status: 'published', is_featured: true, format: 'hybrid',
    starts_at: `${isoDay(21)}T15:00`, ends_at: `${isoDay(21)}T16:30`,
    venue_name: 'Technoware Experience Centre', venue_city: 'Mumbai',
    venue_address: 'Unit 4, Lakeview Industrial Estate\nAndheri East, Mumbai 400093',
    map_url: 'https://maps.google.com/?q=Andheri+East+Mumbai', online_url: 'https://meet.example/wifi-7',
    cover_image_path: null, cover_image: null,
    speakers: [
      { name: 'Asha Rao', role: 'Principal network engineer', photo_path: null, photo: null },
      { name: 'Vikram Shah', role: 'Wireless survey lead', photo_path: null, photo: null },
    ],
    agenda: [
      { time: '3:00 pm', title: 'What changes in Wi-Fi 7', note: 'Channels, MLO and what a client needs.' },
      { time: '3:40 pm', title: 'Surveying for 6 GHz', note: null },
      { time: '4:10 pm', title: 'Questions', note: 'Bring a floor plan.' },
    ],
    registration_mode: 'open', external_url: null, capacity: 40, waitlist_enabled: true, max_seats: 5,
    registration_closes_at: `${isoDay(20)}T18:00`,
    faqs: [
      { id: 9001, question: 'Is there a charge?', answer: '<p>No. The session is free; a seat is yours once it is confirmed.</p>' },
      { id: 9002, question: 'Will it be recorded?', answer: '<p>Yes. Everyone who registered is sent the recording the next working day.</p>' },
    ],
    seo: null, created_at: '2026-10-01T10:00:00+05:30', updated_at: '2026-10-06T18:00:00+05:30',
  },
  {
    id: 2, title: 'Firewall hardening: a live webinar', slug: 'firewall-hardening-webinar',
    summary: 'An hour on the five rules that quietly stop working, with a config you can take away.',
    body: '<p>A firewall policy describes a network that keeps changing underneath it. This hour is the review we run for our own AMC customers.</p>',
    status: 'published', is_featured: false, format: 'online',
    starts_at: `${isoDay(40)}T11:00`, ends_at: `${isoDay(40)}T12:00`,
    venue_name: null, venue_city: null, venue_address: null, map_url: null, online_url: null,
    cover_image_path: null, cover_image: null,
    speakers: [{ name: 'S. Rao', role: 'Security practice', photo_path: null, photo: null }],
    agenda: [],
    registration_mode: 'external', external_url: 'https://example.com/webinars/firewall-hardening',
    capacity: null, waitlist_enabled: false, max_seats: 5, registration_closes_at: null,
    faqs: [], seo: null, created_at: '2026-10-02T10:00:00+05:30', updated_at: '2026-10-05T12:00:00+05:30',
  },
  {
    id: 3, title: 'Technoware at the Mumbai IT Expo', slug: 'mumbai-it-expo',
    summary: 'Three days on stand B14: live switching, storage and surveillance demonstrations.',
    body: '<p>We ran the same three demonstrations every hour. Thank you to everyone who stopped at the stand.</p>',
    status: 'published', is_featured: false, format: 'in_person',
    starts_at: `${isoDay(-30)}T10:00`, ends_at: `${isoDay(-28)}T18:00`,
    venue_name: 'Bombay Exhibition Centre', venue_city: 'Mumbai', venue_address: 'Hall 2, Stand B14\nGoregaon East, Mumbai 400063',
    map_url: null, online_url: null, cover_image_path: null, cover_image: null,
    speakers: [], agenda: [],
    registration_mode: 'none', external_url: null, capacity: null, waitlist_enabled: false, max_seats: 5, registration_closes_at: null,
    faqs: [], seo: null, created_at: '2026-08-20T10:00:00+05:30', updated_at: '2026-09-08T10:00:00+05:30',
  },
  {
    id: 4, title: 'Storage refresh clinic', slug: 'storage-refresh-clinic',
    summary: 'A morning with our storage engineers. Not announced yet.',
    body: null, status: 'draft', is_featured: false, format: 'in_person',
    starts_at: `${isoDay(60)}T10:30`, ends_at: null,
    venue_name: 'Technoware Experience Centre', venue_city: 'Mumbai', venue_address: null,
    map_url: null, online_url: null, cover_image_path: null, cover_image: null,
    speakers: [], agenda: [],
    registration_mode: 'open', external_url: null, capacity: 12, waitlist_enabled: false, max_seats: 2, registration_closes_at: null,
    faqs: [], seo: null, created_at: '2026-10-06T09:00:00+05:30', updated_at: '2026-10-06T09:00:00+05:30',
  },
];
const eventRegistrations = [
  { id: 31, event_id: 1, name: 'Priya Das', email: 'priya@acme.test', phone: '+91 98765 43210', company: 'Acme Foods',
    seats: 2, note: 'One of us needs step-free access.', staff_note: null, status: 'confirmed',
    customer_id: null, lead_id: 1, source: 'public', reminded_at: null, cancelled_at: null, created_at: '2026-10-06T18:10:00+05:30' },
  { id: 32, event_id: 1, name: 'Rahul Sen', email: 'rahul@meridianfoods.test', phone: null, company: 'Meridian Foods',
    seats: 1, note: null, staff_note: 'Rang the desk; coming with the plant IT head.', status: 'confirmed',
    customer_id: 1, lead_id: null, source: 'staff', reminded_at: null, cancelled_at: null, created_at: '2026-10-06T19:02:00+05:30' },
  { id: 33, event_id: 1, name: 'Neha Kulkarni', email: 'neha@northwind.test', phone: '+91 99200 11223', company: null,
    seats: 3, note: null, staff_note: null, status: 'cancelled',
    customer_id: null, lead_id: 1, source: 'public', reminded_at: null, cancelled_at: '2026-10-07T09:30:00+05:30', created_at: '2026-10-06T20:15:00+05:30' },
];
const eventOf = (id) => events.find((e) => e.id === Number(id));
const eventCounts = (e) => {
  const rows = eventRegistrations.filter((r) => r.event_id === e.id);
  const of = (status) => rows.filter((r) => r.status === status);
  const seats = of('confirmed').reduce((n, r) => n + r.seats, 0);
  return {
    confirmed: of('confirmed').length, confirmed_seats: seats, waitlisted: of('waitlisted').length,
    cancelled: of('cancelled').length, attended: of('attended').length,
    seats_left: e.capacity === null ? null : Math.max(0, e.capacity - seats),
  };
};
/* The console's resource. `faqs`, `seo` and `seo_defaults` on the detail read only. */
const adminEvent = (e, detail = false) => {
  const { faqs, seo, ...row } = e;
  const { date_label, time_label } = eventLabels(e);
  return {
    ...row,
    status_label: eventLabelOf(EVENT_STATUSES, e.status), format_label: eventLabelOf(EVENT_FORMATS, e.format),
    starts_at_iso: eventIso(e.starts_at), date_label, time_label, is_past: eventIsPast(e),
    counts: eventCounts(e), public_path: `/events/${e.slug}`, admin_path: `/admin/events/${e.id}`,
    ...(detail ? { faqs: faqs.map(({ question, answer }) => ({ question, answer })), seo, seo_defaults: null } : {}),
  };
};
/* The public row: no `online_url`, no path, no count, no staff field. */
const publicEvent = (e) => ({
  id: e.id, title: e.title, slug: e.slug, summary: e.summary,
  format: e.format, format_label: eventLabelOf(EVENT_FORMATS, e.format),
  starts_at: eventIso(e.starts_at), ends_at: eventIso(e.ends_at), ...eventLabels(e),
  venue_name: e.format === 'online' ? null : e.venue_name, venue_city: e.format === 'online' ? null : e.venue_city,
  cover_image: e.cover_image, cover_image_alt: null, cover_image_focus: null, cover_image_blur: null,
  is_featured: e.is_featured, is_past: eventIsPast(e),
  registration_mode: e.registration_mode, updated_at: e.updated_at, seo: null,
});
const eventSchema = (e) => prune({
  '@context': SCHEMA_ORG, '@type': 'Event', name: e.title, description: e.summary,
  startDate: eventIso(e.starts_at), endDate: eventIso(e.ends_at),
  eventStatus: `${SCHEMA_ORG}/EventScheduled`,
  eventAttendanceMode: `${SCHEMA_ORG}/${{ in_person: 'OfflineEventAttendanceMode', online: 'OnlineEventAttendanceMode', hybrid: 'MixedEventAttendanceMode' }[e.format]}`,
  // A place and/or a virtual location whose `url` is the *page*, never the join link.
  location: [
    ...(e.format !== 'online' ? [{ '@type': 'Place', name: e.venue_name, address: e.venue_address }] : []),
    ...(e.format !== 'in_person' ? [{ '@type': 'VirtualLocation', url: `https://www.technoware.in/events/${e.slug}` }] : []),
  ],
  organizer: publisher(), url: `https://www.technoware.in/events/${e.slug}`,
});
const publicEventDetail = (e) => ({
  ...publicEvent(e),
  body: e.body, venue_address: e.format === 'online' ? null : e.venue_address, map_url: e.format === 'online' ? null : e.map_url,
  speakers: e.speakers.map((s) => ({ name: s.name, role: s.role, photo: s.photo, photo_alt: null, photo_focus: null, photo_blur: null })),
  agenda: e.agenda,
  registration: {
    mode: e.registration_mode, external_url: e.registration_mode === 'external' ? e.external_url : null,
    // The closing time, the capacity and the waiting list mean something only while registration is open here.
    closes_at: e.registration_mode === 'open' ? eventIso(e.registration_closes_at) : null,
    closes_label: e.registration_mode === 'open' && e.registration_closes_at
      ? `${eventDate(e.registration_closes_at.slice(0, 10), false)}, ${eventClock(e.registration_closes_at.slice(11, 16))}` : null,
    max_seats: e.max_seats,
    has_capacity: e.registration_mode === 'open' && e.capacity !== null,
    waitlist: e.registration_mode === 'open' && e.capacity !== null && e.waitlist_enabled,
  },
  calendar_path: `/events/${e.slug}/calendar`,
  faqs: e.faqs, ...faqSchemaOf(e.faqs, []),
  schema: eventSchema(e),
});
/* What the registration panel asks after mount. No count is ever published. */
const eventAvailability = (e) => {
  const refuse = (state, message) => ({ state, few_left: false, message });
  if (e.registration_mode === 'none') return { state: 'none', few_left: false, message: null };
  if (e.registration_mode === 'external') return { state: 'external', few_left: false, message: null };
  if (eventHasStarted(e)) return refuse('ended', 'This event has started, so registration is closed.');
  if (e.registration_closes_at && Date.parse(eventIso(e.registration_closes_at)) < Date.now()) {
    return refuse('closed', 'Registration for this event has closed.');
  }
  const left = eventCounts(e).seats_left;
  if (left === 0) {
    return e.waitlist_enabled
      ? { state: 'waitlist', few_left: false, message: null }
      : refuse('full', 'This event is full.');
  }
  return { state: 'open', few_left: left !== null && left >= 1 && left <= e.capacity * 0.2, message: null };
};
const adminRegistration = (r) => ({
  ...r, status_label: eventLabelOf(EVENT_REGISTRATION_STATUSES, r.status),
  lead_path: r.lead_id ? `/admin/leads/${r.lead_id}` : null,
});
/* The registrant's own page: no email, phone, note or staff field — it is addressed by a link. */
const registrantView = (r, e) => ({
  status: r.status, status_label: eventLabelOf(EVENT_REGISTRATION_STATUSES, r.status), seats: r.seats, name: r.name,
  can_cancel: !eventHasStarted(e) && (r.status === 'confirmed' || r.status === 'waitlisted'),
  event: {
    title: e.title, slug: e.slug, ...(({ date_label, time_label }) => ({ date_label, time_label }))(eventLabels(e)),
    format: e.format, format_label: eventLabelOf(EVENT_FORMATS, e.format),
    venue_name: e.format === 'online' ? null : e.venue_name, venue_address: e.format === 'online' ? null : e.venue_address,
    is_past: eventIsPast(e), calendar_path: `/events/${e.slug}/calendar`,
  },
});
/* The event a registrations list belongs to, as `meta.event`: the contract's
   five keys and no more. It is all a sales manager — who cannot read the
   event itself — is told about it, so the console draws its header from
   exactly this and treats anything further as optional. */
const registrationsEvent = (e) => ({
  id: e.id, title: e.title, date_label: eventLabels(e).date_label, counts: eventCounts(e), capacity: e.capacity,
});
const registrationsMeta = (e) => ({ event: registrationsEvent(e), statuses: EVENT_REGISTRATION_STATUSES });
/* The moves the desk may make — `EventRegistrationStatus::canTransitionTo()`. */
const REGISTRATION_MOVES = {
  confirmed: ['cancelled', 'attended', 'no_show'], waitlisted: ['confirmed', 'cancelled'],
  cancelled: ['confirmed', 'waitlisted'], attended: ['no_show', 'confirmed'], no_show: ['attended', 'confirmed'],
};
const eventSlug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const freeEventSlug = (base, exceptId = null) => {
  let slug = base || 'event';
  for (let n = 2; events.some((e) => e.slug === slug && e.id !== exceptId); n += 1) slug = `${base}-${n}`;
  return slug;
};
const invalid = (res, field, message) => json(res, 422, { message, errors: { [field]: [message] } });
/* The write rules a console form can trip over, in the contract's own keys. */
const eventRefusal = (body, current = null) => {
  const merged = { ...(current ?? {}), ...body };
  const url = /^https?:\/\//;
  if ('title' in body || !current) {
    if (!merged.title) return ['title', 'The title field is required.'];
  }
  if (!merged.starts_at) return ['starts_at', 'Say when the event starts.'];
  if (merged.ends_at && merged.ends_at <= merged.starts_at) return ['ends_at', 'The end has to be after the start.'];
  if (merged.format !== 'online' && !merged.venue_name) return ['venue_name', 'An event people attend in person needs a venue.'];
  if (merged.map_url && !url.test(merged.map_url)) return ['map_url', 'The map link has to be a full http(s) address.'];
  if (merged.online_url && !url.test(merged.online_url)) return ['online_url', 'The join link has to be a full http(s) address.'];
  if (merged.registration_mode === 'external' && !url.test(merged.external_url ?? '')) {
    return ['external_url', 'Say where people register — a full http(s) address.'];
  }
  if (merged.status === 'published' && merged.format !== 'in_person' && merged.registration_mode === 'open' && !merged.online_url) {
    return ['online_url', 'An online or hybrid event that takes registrations here needs a join link before it is published.'];
  }
  if (merged.registration_closes_at && merged.registration_closes_at > merged.starts_at) {
    return ['registration_closes_at', 'Registration cannot close after the event starts.'];
  }
  if (current && merged.capacity !== null && merged.capacity !== undefined) {
    const seats = eventCounts(current).confirmed_seats;
    if (merged.capacity < seats) return ['capacity', `${seats} seats are already confirmed, so the capacity cannot be lower than that.`];
  }
  const speaker = (merged.speakers ?? []).findIndex((s) => !s.name);
  if (speaker !== -1) return [`speakers.${speaker}.name`, 'A speaker needs a name.'];
  const item = (merged.agenda ?? []).findIndex((a) => !a.title);
  if (item !== -1) return [`agenda.${item}.title`, 'An agenda item needs a title.'];
  return null;
};
const EVENT_WRITABLE = [
  'title', 'summary', 'body', 'status', 'is_featured', 'format', 'starts_at', 'ends_at', 'venue_name', 'venue_city',
  'venue_address', 'map_url', 'online_url', 'cover_image_path', 'speakers', 'agenda', 'registration_mode', 'external_url',
  'capacity', 'waitlist_enabled', 'max_seats', 'registration_closes_at', 'faqs', 'seo',
];
/* Speakers, agenda and FAQs are replaced wholesale; a key that is absent is left alone. */
const applyEventBody = (event, body) => {
  for (const key of EVENT_WRITABLE) {
    if (!(key in body)) continue;
    if (key === 'speakers') {
      event.speakers = (body.speakers ?? []).map((s) => ({ name: s.name, role: s.role ?? null, photo_path: s.photo_path ?? null, photo: null }));
    } else if (key === 'faqs') {
      event.faqs = (body.faqs ?? []).map((f, i) => ({ id: 9100 + i, question: f.question, answer: f.answer }));
    } else {
      event[key] = body[key];
    }
  }
};
/* Which registration the fixed token opens: the newest made through the public form. */
let eventTokenRegistration = 31;

const leadMeta = {
  statuses: [
    { value: 'new', label: 'New', open: true },
    { value: 'contacted', label: 'Contacted', open: true },
    { value: 'qualified', label: 'Qualified', open: true },
    { value: 'won', label: 'Won', open: false },
    { value: 'lost', label: 'Lost', open: false },
    { value: 'spam', label: 'Spam', open: false },
  ],
  bands: ['hot', 'warm', 'cold', 'unscored'],
  new_count: 1,
  overdue_count: 1,
  assignees: [{ id: 3, name: 'S. Rao' }, { id: 4, name: 'A. Fernandes' }],
  top_pages: [{ path: '/products/cisco-cbs350-24t-4g', total: 1 }],
};

const galleries = [
  {
    id: 1, name: 'Recent work', slug: 'recent-work', status: 'published',
    subtitle: 'A few of the sites we have handed over in the last year.',
    // Mirrors App\Enums\GalleryTransition's default. CI builds against this
    // file, so a shape that drifts from Laravel breaks the build rather than
    // production — which is the point of it.
    transition: 'fade',
    autoplay: false, interval_ms: 5000,
    groups: [
      { id: 1, name: 'Networking', slug: 'networking' },
      { id: 2, name: 'Surveillance', slug: 'surveillance' },
    ],
    items: [
      { id: 1, url: null, alt: 'A core switch stack in a wall-mounted rack', focus: null,
        title: 'Core switch stack', subtitle: 'Salt Lake, 2026', link_url: null, group: 'networking' },
      { id: 2, url: null, alt: 'Fibre patching in a comms room', focus: null,
        title: 'Fibre patching', subtitle: 'Howrah', link_url: null, group: 'networking' },
      { id: 3, url: null, alt: 'A camera on a warehouse gantry', focus: null,
        title: 'Gantry camera run', subtitle: 'New Town', link_url: null, group: 'surveillance' },
      // Ungrouped on purpose: it must appear under All and under no tab, which
      // is the case the tab filter is easiest to get wrong.
      { id: 4, url: null, alt: 'A UPS cabinet', focus: null, title: 'UPS cabinet', subtitle: null,
        link_url: null, group: null },
    ],
  },
];

/* ---------------- resources (blog, case studies, KB) ---------------- */

/*
 * Blog categories, and the pivot each post carries.
 *
 * The taxonomy shipped on the API before it shipped here, so `/blog/taxonomy`
 * and `/blog/featured` both 404'd against this mock — and because the blog page
 * fetches them inside one `Promise.all`, the whole route rendered "We could not
 * load the blog" with no posts. Anyone doing frontend work the documented way,
 * without Laravel, found the blog broken.
 */
const blogCategories = [
  { id:1, name:'Networking',   slug:'networking',   description:null },
  { id:2, name:'Security',     slug:'security',     description:null },
  { id:3, name:'Infrastructure', slug:'infrastructure', description:null },
];

const posts = [
  { id:1, title:'Firewall rules that quietly stop working', slug:'firewall-rules-that-stop-working',
    excerpt:'Five policy patterns that pass review but fail in production, and how to catch them early.',
    body:'<p>A firewall policy is not a static document. It describes a network that keeps changing underneath it.</p><h2>The stale object problem</h2><p>An address object pointing at a host that was decommissioned two years ago still matches nothing — until DHCP hands that address to a printer.</p><ul><li>Audit address objects quarterly</li><li>Prefer FQDN objects where the vendor supports them</li></ul>',
    cover_image:null, cover_image_alt:null, cover_image_focus:null, published_at:'2026-08-12T09:00:00Z', reading_minutes:7, author:{ name:'S. Rao' }, seo:null,
    is_featured:true, categories:[blogCategories[1], blogCategories[0]] },
  { id:2, title:'Sizing a UPS for a small server room', slug:'sizing-a-ups',
    excerpt:'Load calculation, runtime targets and the mistake almost everyone makes with power factor.',
    body:'<p>Most undersized UPS installations come from reading the wrong number off the label.</p>',
    cover_image:null, cover_image_alt:null, cover_image_focus:null, published_at:'2026-08-04T09:00:00Z', reading_minutes:5, author:{ name:'A. Fernandes' }, seo:null,
    is_featured:false, categories:[blogCategories[2]] },
];

const caseStudies = [
  { id:1, title:'Six-plant network consolidation', slug:'six-plant-consolidation',
    client_name:'Meridian Foods', summary:'Replaced six independently-built site networks with one standardised design, central firewall policy and site-to-site VPN.',
    body:'<p>Each plant had been wired by whichever local contractor was available at the time.</p><h2>What we changed</h2><p>One switching standard, one addressing plan, one firewall policy pushed from the centre.</p>',
    results:[{value:'-71%',label:'Network tickets'},{value:'6 wks',label:'Cutover'},{value:'6',label:'Sites standardised'},{value:'Zero',label:'Production stoppages'}],
    cover_image:null, cover_image_alt:null, cover_image_focus:null, industry:{ id:4, name:'Manufacturing', slug:'manufacturing', summary:null, icon:'factory' }, seo:null },
  { id:2, title:'Hospital Wi-Fi & device segmentation', slug:'hospital-wifi',
    client_name:null, summary:'High-density wireless across four floors with clinical devices, staff and guest traffic properly separated.',
    body:'<p>Clinical devices cannot share a broadcast domain with guest phones.</p>',
    results:[{value:'180',label:'Access points'},{value:'Zero',label:'Clinical downtime'}],
    cover_image:null, cover_image_alt:null, cover_image_focus:null, industry:{ id:2, name:'Healthcare', slug:'healthcare', summary:null, icon:'health' }, seo:null },
];

/*
 * CMS pages. GET /pages is what the sitemap uses to discover them — without
 * it here, a build against this mock emits a sitemap of static routes only,
 * because one rejected fetch takes the whole generator down its catch.
 */
const cmsPages = [
  { id:1, title:'Privacy policy', slug:'privacy', template:'default',
    body:'<p>Placeholder privacy copy.</p>',
    published_at:'2026-01-04T09:00:00Z', updated_at:'2026-01-04T09:00:00Z', faqs:[], seo:null },
  { id:2, title:'Terms of service', slug:'terms', template:'default',
    body:'<p>Placeholder terms copy.</p>',
    published_at:'2026-01-04T09:00:00Z', updated_at:'2026-01-04T09:00:00Z', faqs:[], seo:null },
  { id:3, title:'Downloads', slug:'downloads', template:'default',
    body:'<p>Datasheets and remote-support tools.</p>',
    published_at:'2026-01-04T09:00:00Z', updated_at:'2026-01-04T09:00:00Z', faqs:[], seo:null },
  // The two pages Merchant Center requires; the footer links both.
  { id:4, title:'Returns and refunds', slug:'returns', template:'default',
    body:'<p>Placeholder returns copy.</p>',
    published_at:'2026-01-04T09:00:00Z', updated_at:'2026-01-04T09:00:00Z', faqs:[], seo:null },
  { id:5, title:'Shipping and delivery', slug:'shipping', template:'default',
    body:'<p>Placeholder shipping copy.</p>',
    published_at:'2026-01-04T09:00:00Z', updated_at:'2026-01-04T09:00:00Z', faqs:[], seo:null },
];

const kbArticles = [
  { id:1, title:'Configuring business email on iPhone and Android', slug:'business-email-on-mobile',
    excerpt:'Step-by-step IMAP and Exchange setup, with the ports that actually matter.',
    body:'<p>Use these settings exactly — most failures are a wrong port or SSL setting.</p><h2>IMAP</h2><p>Incoming 993 SSL, outgoing 587 STARTTLS.</p>',
    tags:['email','mobile','imap'], category:{ name:'Email & hosting', slug:'email-hosting' },
    published_at:'2026-07-28T09:00:00Z', seo:null },
  { id:2, title:'Why your Wi-Fi survey was wrong', slug:'why-your-wifi-survey-was-wrong',
    excerpt:'Predictive surveys assume an empty building. Here is what changes once the racking goes in.',
    body:'<p>Metal racking absorbs 5 GHz far more aggressively than drywall.</p>',
    tags:['wifi','survey'], category:{ name:'Wi-Fi', slug:'wifi' },
    published_at:'2026-07-19T09:00:00Z', seo:null },
  { id:3, title:'Resetting a forgotten portal password', slug:'reset-portal-password',
    excerpt:'What to do if you cannot sign in to the support portal.',
    body:'<p>Contact your account engineer — portal accounts are issued with your AMC contract.</p>',
    tags:['portal','account'], category:{ name:'Portal', slug:'portal' },
    published_at:'2026-07-02T09:00:00Z', seo:null },
];

/*
 * Messaging channels (WhatsApp, RCS, push). The lists — channels, events,
 * placeholders, audiences — travel on `meta`, as the API sends them.
 */
const MSG_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', needs_approval: true, ready: true, provider: 'Meta WhatsApp Cloud API' },
  { value: 'rcs', label: 'RCS messages', needs_approval: false, ready: false, provider: null },
  { value: 'push', label: 'Browser push', needs_approval: false, ready: true, provider: 'Firebase Cloud Messaging' },
];
const MSG_EVENTS = [
  { value: 'order_placed', label: 'Order placed', promotional: false, placeholders: ['order_number', 'order_total', 'order_url'] },
  { value: 'order_paid', label: 'Order paid', promotional: false, placeholders: ['order_number', 'order_total', 'order_url'] },
  { value: 'order_dispatched', label: 'Order dispatched', promotional: false, placeholders: ['order_number', 'order_url', 'courier', 'tracking_number', 'tracking_url'] },
  { value: 'ticket_replied', label: 'Reply on a ticket', promotional: false, placeholders: ['reference', 'subject', 'ticket_url'] },
  { value: 'cart_reminder_1', label: 'Basket reminder — first', promotional: true, placeholders: ['basket_url', 'item_count', 'basket_total', 'coupon_code'] },
  { value: 'cart_reminder_2', label: 'Basket reminder — second', promotional: true, placeholders: ['basket_url', 'item_count', 'basket_total', 'coupon_code'] },
  { value: 'wishlist_back_in_stock', label: 'Wishlist item back in stock', promotional: true, placeholders: ['product_name', 'product_url'] },
  { value: 'wishlist_price_drop', label: 'Wishlist item price drop', promotional: true, placeholders: ['product_name', 'product_url', 'old_price', 'new_price'] },
];
const MSG_TEMPLATE_META = {
  channels: MSG_CHANNELS,
  events: MSG_EVENTS,
  common_placeholders: ['customer_name', 'first_name', 'site_name'],
  samples: {
    customer_name: 'Neil Basu', first_name: 'Neil', site_name: 'Technoware', order_number: 'ORD-2026-00042', order_total: '₹12,400',
    order_url: 'https://www.technoware.in/store', courier: 'Blue Dart', tracking_number: 'BD1234567890', tracking_url: 'https://www.technoware.in/store',
    reference: 'TK-2026-00042', subject: 'Switch keeps rebooting', ticket_url: 'https://www.technoware.in/store', basket_url: 'https://www.technoware.in/store',
    item_count: '2', basket_total: '₹12,400', coupon_code: 'COMEBACK10', product_name: 'Aruba 6100 48G switch', product_url: 'https://www.technoware.in/store',
    old_price: '₹14,999', new_price: '₹12,999',
  },
  categories: ['utility', 'marketing', 'authentication'],
  approvals: [
    { value: 'not_required', label: 'No approval needed' }, { value: 'draft', label: 'Not submitted' }, { value: 'pending', label: 'Waiting for approval' },
    { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'paused', label: 'Paused by the provider' },
  ],
};
const msgTemplate = (o) => ({
  header_text: null, media_path: null, media_url: null, buttons: [], push_title: null, push_link: null, category: null, language: 'en',
  provider_template_name: null, provider_template_id: null, approval_reason: null, submitted_at: null, synced_at: null,
  updated_at: '2026-09-25T10:00:00+05:30', ...o,
});
const messageTemplates = [
  msgTemplate({ id: 1, channel: 'whatsapp', channel_label: 'WhatsApp', key: 'order_paid', name: 'Order paid', category: 'utility',
    body: 'Hi {{first_name}}, we have your payment for {{order_number}} — {{order_total}}. Track it at {{order_url}}.',
    buttons: [{ type: 'url', text: 'Track order', value: 'https://www.technoware.in/store' }],
    approval_status: 'approved', approval_label: 'Approved', sendable: true, placeholders: ['first_name', 'order_number', 'order_total', 'order_url'] }),
  msgTemplate({ id: 2, channel: 'whatsapp', channel_label: 'WhatsApp', key: 'basket_reminder', name: 'Basket reminder', category: 'marketing',
    body: 'Hi {{first_name}}, your basket is still waiting: {{basket_url}}', approval_status: 'pending', approval_label: 'Waiting for approval',
    sendable: false, placeholders: ['first_name', 'basket_url'] }),
  msgTemplate({ id: 3, channel: 'push', channel_label: 'Browser push', key: 'order_dispatched', name: 'Dispatched', push_title: 'On its way: {{order_number}}',
    push_link: '{{order_url}}', body: '{{courier}} has it. Tracking number {{tracking_number}}.', approval_status: 'not_required',
    approval_label: 'No approval needed', sendable: true, placeholders: ['courier', 'tracking_number'] }),
];
const msgAutomationGrid = () => MSG_EVENTS.flatMap((e) => MSG_CHANNELS.map((c) => {
  const template = e.value === 'order_paid' && c.value === 'whatsapp' ? 1 : e.value === 'cart_reminder_1' && c.value === 'whatsapp' ? 2 : e.value === 'order_dispatched' && c.value === 'push' ? 3 : null;
  const enabled = template !== null;
  const reason = !enabled ? null : template === 2 ? 'The template is not approved yet.' : null;
  return { event: e.value, event_label: e.label, promotional: e.promotional, channel: c.value, message_template_id: template, is_enabled: enabled, live: enabled && !reason, reason };
}));
const msgAutomationMeta = () => ({
  channels: MSG_CHANNELS.map(({ value, label, ready }) => ({ value, label, ready })),
  templates: messageTemplates.map((t) => ({ id: t.id, channel: t.channel, name: t.name, sendable: t.sendable, approval_label: t.approval_label })),
});
const messageContacts = [
  { id: 1, channel: 'whatsapp', channel_label: 'WhatsApp', address: '+919820011223', name: 'Neil Basu', customer: { id: 1, name: 'Neil Basu', email: 'neil@meridianfoods.in' },
    source: 'checkout', is_active: true, opted_in_at: '2026-09-20T11:00:00+05:30', opted_out_at: null, opt_out_reason: null, last_sent_at: '2026-09-24T12:00:00+05:30' },
  { id: 2, channel: 'whatsapp', channel_label: 'WhatsApp', address: '+919830000002', name: null, customer: null,
    source: 'checkout', is_active: false, opted_in_at: '2026-09-18T11:00:00+05:30', opted_out_at: '2026-09-21T09:00:00+05:30', opt_out_reason: 'stop', last_sent_at: null },
  { id: 3, channel: 'push', channel_label: 'Browser push', address: 'fXk3Qe8mT0a1…', name: null, customer: null,
    source: 'push_bell', is_active: true, opted_in_at: '2026-09-22T19:00:00+05:30', opted_out_at: null, opt_out_reason: null, last_sent_at: null },
];
const MSG_BROADCAST_META = {
  channels: MSG_CHANNELS.map(({ value, label, ready }) => ({ value, label, ready })),
  audiences: [
    { value: 'opt_ins', label: 'Everybody opted in on the channel', blurb: 'Guests and customers alike.' },
    { value: 'customers', label: 'Portal customers opted in', blurb: 'Only contacts tied to an active portal account.' },
    { value: 'newsletter_group', label: 'A newsletter group', blurb: 'Matched to portal customers by email address.' },
    { value: 'wishlist', label: 'Wishlist holders of a product', blurb: 'Empty until wishlists exist.' },
  ],
  statuses: [
    { value: 'draft', label: 'Draft' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'sending', label: 'Sending' },
    { value: 'sent', label: 'Sent' }, { value: 'cancelled', label: 'Cancelled' },
  ],
  wishlists: false,
  groups: [{ id: 1, name: 'Existing customers' }, { id: 2, name: 'Partners' }],
  products: [{ id: 1, name: 'Aruba 6100 48G switch' }],
  templates: messageTemplates.map((t) => ({ id: t.id, channel: t.channel, name: t.name, sendable: t.sendable, approval_label: t.approval_label })),
  quiet_hours: { start: '09:00', end: '21:00', open_now: true, next_opening: '2026-09-25T11:00:00+05:30' },
};
const messageBroadcasts = [
  { id: 1, name: 'Diwali switch sale', channel: 'whatsapp', channel_label: 'WhatsApp', message_template_id: 1,
    template: { id: 1, name: 'Order paid', approval_status: 'approved', sendable: true }, audience: 'opt_ins', audience_label: 'Everybody opted in on the channel',
    newsletter_group_id: null, store_product_id: null, status: 'sent', status_label: 'Sent', scheduled_at: null,
    started_at: '2026-09-24T10:00:00+05:30', completed_at: '2026-09-24T10:02:00+05:30', recipient_count: 2, created_at: '2026-09-24T09:50:00+05:30',
    report: { counts: { pending: 0, sent: 0, delivered: 1, read: 0, failed: 1, skipped: 0 }, total: 2, sent: 1, delivery_rate: 1, read_rate: 0,
      failures: [{ id: 2, address: '+919830000002', error: 'Meta answered 400: Recipient phone number not in allowed list', at: '2026-09-24T10:01:00+05:30' }] } },
  { id: 2, name: 'Back-to-office AMC offer', channel: 'whatsapp', channel_label: 'WhatsApp', message_template_id: 1,
    template: { id: 1, name: 'Order paid', approval_status: 'approved', sendable: true }, audience: 'customers', audience_label: 'Portal customers opted in',
    newsletter_group_id: null, store_product_id: null, status: 'draft', status_label: 'Draft', scheduled_at: null, started_at: null, completed_at: null,
    recipient_count: 0, created_at: '2026-09-25T09:00:00+05:30', audience_count: 1 },
];
const MESSAGING_STATUS = {
  channels: [
    { value: 'whatsapp', label: 'WhatsApp', setting: 'messaging_whatsapp_provider', provider: 'meta_cloud', ready: true, address_kind: 'phone', needs_approval: true, error: null,
      providers: [
        { value: 'meta_cloud', label: 'Meta WhatsApp Cloud API', blurb: 'Straight to Meta.', fields: ['whatsapp_meta_phone_number_id', 'whatsapp_meta_business_account_id', 'whatsapp_meta_access_token', 'whatsapp_meta_app_secret', 'whatsapp_meta_verify_token'], available: true, configured: true, webhook_url: 'http://127.0.0.1:8899/api/v1/messaging/webhooks/whatsapp/meta_cloud', webhook_secret_param: false },
        { value: 'gupshup', label: 'Gupshup', blurb: 'Your Gupshup app.', fields: ['whatsapp_gupshup_api_key', 'whatsapp_gupshup_app_name', 'whatsapp_gupshup_app_id', 'whatsapp_gupshup_source', 'messaging_webhook_secret'], available: true, configured: false, webhook_url: 'http://127.0.0.1:8899/api/v1/messaging/webhooks/whatsapp/gupshup', webhook_secret_param: true },
        { value: 'twilio', label: 'Twilio', blurb: 'Account SID and auth token.', fields: ['whatsapp_twilio_account_sid', 'whatsapp_twilio_auth_token', 'whatsapp_twilio_from'], available: true, configured: false, webhook_url: 'http://127.0.0.1:8899/api/v1/messaging/webhooks/whatsapp/twilio', webhook_secret_param: false },
      ] },
    { value: 'rcs', label: 'RCS messages', setting: 'messaging_rcs_provider', provider: null, ready: false, address_kind: 'phone', needs_approval: false, error: null,
      providers: [
        { value: 'google_rbm', label: 'Google RCS Business Messaging', blurb: 'Your agent and a service account.', fields: ['rcs_rbm_agent_id', 'rcs_rbm_service_account', 'rcs_rbm_client_token'], available: true, configured: false, webhook_url: 'http://127.0.0.1:8899/api/v1/messaging/webhooks/rcs/google_rbm', webhook_secret_param: false },
        { value: 'gupshup', label: 'Gupshup', blurb: 'The enterprise gateway.', fields: ['rcs_gupshup_userid', 'rcs_gupshup_password', 'rcs_gupshup_bot_id', 'messaging_webhook_secret'], available: true, configured: false, webhook_url: 'http://127.0.0.1:8899/api/v1/messaging/webhooks/rcs/gupshup', webhook_secret_param: true },
      ] },
    { value: 'push', label: 'Browser push', setting: 'messaging_push_provider', provider: 'fcm', ready: true, address_kind: 'token', needs_approval: false, error: null,
      providers: [
        { value: 'fcm', label: 'Firebase Cloud Messaging', blurb: 'A service account in your Firebase project.', fields: ['push_fcm_service_account'], available: true, configured: true, webhook_url: null, webhook_secret_param: false },
      ] },
  ],
  quiet_hours: { start: '09:00', end: '21:00', open_now: true, next_opening: '2026-09-25T11:00:00+05:30', timezone: 'Asia/Kolkata' },
  queue: { driver: 'database', known: true, pending: 0, failed: 0, oldest_seconds: null },
};
const messagingPreferences = {
  phone: '+919820011223',
  channels: [
    { channel: 'whatsapp', label: 'WhatsApp', live: true, opted_in: true, devices: null },
    { channel: 'rcs', label: 'RCS messages', live: false, opted_in: false, devices: null },
    { channel: 'push', label: 'Browser push', live: true, opted_in: true, devices: 1 },
  ],
};

const paginate = (rows) => ({
  data: rows,
  links:{ first:null, last:null, prev:null, next:null },
  meta:{ current_page:1, last_page:1, per_page:24, total:rows.length },
});

/* ---------------- AEO + GEO (docs/aeo-geo-contract.md) ----------------
 *
 * The nine answer-block kinds, in the enum's own order, on every admin
 * index's `meta.answer_block_kinds` — the console builds the repeater's kind
 * select from these and never retypes them, so a mock that omitted the list
 * would render a select with no options and no error. `asks_question` is
 * what makes the question field required for `question` and `comparison`. */
const ANSWER_BLOCK_KINDS = [
  { value: 'definition', label: 'Definition', heading: 'What is it?', asks_question: false },
  { value: 'who_for', label: 'Who it is for', heading: 'Who is it for?', asks_question: false },
  { value: 'why', label: 'Why it is needed', heading: 'Why is it needed?', asks_question: false },
  { value: 'key_fact', label: 'Key fact', heading: 'Key facts', asks_question: false },
  { value: 'feature', label: 'Feature', heading: 'Key features', asks_question: false },
  { value: 'use_case', label: 'Use case', heading: 'Use cases', asks_question: false },
  { value: 'comparison', label: 'Comparison', heading: 'Comparisons', asks_question: true },
  { value: 'step', label: 'Step', heading: 'How it works', asks_question: false },
  { value: 'question', label: 'Question', heading: 'Questions people ask', asks_question: true },
];

/* The first solution's blocks \u2014 every kind once, so the AEO tab and every
   renderer branch on the public page (`components/content/answer-blocks.tsx`)
   have something to draw; the store's first product and the first knowledge
   article carry a full set too, below. The last row is a draft, which the
   admin read carries and the public read must not. Every other detail
   answers `answer_blocks: []`. */
const SOLUTION_ANSWER_BLOCKS = [
  { id: 1, kind: 'definition', question: null,
    answer: 'Enterprise networking is the design and installation of the switching, cabling and routing that carries an organisation\u2019s data between its devices, servers and the internet.',
    detail: '<p>It covers structured cabling, core and access switching, VLAN design and inter-VLAN routing \u2014 planned from a survey of what is installed rather than added a switch at a time.</p>',
    sort_order: 0, status: 'published' },
  { id: 2, kind: 'question', question: 'How long does a network cutover take?',
    answer: 'A single site is usually cut over in one evening or weekend, in stages, with a documented rollback at every step.',
    detail: null, sort_order: 1, status: 'published' },
  { id: 3, kind: 'who_for', question: null,
    answer: 'Any organisation with more than a couple of dozen devices on one site \u2014 the point at which an unmanaged network stops being cheap and starts being the reason things are slow.',
    detail: '<p>Offices, plants, clinics and schools: anywhere a network was built one switch at a time and nobody can now say why.</p>',
    sort_order: 2, status: 'published' },
  { id: 4, kind: 'why', question: null,
    answer: 'A network that accreted has no diagram, no segmentation and no headroom, so every fault is a hunt and every growth step is a surprise.',
    detail: null, sort_order: 3, status: 'published' },
  { id: 5, kind: 'key_fact', question: 'Documentation', answer: 'Every installation ends with a diagram that matches the racks and a cable schedule labelled at both ends.', detail: null, sort_order: 4, status: 'published' },
  { id: 6, kind: 'key_fact', question: 'Headroom', answer: 'Core links are sized for three to five years of growth, not for today.', detail: null, sort_order: 5, status: 'published' },
  { id: 7, kind: 'feature', question: null, answer: 'VLAN segmentation with inter-VLAN routing and ACLs between them.', detail: null, sort_order: 6, status: 'published' },
  { id: 8, kind: 'feature', question: null, answer: '802.1X port authentication on every access port.', detail: '<p>A device that is not known does not get a network.</p>', sort_order: 7, status: 'published' },
  { id: 9, kind: 'use_case', question: 'A plant with OT on the office LAN',
    answer: 'The PLCs and the payroll server shared one broadcast domain; segmentation put them on separate VLANs with a firewall between.',
    detail: '<p>Nothing on the shop floor changed except its address.</p>', sort_order: 8, status: 'published' },
  { id: 10, kind: 'use_case', question: 'A clinic outgrowing its cabling',
    answer: 'Forty new devices on a network cabled for twelve: a survey, a new core and a staged cutover over two weekends.',
    detail: null, sort_order: 9, status: 'published' },
  { id: 11, kind: 'comparison', question: 'Managed versus unmanaged switches',
    answer: 'Unmanaged switches are cheaper per port and cannot segment, prioritise or authenticate anything; managed switches can, and are what every site past a few dozen devices needs.',
    detail: '<p>The difference is not speed. It is whether a fault can be found.</p>', sort_order: 10, status: 'published' },
  { id: 12, kind: 'comparison', question: 'Cisco Catalyst versus HPE Aruba CX',
    answer: 'Both are enterprise-grade; the choice usually follows what the site already runs and who will support it.',
    detail: null, sort_order: 11, status: 'published' },
  { id: 13, kind: 'step', question: 'Survey', answer: 'We record what is physically installed \u2014 every switch, every run, every patch.', detail: null, sort_order: 12, status: 'published' },
  { id: 14, kind: 'step', question: 'Design', answer: 'An addressing plan, a switching topology and a cable schedule, agreed before anything is bought.', detail: null, sort_order: 13, status: 'published' },
  { id: 15, kind: 'step', question: 'Cutover', answer: 'Out of hours, in stages, with a rollback point at every step.', detail: '<p>The old core stays powered until the new one has carried a full working day.</p>', sort_order: 14, status: 'published' },
  { id: 16, kind: 'question', question: 'Do you supply the switches too?',
    answer: 'Yes. We quote the hardware with the work, from the manufacturers we are partnered with, and we support what we install.',
    detail: '<p>Bringing your own hardware is fine as well; we say up front what we can and cannot support.</p>', sort_order: 15, status: 'published' },
  { id: 17, kind: 'question', question: 'Is this a draft?',
    answer: 'A draft block, which the admin read carries and the public page must never show.',
    detail: null, sort_order: 16, status: 'draft' },
];

/* The store's first product: the product-flavoured set \u2014 a definition, the
   facts a buyer checks, where it is used, the comparison with the next model
   up, and the questions people ask before adding it to a basket. */
const STORE_PRODUCT_ANSWER_BLOCKS = [
  { id: 21, kind: 'definition', question: null,
    answer: 'The CBS350-24T-4G is a 24-port Gigabit managed access switch with four SFP uplinks, for wiring closets that need VLANs and static routing without a full enterprise licence.',
    detail: null, sort_order: 0, status: 'published' },
  { id: 22, kind: 'who_for', question: null,
    answer: 'Offices and small plants with up to a few hundred devices, where each closet needs its own managed switch and the core is elsewhere.',
    detail: null, sort_order: 1, status: 'published' },
  { id: 23, kind: 'key_fact', question: 'Ports', answer: '24 \u00d7 10/100/1000 plus 4 \u00d7 1G SFP uplinks.', detail: null, sort_order: 2, status: 'published' },
  { id: 24, kind: 'key_fact', question: 'Noise', answer: 'Fanless, so it can sit in an office rather than a rack room.', detail: null, sort_order: 3, status: 'published' },
  { id: 25, kind: 'feature', question: null, answer: 'Layer 3 lite static routing between VLANs.', detail: null, sort_order: 4, status: 'published' },
  { id: 26, kind: 'use_case', question: 'A floor closet feeding 20 desks', answer: 'Two dozen desks, a printer and two access points on one switch, uplinked to the core over SFP.', detail: null, sort_order: 5, status: 'published' },
  { id: 27, kind: 'comparison', question: 'CBS350-24T versus CBS350-24P',
    answer: 'The 24P adds PoE+ on every port for phones and access points; the 24T does not power anything and costs less. Choose by what will be plugged in.',
    detail: null, sort_order: 6, status: 'published' },
  { id: 28, kind: 'step', question: 'Rack it', answer: 'One rack unit, brackets in the box.', detail: null, sort_order: 7, status: 'published' },
  { id: 29, kind: 'step', question: 'Set the management address', answer: 'Through the console port or the default web address, before it goes on the network.', detail: null, sort_order: 8, status: 'published' },
  { id: 30, kind: 'question', question: 'Does it support PoE?',
    answer: 'No \u2014 this is the non-PoE variant. The CBS350-24P powers phones and access points.',
    detail: null, sort_order: 9, status: 'published' },
  { id: 31, kind: 'question', question: 'What warranty does it carry?',
    answer: 'Cisco\u2019s limited lifetime warranty, and our own support for what we install.',
    detail: null, sort_order: 10, status: 'published' },
];

/* The first knowledge article: the guide-flavoured set \u2014 a definition, the
   steps, a comparison of the two protocols and the questions that end up as
   tickets when the guide does not answer them. */
const KB_ANSWER_BLOCKS = [
  { id: 41, kind: 'definition', question: null,
    answer: 'Business email on a phone is the same mailbox as on the desktop, reached over IMAP or Exchange; the settings below are the ports and security options that actually matter.',
    detail: '<p>Most failures are one wrong port or a security setting left on the default.</p>', sort_order: 0, status: 'published' },
  { id: 42, kind: 'why', question: null,
    answer: 'A phone set up with the wrong incoming port syncs once and then silently stops, which is the fault most often reported as "email is down".',
    detail: null, sort_order: 1, status: 'published' },
  { id: 43, kind: 'key_fact', question: 'IMAP incoming', answer: 'Port 993, SSL/TLS.', detail: null, sort_order: 2, status: 'published' },
  { id: 44, kind: 'key_fact', question: 'SMTP outgoing', answer: 'Port 587, STARTTLS, authentication on.', detail: null, sort_order: 3, status: 'published' },
  { id: 45, kind: 'comparison', question: 'IMAP versus Exchange ActiveSync',
    answer: 'IMAP syncs mail only; Exchange syncs mail, calendar and contacts together. Use Exchange where the mailbox offers it.',
    detail: null, sort_order: 4, status: 'published' },
  { id: 46, kind: 'step', question: 'Add the account', answer: 'Settings \u2192 Mail \u2192 Accounts \u2192 Add account \u2192 Other.', detail: null, sort_order: 5, status: 'published' },
  { id: 47, kind: 'step', question: 'Enter the servers', answer: 'Incoming and outgoing host names exactly as on your welcome sheet, with the ports above.', detail: null, sort_order: 6, status: 'published' },
  { id: 48, kind: 'step', question: 'Send a test', answer: 'Send yourself a message and confirm it arrives on the desktop too.', detail: null, sort_order: 7, status: 'published' },
  { id: 49, kind: 'question', question: 'Why does sending fail while receiving works?',
    answer: 'Outgoing authentication is off. Turn it on and use the same login as incoming.',
    detail: null, sort_order: 8, status: 'published' },
  { id: 50, kind: 'question', question: 'Can I use the same settings on Android?',
    answer: 'Yes \u2014 the ports and security options are the same; only the menus differ.',
    detail: null, sort_order: 9, status: 'published' },
];

/* The public shape of a block set (`docs/aeo-geo-contract.md` \u00a71, read):
   published only, in order, no `id`/`sort_order`/`status`, and the kind's
   `heading` beside it \u2014 the page draws a group under the API's heading and
   never keeps a map of its own. */
const publicBlocks = (blocks) => blocks
  .filter((b) => b.status === 'published')
  .sort((a, b) => a.sort_order - b.sort_order)
  .map(({ kind, question, answer, detail }) => ({
    kind, question, answer, detail,
    heading: ANSWER_BLOCK_KINDS.find((k) => k.value === kind)?.heading ?? kind,
  }));

/* Mirrors StructuredData::answerFaqs(): one FAQPage over the FAQs and the
   published `question` blocks, in that order, and **nothing under two
   entries** \u2014 a key that is absent, never null. */
const faqSchemaOf = (faqs = [], blocks = []) => {
  const entries = [
    ...faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer.replace(/<[^>]+>/g, '') } })),
    ...publicBlocks(blocks).filter((b) => b.kind === 'question' && b.question).map((b) => ({
      '@type': 'Question', name: b.question,
      acceptedAnswer: { '@type': 'Answer', text: [b.answer, (b.detail || '').replace(/<[^>]+>/g, '')].filter(Boolean).join(' ') },
    })),
  ];
  return entries.length < 2 ? {} : { faq_schema: { '@context': SCHEMA_ORG, '@type': 'FAQPage', mainEntity: entries } };
};

/* Mirrors App\Support\EntityLinks::for(): `{name, path}` links, paths never
   URLs, `[]` for a relation that is empty. */
const entityOf = ({ brand = null, category = null, solutions = [], services = [], industries = [], articles = [], faq_count = 0 } = {}) => ({
  ...(brand ? { brand } : {}), ...(category ? { category } : {}),
  solutions, services, industries, articles, faq_count,
});

/* What every public detail read carries since 2026-09-21: the published
   blocks, the FAQs, the entity block and \u2014 under the gate \u2014 the FAQPage. */
const answerContent = (blocks, faqs, entity) => ({
  answer_blocks: publicBlocks(blocks),
  faqs,
  entity: entityOf(entity),
  ...faqSchemaOf(faqs, blocks),
});

/* The AI SEO assistant's `meta`, **switched on** so the console's two
   panels draw their buttons. The fifteen actions are the API's own list
   (`SeoAiAction::options()`), labels and blurbs included, because the
   console draws only what this list carries. */
const SEO_AI_META = {
  enabled: true, configured: true, model: 'google/gemini-2.5-flash',
  /* OpenRouter ids — every AI feature goes through OpenRouter, so a model is
     named `<provider>/<model>`. The same seven the API offers as `options`
     on `chatbot_model` and `seo_ai_model`. */
  models: [
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenAI)', description: 'Cheapest and quickest of the OpenAI models.' },
    { value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini (OpenAI)', description: 'A step up in quality for a little more.' },
    { value: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)', description: 'Better copy, at several times the price.' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1 (OpenAI)', description: 'The strongest OpenAI model offered here.' },
    { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Google)', description: 'Google\'s cheapest and quickest.' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Google)', description: 'Quick and capable. The default.' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)', description: 'The strongest Google model offered here.' },
  ],
  actions: [
    { value: 'generate', label: 'Generate SEO', description: 'A title, a description and keywords for this record.' },
    { value: 'analyze', label: 'Analyse SEO', description: 'Strengths, weaknesses and what the page does not cover.' },
    { value: 'improve', label: 'Improve content', description: 'Suggested edits to the copy, keeping what it says true.' },
    { value: 'faq', label: 'Generate FAQs', description: 'Questions this page leaves unanswered, with answers.' },
    { value: 'internal_links', label: 'Suggest internal links', description: 'Existing pages worth linking to from this one.' },
    { value: 'schema', label: 'Suggest schema', description: 'Which structured-data type suits this page.' },
    { value: 'keywords', label: 'Suggest keywords', description: 'The one phrase this page should win, the intent behind it, and the phrases around it.' },
    { value: 'aeo_analyze', label: 'Analyse for answers', description: 'What an assistant could quote from this page as it stands, and what it cannot.' },
    { value: 'questions', label: 'Suggest questions', description: 'What people ask before choosing this, with the intent behind each question.' },
    { value: 'answer_blocks', label: 'Draft answer blocks', description: 'A definition, key facts, use cases and steps written from the material, as draft blocks.' },
    { value: 'improve_answer', label: 'Improve an answer', description: 'A tighter direct answer and supporting detail for one block.' },
    { value: 'faq_suggest', label: 'Suggest FAQs', description: 'Questions the page leaves unanswered, with answers, as FAQ rows.' },
    { value: 'geo_analyze', label: 'Analyse for engines', description: 'Whether an engine can tell what it is quoting: the entity, its relationships, its authority.' },
    { value: 'entity_links', label: 'Suggest related records', description: 'Solutions, services, industries, articles and products worth relating to this record.' },
    { value: 'product_qa', label: 'Draft product answers', description: 'Answers written from the product’s own facts — a missing one is marked, never invented.' },
  ],
  today: { runs: 0, cap: 100, remaining: 100, reached: false },
  usage: [],
};

/* One canned result per AEO/GEO action, in the exact shape `SeoAssistant`
   validates it into (`docs/aeo-geo-contract.md` §6). The `[MISSING: …]`
   in the product answers is deliberate: it is what the real assistant
   writes for a fact it was not given, and what the console must show
   rather than tidy away. `entity_links` carries `n` into a list nobody
   sees here plus the `title`/`path` the real reply carries beside it. */
const SEO_AI_CANNED = {
  aeo_analyze: {
    summary: 'The page explains the solution well but offers little an assistant could lift as a one-line answer.',
    strengths: ['States plainly what the solution covers', 'Names the technologies involved'],
    gaps: ['No block says who it is for', 'No use case with a measurable outcome', 'No steps for how a project runs'],
    suggestions: ['Add a who_for block naming the size and kind of organisation', 'Add one use_case block from a real project', 'Add three step blocks: survey, design, cutover'],
  },
  geo_analyze: {
    summary: 'An engine can tell what this is, but not who it is for or which industries it serves.',
    strengths: ['A definition block exists', 'The business behind it is named'],
    gaps: ['No industries are related', 'No supporting article links here', 'No why block'],
    suggestions: ['Tick the industries this solution is sold into', 'Publish or link one knowledge article about it', 'Add a why block'],
  },
  questions: {
    questions: [
      { question: 'How many users can a single core switch serve?', intent: 'to check a fit' },
      { question: 'Does the design include Wi-Fi?', intent: 'to compare' },
      { question: 'What happens to the old switches?', intent: 'to learn' },
      { question: 'Is the network managed after installation?', intent: 'to buy' },
    ],
  },
  answer_blocks: {
    blocks: [
      { kind: 'who_for', question: null, answer: 'Offices and sites of 50 to 2,000 users that have outgrown unmanaged switches and need VLANs, redundancy and documentation.', detail: '<p>Typically a head office with branch links, or a campus with several buildings.</p>' },
      { kind: 'use_case', question: null, answer: 'A distribution warehouse moved from flat, unmanaged switching to a segmented core with redundant uplinks in one weekend.', detail: null },
      { kind: 'step', question: null, answer: 'Survey what is installed and how it is used.', detail: null },
      { kind: 'step', question: null, answer: 'Design the VLANs, the core and the uplinks, and document the cutover.', detail: null },
      { kind: 'step', question: null, answer: 'Cut over in stages, with a rollback at every step.', detail: null },
    ],
  },
  product_qa: {
    blocks: [
      { kind: 'definition', question: null, answer: 'The Cisco CBS350-24T-4G is a 24-port Gigabit managed switch with four SFP uplinks for small and medium offices.', detail: null },
      { kind: 'key_fact', question: null, answer: 'It carries a [MISSING: warranty term] warranty from Cisco.', detail: null },
      { kind: 'question', question: 'Does it support PoE?', answer: 'No — the 24T is the non-PoE model; [MISSING: the PoE model number] is the PoE variant.', detail: null },
      { kind: 'use_case', question: null, answer: 'Access switching for a branch office of up to 24 wired devices with fibre uplinks to the core.', detail: null },
    ],
  },
  improve_answer: {
    answer: 'A single site is cut over in one evening or weekend, in stages, each with a documented rollback.',
    detail: '<p>The core is moved first, then each access switch in turn, so no floor is down for longer than one stage.</p>',
  },
  faq_suggest: {
    faqs: [
      { question: 'Does the design include structured cabling?', answer: 'Yes. Cabling is surveyed and, where needed, replaced as part of the same project.' },
      { question: 'Can the old switches be reused?', answer: 'Where they are managed and in support, yes; unmanaged switches are replaced.' },
    ],
  },
  entity_links: {
    links: [
      { n: 1, relation: 'service', title: 'Network installation', path: '/services/network-installation', reason: 'This service installs the solution.' },
      { n: 4, relation: 'industry', title: 'Manufacturing', path: '/industries/manufacturing', reason: 'Most projects of this kind are on plant floors.' },
      { n: 7, relation: 'article', title: 'VLANs explained', path: '/knowledge-base/vlans-explained', reason: 'The article walks through the segmentation the page describes.' },
    ],
  },
};

/* AEO and GEO readiness in the `SeoScore` shape: `{value, band}` on a list
   row, the whole thing with `failed` on the single-record read. Absent on
   every record but the first solution, which is what "not scored yet" is
   drawn from. */
const AEO_SCORES = {
  'solution:1': {
    value: 62, band: 'fair', passed: 6, checked: 9,
    failed: [
      { key: 'questions', group: 'answer', label: 'Three questions answered', weight: 10, hint: 'Add question blocks or FAQs until the page answers at least three questions people ask.' },
      { key: 'use_cases', group: 'answer', label: 'A use case', weight: 8, hint: 'Add a use-case block: who used it, for what, and what changed.' },
      { key: 'comparison', group: 'answer', label: 'A comparison', weight: 6, hint: 'Compare it with the obvious alternative in a comparison block.' },
    ],
  },
};
/** The checks failing across the fixtures, ranked by count × weight — Laravel's `averageOf()`. */
function topIssues(scores) {
  const seen = {};
  for (const s of Object.values(scores)) for (const f of s.failed) {
    seen[f.key] ??= { key: f.key, label: f.label, group: f.group, weight: f.weight, count: 0 };
    seen[f.key].count++;
  }
  return Object.values(seen).sort((a, c) => c.count * c.weight - a.count * a.weight).slice(0, 6);
}
const GEO_SCORES = {
  'solution:1': {
    value: 48, band: 'poor', passed: 4, checked: 8,
    failed: [
      { key: 'articles_link', group: 'authority', label: 'A supporting article', weight: 8, hint: 'Publish or link a blog post or knowledge article about this subject.' },
      { key: 'first_hand', group: 'content', label: 'First-hand content', weight: 10, hint: 'Add a "who it is for" or "why it is needed" block written from experience.' },
      { key: 'certifications', group: 'authority', label: 'Certifications on file', weight: 6, hint: 'Add the company\u2019s certifications under Company \u2192 Certifications.' },
      { key: 'nap_consistent', group: 'entity', label: 'Consistent name, address and phone', weight: 8, hint: 'Fill in the address and phone number under Settings \u2192 Contact.' },
    ],
  },
};
const readiness = (table, type, id, full) => {
  const s = table[`${type}:${id}`];
  if (!s) return null;
  return full ? s : { value: s.value, band: s.band };
};

/* The admin CMS: one index and one detail per entity that carries answer
   blocks (and FAQs), in the admin resource shapes the edit forms read.
   Enough to open every AEO tab against the mock; a PATCH echoes the row.
   Every index carries `meta.answer_block_kinds`. */
const adminOf = (r, extra = {}) => ({
  status: 'published', status_label: 'Published', sort_order: 0, show_in_menu: true,
  seo: null, seo_defaults: null, faqs: [], answer_blocks: [],
  created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z',
  ...r, ...extra,
});
/*
 * The section page builder (2026-09-26, docs/page-builder.md). A builder
 * page's public read carries `sections` (presented: hidden ones gone, paths
 * as URLs, live lists resolved); the admin read carries `blocks` as stored,
 * `blocks_media` and the same `sections`. `GET /admin/pages/builder` is the
 * builder's pickers and `POST /admin/pages/preview` presents without writing.
 */
const SECTION_TYPES = [
  { value: 'hero', label: 'Hero', blurb: 'The opening band: a heading, a line under it, a picture and up to two buttons.' },
  { value: 'rich_text', label: 'Text', blurb: 'A heading and a body from the editor.' },
  { value: 'media_text', label: 'Picture or video with text', blurb: 'A picture or a video on one side and words on the other.' },
  { value: 'features', label: 'Features', blurb: 'Up to twelve short points in columns, each with an icon.' },
  { value: 'cards', label: 'Cards from the catalogue', blurb: 'A live list drawn as the theme draws its grids.' },
  { value: 'content_block', label: 'Content block', blurb: 'A published CTA banner, stat bar, pricing table or technology stack.' },
  { value: 'slider', label: 'Slider', blurb: 'A published slider.' },
  { value: 'gallery', label: 'Gallery', blurb: 'A published gallery.' },
  { value: 'form', label: 'Form', blurb: 'A published form, with a heading above it.' },
  { value: 'faq', label: 'Questions', blurb: 'Questions that open, written here or taken from this page’s FAQs.' },
  { value: 'logos', label: 'Logo strip', blurb: 'Client logos or the brands you carry.' },
  { value: 'testimonial', label: 'Testimonial', blurb: 'One quotation, with who said it and a photo.' },
  { value: 'video', label: 'Video', blurb: 'A YouTube video or a video from the library.' },
  { value: 'divider', label: 'Divider', blurb: 'Space between two sections, with or without a rule.' },
  { value: 'stats', label: 'Figures', blurb: 'Up to eight figures that count up as they arrive — as plain numbers, rings or bars.' },
  { value: 'steps', label: 'Steps', blurb: 'A numbered process, down the page with a line joining the steps or across it.' },
  { value: 'tabs', label: 'Tabs', blurb: 'Two to eight panels behind tabs, each with words and an optional picture.' },
  { value: 'checklist', label: 'Checklist', blurb: 'A list of short points with a tick or an icon, in one to three columns.' },
  { value: 'cta', label: 'Call to action', blurb: 'A closing band — a heading, a line and buttons — drawn the way the theme draws its own.' },
  { value: 'comparison', label: 'Comparison table', blurb: 'Two to four plans side by side, feature by feature, with a tick, a cross or a few words in each cell.' },
  { value: 'timeline', label: 'Timeline', blurb: 'Dated milestones joined by a line — a company history, a project, a roll-out.' },
  { value: 'before_after', label: 'Before and after', blurb: 'Two pictures of one place with a divider somebody drags across — a rack before and after, a site before and after.' },
  { value: 'testimonials', label: 'Testimonials', blurb: 'Two to nine quotations as cards, each with who said it and an optional photo.' },
  { value: 'team', label: 'Team', blurb: 'The people from Company → Team, as the theme draws its team cards — everybody, or one department. It follows the team as it changes.' },
  { value: 'downloads', label: 'Downloads', blurb: 'Files from the media library — brochures, datasheets, price lists — each with its size and a download button.' },
  { value: 'countdown', label: 'Countdown', blurb: 'Days, hours, minutes and seconds to a date — a launch, an offer ending, an event — with a line for when it has passed.' },
  { value: 'columns', label: 'Columns of text', blurb: 'Two or three columns side by side, each with a heading and a body from the editor.' },
  { value: 'map', label: 'Map', blurb: 'A Google map, loaded only when somebody presses it, with the address beside it.' },
  { value: 'story', label: 'Scroll story', blurb: 'Steps that scroll past a picture held in place, the picture changing with each step — a product tour, a process, a project told in stages.' },
  { value: 'flow', label: 'Diagram', blurb: 'A row of connected steps — a network, a process, how data moves — whose connecting lines draw themselves as the page scrolls.' },
  { value: 'subnav', label: 'In-page menu', blurb: 'A strip of links to the sections of this page, which stays at the top of the screen as it scrolls. It lists every section you have given an anchor to (Style → Anchor), in page order.' },
  { value: 'theme_section', label: 'From the theme', blurb: 'One of the theme’s own homepage sections — the hero, the solutions, the partners, the closing band — drawn the way the active theme draws it, and changing when the theme does.' },
];
/* The AI page builder's refusal while the AI SEO assistant is off (0.116.0) — the API's sentence. */
const AI_DRAFT_OFF = 'The AI SEO assistant is switched off. Turn it on in Settings → SEO defaults.';
const SECTION_PRESETS = [
  { value: 'landing', label: 'Landing page', blurb: 'A hero, three reasons, a live list of solutions, questions and a close.', sections: [
    { type: 'hero', hidden: false, background: null, data: { heading: 'The promise, in one line', layout: 'centered', primary: { label: 'Talk to us', href: '/contact' } } },
    { type: 'features', hidden: false, background: null, data: { heading: 'Why it works', columns: 3, items: [{ icon: 'shield', title: 'The first reason' }] } },
    { type: 'cards', hidden: false, background: null, data: { heading: 'What we build', source: 'solutions', limit: 6, columns: 3 } },
  ] },
];
/* The section library: kept in memory for the run, like the mock's other writes. */
const savedSections = [];
const savedResource = (x, detail) => ({
  id: x.id, kind: x.kind, name: x.name, description: x.description,
  type: x.kind === 'section' ? (x.blocks[0]?.type ?? null) : null,
  type_label: x.kind === 'section' ? (SECTION_TYPES.find((t) => t.value === x.blocks[0]?.type)?.label ?? null) : null,
  count: x.blocks.length, author: 'Mock editor', updated_at: x.updated_at,
  ...(detail ? { blocks: x.blocks, blocks_media: {}, sections: x.blocks, linked_from: [] } : {}),
});
const BUILDER_OPTIONS = {
  section_types: SECTION_TYPES,
  section_presets: SECTION_PRESETS,
  hero_layouts: [
    { value: 'centered', label: 'Centred', blurb: 'The words centred on the section’s ground.' },
    { value: 'split', label: 'Split', blurb: 'The words on one side, the picture framed on the other.' },
    { value: 'cover', label: 'Cover', blurb: 'The picture fills the band under a dark overlay.' },
  ],
  // The assistant on a section (0.127.0): off in the mock, as the page draft is.
  ai_section: {
    available: false, reason: AI_DRAFT_OFF,
    types: ['hero', 'rich_text', 'media_text', 'features', 'cards', 'form', 'faq', 'steps', 'tabs', 'checklist', 'cta', 'timeline', 'flow', 'story', 'columns', 'countdown'],
    modes: [
      { value: 'write', label: 'Write', blurb: 'Write this section from a line or two about what it should say.', needs_brief: true },
      { value: 'rewrite', label: 'Reword', blurb: 'Say the same thing more clearly, at about the same length.', needs_brief: false },
      { value: 'shorten', label: 'Shorten', blurb: 'The running text about half as long, with the same facts. Headings stay.', needs_brief: false },
      { value: 'expand', label: 'Expand', blurb: 'The running text about twice as long. A fact it was not given is marked [CHECK: …].', needs_brief: false },
    ],
  },
  // Edit on the page (0.128.0): the plain-text fields of each type, as the API derives them from its rules.
  inline_fields: Object.fromEntries(Object.entries({
    hero: [['kicker', 80], ['heading', 160], ['lede', 400], ['primary.label', 40], ['secondary.label', 40]],
    rich_text: [['heading', 160]],
    media_text: [['kicker', 80], ['heading', 160], ['primary.label', 40], ['secondary.label', 40]],
    features: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.title', 80], ['items.*.body', 300], ['items.*.link_label', 40]],
    cards: [['kicker', 80], ['heading', 160], ['lede', 400]],
    slider: [['heading', 160]],
    gallery: [['heading', 160]],
    form: [['heading', 160], ['lede', 400]],
    faq: [['heading', 160], ['items.*.question', 300], ['items.*.answer', 2000]],
    logos: [['heading', 120]],
    testimonial: [['quote', 800], ['name', 120], ['role', 160]],
    video: [['heading', 160], ['caption', 300]],
    stats: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.value', 24], ['items.*.label', 80]],
    steps: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.title', 80], ['items.*.body', 400]],
    tabs: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.label', 40], ['items.*.heading', 120], ['items.*.body', 2000]],
    checklist: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.text', 200], ['primary.label', 40], ['secondary.label', 40]],
    cta: [['kicker', 80], ['heading', 160], ['lede', 400], ['primary.label', 40], ['secondary.label', 40]],
    comparison: [['kicker', 80], ['heading', 160], ['lede', 400], ['plans.*.name', 40], ['plans.*.note', 60], ['rows.*.label', 120], ['rows.*.cells.*', 60], ['primary.label', 40]],
    timeline: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.date', 24], ['items.*.title', 120], ['items.*.body', 400]],
    before_after: [['heading', 160], ['lede', 400], ['before_label', 24], ['after_label', 24], ['caption', 300]],
    testimonials: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.quote', 600], ['items.*.name', 120], ['items.*.role', 160]],
    team: [['kicker', 80], ['heading', 160], ['lede', 400]],
    downloads: [['kicker', 80], ['heading', 160], ['lede', 400], ['items.*.title', 120], ['items.*.note', 200]],
    countdown: [['kicker', 80], ['heading', 160], ['lede', 400], ['done_text', 160], ['primary.label', 40], ['secondary.label', 40]],
    columns: [['kicker', 80], ['heading', 160], ['lede', 400], ['columns.*.heading', 120]],
    map: [['heading', 160], ['lede', 400], ['address', 300]],
    story: [['kicker', 60], ['heading', 120], ['lede', 300], ['items.*.title', 100], ['items.*.body', 600]],
    flow: [['kicker', 80], ['heading', 120], ['lede', 300], ['items.*.title', 60], ['items.*.note', 160], ['caption', 200]],
    subnav: [['label', 40]],
  }).map(([type, fields]) => [type, fields.map(([path, max]) => ({ path, max }))])),
  card_sources: [
    { value: 'solutions', label: 'Solutions' }, { value: 'services', label: 'Services' }, { value: 'industries', label: 'Industries' },
    { value: 'case_studies', label: 'Case studies' }, { value: 'blog', label: 'Blog posts' }, { value: 'knowledge', label: 'Knowledge base articles' },
    { value: 'products', label: 'Products (catalogue)' }, { value: 'store_products', label: 'Products (shop)' },
    // Upcoming events, soonest first (docs/events-contract.md).
    { value: 'events', label: 'Events' },
    // 0.126.0: categories, vacancies, and one `entry:<type-slug>` per active content type (none in the mock).
    { value: 'product_categories', label: 'Product categories (catalogue)' }, { value: 'store_categories', label: 'Shop categories' },
    { value: 'vacancies', label: 'Open vacancies' },
  ],
  content_blocks: [], sliders: [], galleries: [], forms: [],
  product_categories: productCategories.map(({ id, name, slug }) => ({ id, name, slug })),
  store_categories: storeCategories.map(({ id, name, slug }) => ({ id, name, slug })),
};
const SAMPLE_BUILDER_BLOCKS = [
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000001', type: 'hero', hidden: false, background: null, data: {
    kicker: 'Sample page', heading: 'A page built from sections', layout: 'centered',
    lede: 'Every kind of section the builder offers, in one place.',
    primary: { label: 'Talk to us', href: '/contact' }, secondary: { label: 'See the solutions', href: '/solutions' } } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000002', type: 'rich_text', hidden: false, background: null, data: {
    heading: 'Text from the editor', body: '<p>A section of ordinary text with <strong>bold</strong> and <a href="/about">links</a>.</p>' } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000003', type: 'features', hidden: false, background: { kind: 'page' }, data: {
    heading: 'Short points in columns', columns: 3, items: [
      { icon: 'shield', title: 'Secure by default', body: 'One sentence about it.' },
      { icon: 'clock', title: 'Fast to respond', body: 'One sentence about it.', href: '/support', link_label: 'Support' },
      { icon: 'users', title: 'People you know', body: 'One sentence about it.' },
    ] } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000004', type: 'cards', hidden: false, background: null, data: {
    heading: 'A live list', source: 'solutions', limit: 3, columns: 3 } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000005', type: 'testimonial', hidden: false, background: null, data: {
    quote: 'A customer’s words go here, with their permission.', name: 'A customer', role: 'Their role, their company' } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000006', type: 'logos', hidden: false, background: null, data: { heading: 'Trusted by', source: 'clients' } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000007', type: 'video', hidden: false, background: null, data: { heading: 'A video', source: 'youtube', youtube: 'aqz-KE-bpKQ', caption: 'A placeholder.' } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000008', type: 'divider', hidden: false, background: null, data: { size: 'medium', rule: true } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000009', type: 'faq', hidden: false, background: null, data: { heading: 'Questions', source: 'custom', items: [
    { question: 'Can a section be hidden?', answer: 'Yes — it stays with the page and is left off the public site.' },
    { question: 'Can sections be reordered?', answer: 'Yes, with the arrows on each section.' },
  ] } },
  { id: '0f6a3c1e-1111-4a8b-9c2d-000000000010', type: 'rich_text', hidden: true, background: null, data: { heading: 'Hidden', body: '<p>Not drawn.</p>' } },
];
/** The presenter's shape, for this mock's few types: hidden ones gone, a live list resolved. */
function presentSections(blocks) {
  return blocks.filter((b) => !b.hidden).map((b) => {
    // A scroll story's pictures are paths as stored and URLs as presented, the tabs' rule.
    if (b.type === 'story') {
      const items = (Array.isArray(b.data?.items) ? b.data.items : []).map(({ image_path, ...it }) => ({
        ...it, image: image_path ? `http://127.0.0.1:8899/storage/${image_path}` : null, image_alt: it.title ?? '', image_focus: null,
      }));
      return { id: b.id, type: b.type, background: b.background, reveal: b.reveal ?? null, style: b.style ?? null, data: { ...b.data, items } };
    }
    // A hero's picture and its cover video (0.115.0) are paths as stored and URLs as presented.
    if (b.type === 'hero') {
      const { image_path, video_path, ...rest } = b.data ?? {};
      const url = (p) => (p ? `http://127.0.0.1:8899/storage/${p}` : null);
      return { id: b.id, type: b.type, background: b.background, reveal: b.reveal ?? null, style: b.style ?? null, data: {
        ...rest, image: url(image_path), image_alt: image_path ? (rest.heading ?? '') : null, image_focus: null,
        video: rest.layout === 'cover' ? url(video_path) : null,
      } };
    }
    if (b.type !== 'cards') return { id: b.id, type: b.type, background: b.background, reveal: b.reveal ?? null, data: b.data };
    const items = solutions.slice(0, b.data.limit || 6).map((s) => ({
      title: s.title, summary: s.summary ?? null, path: `/solutions/${s.slug}`,
      image: null, image_alt: null, image_focus: null, icon: s.icon ?? null, kicker: null, meta: null,
    }));
    return { id: b.id, type: b.type, background: b.background, reveal: b.reveal ?? null, data: { ...b.data, items, index_path: '/solutions' } };
  });
}
cmsPages.push({ id: 6, title: 'Sample builder page', slug: 'sample-builder-page', template: 'builder', body: null,
  published_at: '2026-09-26T09:00:00Z', updated_at: '2026-09-26T09:00:00Z', faqs: [], seo: null,
  blocks: SAMPLE_BUILDER_BLOCKS, sections: presentSections(SAMPLE_BUILDER_BLOCKS) });

const ADMIN_CMS = [
  { base: '/admin/solutions', rows: solutions, detail: (r) => adminOf(r, r.id === 1
    ? { problem_statement: solutionDetail.problem_statement, overview: solutionDetail.overview,
        benefits: solutionDetail.benefits, technologies: solutionDetail.technologies,
        hero_image_path: null, product_ids: [1], industry_ids: [4],
        faqs: solutionDetail.faqs.map(({ question, answer }) => ({ question, answer })),
        answer_blocks: SOLUTION_ANSWER_BLOCKS }
    : { problem_statement: null, overview: null, benefits: [], technologies: [], hero_image_path: null, product_ids: [], industry_ids: [] }) },
  { base: '/admin/services', rows: services, detail: (r) => adminOf(r, {
      body: null, service_category_id: r.category?.id ?? null, category_name: r.category?.name ?? null,
      image_path: r.image ? `media/services/${r.slug}.jpg` : null }) },
  { base: '/admin/service-categories', rows: serviceCategories, detail: adminServiceCategory },
  { base: '/admin/industries', rows: industries, detail: (r) => adminOf(r, { body: null, solution_ids: [] }) },
  { base: '/admin/product-categories', rows: productCategories, detail: (r) => adminOf(r, { image_path: null, parent_name: null }) },
  { base: '/admin/brands', rows: brands, detail: (r) => adminOf(r, { logo_path: null, is_featured: false, product_count: 1 }) },
  { base: '/admin/products', rows: products, detail: (r) => adminOf(r, {
      brand_id: r.brand?.id ?? null, brand_name: r.brand?.name ?? null,
      product_category_id: r.category?.id ?? null, category_name: r.category?.name ?? null,
      image_urls: [], datasheet_path: null, is_featured: false, solution_ids: [1], related_product_ids: [],
      faqs: (r.faqs || []).map(({ question, answer }) => ({ question, answer })) }) },
  { base: '/admin/pages', rows: cmsPages, detail: (r) => adminOf(r, { blocks: r.blocks ?? [], blocks_media: {}, sections: r.sections ?? [] }) },
  { base: '/admin/blog-posts', rows: posts, detail: (r) => adminOf(r, { cover_image_path: null, author_id: 3 }) },
  { base: '/admin/knowledge-articles', rows: kbArticles, detail: (r) => adminOf(r, { knowledge_category_id: 1, view_count: 0, helpful_count: 0 }) },
  { base: '/admin/store/categories', rows: storeCategories, detail: (r) => adminOf(r, { is_active: true, icon_path: null, image_path: null }) },
  { base: '/admin/store/products', rows: storeProducts, detail: (r) => adminOf(r, {
      store_category_id: r.category?.id ?? null, category_name: r.category?.name ?? null,
      brand_id: r.brand?.id ?? null, brand_name: r.brand?.name ?? null,
      track_stock: true, stock: r.in_stock ? 12 : 0, stock_on_hand: r.in_stock ? 12 : 0, allow_oversell: false,
      condition: 'new', feed_include: true, feed_problem: null, gtin: null, mpn: null, google_product_category: null, weight_grams: null,
      image_urls: [], activation_procedure: null, activation_pdf_path: null, activation_pdf_name: null,
      variations: (r.variations || []).map((v) => ({ ...v, stock: 4, allow_oversell: false, is_active: true, image_path: null })),
      /* Product AEO (contract \u00a73): the first product carries all three,
         the rest none, so both the filled and the blank state render. */
      warranty: r.id === 1 ? 'Limited lifetime hardware warranty' : null,
      applications: r.id === 1 ? 'Wiring closets and small server rooms that need VLANs without an enterprise licence.' : null,
      services: r.id === 1 ? [{ id: 1, title: 'Domain registration', slug: 'domains' }] : [],
      service_ids: r.id === 1 ? [1] : [] }) },
];

/* ---------------- Custom fields and content types (docs/custom-content.md) ----------------
 *
 * One field group on pages and on the sample type, and one type
 * ("open-days") with two entries — enough for every new console screen, the
 * Fields tab, the archive and an entry page to render against the mock. The
 * kinds, the targets and the placements are the API's own `meta`, never
 * retyped.
 *
 * The sample type was called "events" until 0.118.0, when `/events` became
 * the Events module's own route: a content type's slug is a top-level
 * address, the real API now refuses that one (`ReservedSlugs`), and here the
 * static route would have shadowed the archive and sent each entry's address
 * to an event that does not exist. */
const CUSTOM_FIELD_KINDS = [
  ['text', 'Text'], ['textarea', 'Long text'], ['rich_text', 'Rich text'], ['number', 'Number'], ['date', 'Date'],
  ['url', 'Link'], ['email', 'Email address'], ['select', 'Dropdown'], ['multi_select', 'Checkboxes'], ['boolean', 'Yes / no'],
  ['image', 'Image'], ['file', 'File'], ['relation', 'Linked record'], ['list', 'List of short items'],
].map(([value, label]) => ({ value, label, blurb: `${label}.`, has_options: value === 'select' || value === 'multi_select' }));
const CONTENT_TYPES = [{
  id: 1, name: 'Open day', plural: 'Open days', slug: 'open-days', path: '/open-days', icon: null,
  description: 'Open days, workshops and launches.', has_body: true, has_image: true, archive_enabled: true,
  per_page: 12, sort: 'newest', schema_type: 'Article', sort_order: 0, is_active: true,
  entries_count: 2, published_count: 2, target: 'entry:open-days', field_groups: [{ id: 1, name: 'Event details', fields_count: 2 }],
  created_at: '2026-09-26T00:00:00Z', updated_at: '2026-09-26T00:00:00Z',
}];
const CUSTOM_FIELD_TARGETS = [
  ['page', 'Pages'], ['blog_post', 'Blog posts'], ['knowledge_article', 'Knowledge base'], ['case_study', 'Case studies'],
  ['solution', 'Solutions'], ['service', 'Services'], ['industry', 'Industries'], ['product', 'Products'],
  ['store_product', 'Store products'], ['entry:open-days', 'Open days'],
].map(([value, label]) => ({ value, label }));
const CUSTOM_FIELD_META = {
  kinds: CUSTOM_FIELD_KINDS,
  targets: CUSTOM_FIELD_TARGETS,
  placements: [
    { value: 'details', label: 'Drawn on the page', blurb: 'A Details section after the body.' },
    { value: 'hidden', label: 'Data only', blurb: 'Not drawn; still in the public API.' },
  ],
};
const CUSTOM_FIELD_GROUP = {
  id: 1, name: 'Event details', slug: 'event-details', targets: ['entry:open-days', 'page'], target_labels: ['Open days', 'Pages'],
  placement: 'details', sort_order: 0, is_active: true, fields_count: 2,
  fields: [
    { id: 1, key: 'venue', label: 'Venue', kind: 'text', help: null, required: false, show_on_page: true, options: [], settings: {}, sort_order: 0, values_count: 2 },
    { id: 2, key: 'format', label: 'Format', kind: 'select', help: null, required: false, show_on_page: true,
      options: [{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }], settings: {}, sort_order: 1, values_count: 1 },
  ],
  created_at: '2026-09-26T00:00:00Z', updated_at: '2026-09-26T00:00:00Z',
};
/* The definitions a Fields tab draws: the group without its counts, with `choices`. */
const CUSTOM_FIELD_DEFINITIONS = [{
  id: 1, name: 'Event details', slug: 'event-details', placement: 'details',
  fields: CUSTOM_FIELD_GROUP.fields.map(({ sort_order, values_count, ...f }) => { void sort_order; void values_count; return { ...f, choices: [] }; }),
}];
const ENTRIES = [
  { id: 1, title: 'Open day at the Mumbai office', slug: 'open-day', summary: 'Walk the NOC, meet the engineers.',
    body: '<p>Doors open at ten. Bring questions.</p>', image: null, image_alt: null, image_focus: null,
    published_at: '2026-09-20T10:00:00+05:30', updated_at: '2026-09-20T10:00:00+05:30',
    custom_fields: [{ key: 'venue', label: 'Venue', kind: 'text', value: 'Andheri East', display: 'Andheri East' },
      { key: 'format', label: 'Format', kind: 'select', value: 'in_person', display: 'In person' }],
    custom_data: { venue: 'Andheri East', format: 'in_person' } },
  { id: 2, title: 'Firewall hardening workshop', slug: 'firewall-workshop', summary: 'Two hours on the rules that matter.',
    body: '<p>Online, with a recording afterwards.</p>', image: null, image_alt: null, image_focus: null,
    published_at: '2026-09-12T15:00:00+05:30', updated_at: '2026-09-12T15:00:00+05:30',
    custom_fields: [{ key: 'venue', label: 'Venue', kind: 'text', value: 'Online', display: 'Online' }],
    custom_data: { venue: 'Online' } },
];
const publicType = ({ name, plural, slug, path, icon, description, archive_enabled, per_page, sort, schema_type, updated_at }) =>
  ({ name, plural, slug, path, icon, description, archive_enabled, per_page, sort, schema_type, updated_at });
const publicEntry = (e, t = CONTENT_TYPES[0]) => ({
  ...e, path: `${t.path}/${e.slug}`,
  type: { name: t.name, plural: t.plural, slug: t.slug, path: t.path, icon: t.icon, archive_enabled: t.archive_enabled },
});
const adminEntry = (e) => ({
  id: e.id, content_type_id: 1, title: e.title, slug: e.slug, path: `/open-days/${e.slug}`, summary: e.summary, body: e.body,
  image_path: null, image: null, status: 'published', status_label: 'Published', published_at: e.published_at, sort_order: 0,
  faqs: [], answer_blocks: [], seo: null, seo_defaults: null,
  custom_fields: e.custom_data, custom_field_media: {}, custom_field_groups: CUSTOM_FIELD_DEFINITIONS,
  created_at: e.published_at, updated_at: e.updated_at,
});

/* The satisfaction survey a closed ticket sends (docs/tickets.md). One per
   ticket, created the first time it is closed; the token is 64 hex like the
   real one and never appears in an admin read. */
const surveys = [];
const SURVEY_RATINGS = [[1, 'Very Bad'], [2, 'Poor'], [3, 'Average'], [4, 'Good'], [5, 'Excellent']];
const ensureSurvey = (ref) => {
  let s = surveys.find((x) => x.reference === ref);
  if (!s) {
    s = { reference: ref, token: [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''), sent_at: new Date().toISOString(), rating: null, comment: null, answered_at: null };
    surveys.push(s);
  }
  return s;
};
const surveyLabel = (n) => (SURVEY_RATINGS.find(([v]) => v === n) || [])[1] ?? null;
const surveyPublic = (s) => {
  const t = tickets.find((x) => x.reference === s.reference);
  return {
    reference: s.reference, subject: t ? t.subject : '', answered: s.rating !== null, rating: s.rating,
    rating_label: surveyLabel(s.rating), comment: s.comment,
    ratings: SURVEY_RATINGS.map(([value, label]) => ({ value, label })), comment_max: 1000,
  };
};

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};


/* Careers. Two roles so the list groups by department, and the closed one is
   absent for the same reason the real endpoint drops it. */
const jobOpenings = [
  {
    id: 1, title: 'Network Engineer', slug: 'network-engineer', department: 'Field Operations',
    location: 'Mumbai', employment_type: 'full_time', employment_type_label: 'Full time',
    employment_type_schema: 'FULL_TIME', openings: 2,
    summary: 'Deploy and support customer networks across Mumbai.',
    description: '<p>You will own switch and firewall rollouts for our AMC customers.</p>',
    responsibilities: ['Rack and configure switches', 'Respond to escalations within SLA'],
    requirements: ['CCNA or equivalent', 'Own two-wheeler'],
    experience: { name: '3-5 years', range: '3-5 years', min_years: 3, max_years: 5 },
    qualifications: ['B.E. / B.Tech', 'Diploma in Engineering'],
    salary: { min: 600000, max: 900000, period: 'year', currency: 'INR', label: 'INR 600,000-900,000 a year' },
    published_at: '2026-08-01T09:00:00+00:00', closes_at: null, seo: null,
  },
  {
    id: 2, title: 'Support Desk Engineer', slug: 'support-desk-engineer', department: 'Support',
    location: 'Mumbai', employment_type: 'full_time', employment_type_label: 'Full time',
    employment_type_schema: 'FULL_TIME', openings: 1,
    summary: 'First response on the support desk.',
    description: '<p>You will be the first person a customer speaks to.</p>',
    responsibilities: ['Triage incoming tickets'], requirements: ['Clear written English'],
    experience: null, qualifications: [],
    /* Salary omitted entirely, not sent as nulls -- the frontend renders
       nothing at all for a role with no published band. */
    salary: null,
    published_at: '2026-08-10T09:00:00+00:00', closes_at: null, seo: null,
  },
];

/*
  Every public record carries `updated_at` — the sitemap's `lastmod` is the
  record's own last change since 2026-09-18, never the build time — so the
  fixtures each get one stamp. Laravel emits it beside `slug` on all eleven
  public resources.
*/
for (const rows of [solutions, services, industries, productCategories, products, posts, caseStudies, kbArticles, jobOpenings, storeProducts, storeCategories]) {
  for (const r of rows) r.updated_at ??= '2026-09-01T09:00:00Z';
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace('/api/v1', '');
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const auth = bearer === TOKEN || bearer === IMPERSONATION_TOKEN;
  const isStaff = bearer === STAFF_TOKEN;

  /*
   * Every picture this mock names is one pixel, served here.
   *
   * `/storage/` is the only path prefix `images.remotePatterns` admits on an
   * asset origin (`next.config.ts`, `assetPatterns()`), so a fixture's image
   * has to live under it — the store rail's icon used to be a URL under
   * `/mock/` that nothing answered, which `next/image` refused with
   * "hostname is not configured" and every store route 500'd against the
   * mock. And the optimiser has to get bytes back: a popup's `offer.jpg`
   * that 404'd here came out of `/_next/image` as a 401, which is what the
   * audit fails a route on. One 1x1 PNG answers for every path; the
   * optimiser reads the format from the bytes, not the extension.
   */
  if (url.pathname.startsWith('/storage/')) {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=3600' });
    return res.end(png);
  }

  if (p === '/auth/login' && req.method === 'POST') {
    if (req.headers['x-wishlist-token']) mergeWishlist(req.headers['x-wishlist-token']);
    return json(res, 200, { token: TOKEN, customer });
  }
  if (p === '/admin/auth/login' && req.method === 'POST') return json(res, 200, { token: STAFF_TOKEN, staff });

  /* Sign-in codes, both principals.

     `request-code` answers 202 with one sentence for every address, known or
     not, because the real one does — the whole point of that endpoint is that
     it cannot be used to find out who has an account, and a mock that was more
     helpful would have the frontend built against a leak.

     MOCK_SIGN_IN_CODE is what verify accepts. A fixed code rather than a
     random one so a browser walkthrough against the mock can be scripted;
     anything else is refused, so the wrong-code path is reachable too. */
  if (p === '/auth/request-code' && req.method === 'POST') {
    return json(res, 202, {
      message: 'If that address has an account, a sign-in code is on its way. It expires in 10 minutes.',
    });
  }
  if (p === '/admin/auth/request-code' && req.method === 'POST') {
    return json(res, 202, {
      message: 'If that address has a staff account, a sign-in code is on its way. It expires in 10 minutes.',
    });
  }
  if ((p === '/auth/verify-code' || p === '/admin/auth/verify-code') && req.method === 'POST') {
    const body = await readJsonBody(req);
    const admin = p.startsWith('/admin');

    if (String(body.code ?? '').replace(/\D/g, '') !== MOCK_SIGN_IN_CODE) {
      return json(res, 422, {
        message: 'That code is not valid any more. Ask for a new one.',
        errors: { code: ['That code is not valid any more. Ask for a new one.'] },
      });
    }

    return admin
      ? json(res, 200, { token: STAFF_TOKEN, staff })
      : json(res, 200, { token: TOKEN, customer });
  }
  /* Self-registration.

     The three endpoints answer identically whether or not an address is known,
     because the real ones do — a mock that returns "already registered" would
     have the frontend built against a leak the API refuses to have. */
  if (p === '/auth/register' && req.method === 'POST') {
    return json(res, 202, { message: 'Check your email — we have sent a link to confirm your address.' });
  }
  if (p === '/auth/verify-email' && req.method === 'POST') {
    const body = await readJsonBody(req);
    // `expired` is the one token this fixture refuses, so the failure path is
    // reachable without waiting 24 hours for a real one to lapse.
    if (!body.token || body.token === 'expired') {
      return json(res, 422, {
        message: 'That confirmation link is no longer valid. Ask for a new one.',
        errors: { token: ['That confirmation link is no longer valid. Ask for a new one.'] },
      });
    }
    return json(res, 200, {
      message: 'Your address is confirmed. A member of our team will activate your account shortly.',
      status: 'pending',
      already_verified: false,
    });
  }
  if (p === '/auth/resend-verification' && req.method === 'POST') {
    return json(res, 200, { message: 'If that address is waiting to be confirmed, a new link is on its way.' });
  }

  /* Programmatic landing pages.
     One published example rather than none: an empty list makes /brands and
     /locations render their empty states, which is a real path but not the one
     a build should be exercising. The shape is the contract -- notably that a
     catalogue page carries the products it is about, since that array is what
     separates one of these from a doorway page. */
  const landingPages = [
    {
      path: '/brands/cisco', kind: 'brand', title: 'Cisco Networking Hardware',
      heading: 'Cisco hardware we supply and support',
      brand: { name: 'Cisco', slug: 'cisco' }, location: null,
      updated_at: '2026-08-20T09:00:00+00:00',
    },
    /* A place, so a build against the mock renders the location branch of the
       landing page view -- the ancestors, the children and the work offered
       there -- rather than only the catalogue one. */
    {
      path: '/locations/kolkata', kind: 'location',
      title: 'IT Infrastructure Support in Kolkata',
      heading: 'What we do in Kolkata',
      brand: null,
      location: { name: 'Kolkata', slug: 'kolkata', state: 'West Bengal' },
      updated_at: '2026-08-24T09:00:00+00:00',
    },
  ];

  /* The place as the detail endpoint returns it: state derived from the tree,
     children and offered work sent so the page does not walk relations. */
  const kolkata = {
    name: 'Kolkata', slug: 'kolkata', level: 'city', country: 'India',
    full_name: 'Kolkata, West Bengal',
    office_address: null, response_time: 'Same-day on site, weekdays',
    summary: 'Mostly manufacturing and healthcare, where the network cannot be taken down during the day.',
    ancestors: [{ name: 'West Bengal', slug: 'west-bengal', level: 'state' }],
    children: [{ name: 'Salt Lake', slug: 'salt-lake', level: 'area' }],
    services: [{ title: 'Domain registration', slug: 'domains' }],
    solutions: [],
  };

  if (p === '/landing-pages') {
    const kind = url.searchParams.get('kind');
    return json(res, 200, { data: kind ? landingPages.filter((l) => l.kind === kind) : landingPages });
  }

  if (p === '/landing-pages/lookup') {
    const path = '/' + String(url.searchParams.get('path') ?? '').replace(/^\/+|\/+$/g, '');
    const summary = landingPages.find((l) => l.path === path);
    if (!summary) return json(res, 404, { message: 'Not found.' });

    return json(res, 200, { data: {
      ...summary,
      location: summary.kind === 'location' ? kolkata : null,
      intro: '<p>We have fitted Cisco switching in eleven buildings across the region in the last three years, so the spares we carry are the ones these sites actually fail on. Every unit below is one an engineer here has racked, configured and handed over.</p>',
      body: null,
      category: null, solution: null, service: null,
      products: summary.kind === 'location' ? [] : products.slice(0, 3),
      faqs: [],
      schema: prune({
        '@context': SCHEMA_ORG,
        '@type': summary.kind === 'location' ? 'LocalBusiness' : 'CollectionPage',
        name: summary.title, url: 'https://www.technoware.in' + summary.path,
        isPartOf: { '@type': 'WebSite', name: 'Technoware', url: 'https://www.technoware.in' },
        about: summary.brand ? { '@type': 'Brand', name: summary.brand.name } : null,
      }),
      seo: {
        title: summary.title,
        description: 'Cisco switching, routing and wireless supplied, configured and supported by the engineers who install it.',
        canonical_url: 'https://www.technoware.in' + summary.path,
        robots: 'index, follow', focus_keyword: null,
        // Always an array, never null — Laravel resolves an unset column to
        // `[]`, and a build against a mock that sent null would typecheck
        // against a shape production never produces.
        secondary_keywords: [],
        og_title: summary.title, og_description: null, og_image: null,
        schema_type: summary.kind === 'location' ? 'LocalBusiness' : 'CollectionPage', sitemap_include: true,
      },
    } });
  }

  /* Menus. A 404 is the *normal* answer here and the important one to mock:
     it means no menu is assigned, and the frontend falls back to the
     navigation built into the site. Returning an empty 200 instead would make
     a build against the mock render a header with no links in it, which is
     exactly the failure the 404 exists to prevent. */
  // Nothing assigned is `data: null` inside a 200 — a 404 is never cached by
  // Next, and this is fetched four times per layout render.
  if (p.startsWith('/menus/')) return json(res, 200, { data: null });

  /* The newsletter's public surface.
     `subscribe` answers 202 for everything, which is the contract: a new
     address, one already on the list and one that unsubscribed are
     indistinguishable, or the form becomes a membership oracle. A mock that
     varied by address would let that rule be broken here and only fail in
     production. */
  if (p === '/newsletter/subscribe' && req.method === 'POST') {
    return json(res, 202, { message: 'Thank you. If that address is not already on the list, you will hear from us soon.' });
  }
  {
    const sm = p.match(/^\/ticket-surveys\/([a-f0-9]{64})$/);
    if (p.startsWith('/ticket-surveys/') && !sm) return json(res, 404, { message: 'Not found.' });
    if (sm) {
      const sv = surveys.find((x) => x.token === sm[1]);
      if (!sv) return json(res, 404, { message: 'Not found.' });
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const rating = Number(body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return json(res, 422, { message: 'The rating field is invalid.', errors: { rating: ['The rating field is invalid.'] } });
        }
        const comment = String(body.comment ?? '').trim();
        if (comment.length > 1000) {
          return json(res, 422, { message: 'The comment field must not be greater than 1000 characters.', errors: { comment: ['The comment field must not be greater than 1000 characters.'] } });
        }
        sv.rating = rating;
        sv.comment = comment === '' ? null : comment;
        sv.answered_at = sv.answered_at ?? new Date().toISOString();
      }
      return json(res, 200, { data: surveyPublic(sv) });
    }
  }
  if (p.startsWith('/newsletter/unsubscribe/')) {
    return req.method === 'POST'
      ? json(res, 200, { data: { email: 'someone@example.test' }, message: 'You have been unsubscribed.' })
      : json(res, 200, { data: { email: 'someone@example.test', already: false } });
  }
  /* The way back from an unsubscribe (docs/newsletter.md, "Rejoining after an
     unsubscribe"). GET names the address, POST confirms; a real token is 64
     characters and anything else is the one neutral 404 every dead link gets. */
  if (p.startsWith('/newsletter/rejoin/')) {
    const token = decodeURIComponent(p.slice('/newsletter/rejoin/'.length));
    if (!/^[A-Za-z0-9]{64}$/.test(token)) return json(res, 404, { message: 'That link is no longer valid.' });
    return req.method === 'POST'
      ? json(res, 200, { data: { email: 'someone@example.test' }, message: 'You are back on the list. Thank you for coming back.' })
      : json(res, 200, { data: { email: 'someone@example.test', confirmed: false } });
  }

  if (p === '/ticket-categories') return json(res, 200, { data: categories });

  /* The public settings whitelist. Never implemented here, so a build against
     the mock rendered with no logo, no phone number and the default theme —
     getSiteSettings swallows the failure by design, which is why nothing ever
     complained. Values kept deliberately plain: this is a contract fixture,
     not a copy of anyone's real configuration.

     No logo_path here, so the text wordmark renders — which is a real state
     of the product and the reason this fixture leaves it out. If one is ever
     added, add `logo_width` and `logo_height` with it: Laravel sends all three
     together, and the header reserves its space from the last two. Sending the
     URL alone reintroduces the layout shift they exist to remove. Same for
     favicon_ and login_image_. */
  // Messaging: provider webhooks answer 200 always; the bell answers 202.
  if (p.startsWith('/messaging/webhooks/')) { res.writeHead(200); return res.end(); }
  if ((p === '/messaging/push/subscribe' || p === '/messaging/push/unsubscribe') && req.method === 'POST') {
    return json(res, 202, { message: p.endsWith('/subscribe') ? 'Notifications are on for this browser.' : 'Notifications are off for this browser.' });
  }

  if (p === '/settings') return json(res, 200, { data: {
    company_name: 'Technoware',
    tagline: 'Technology infrastructure that keeps your business connected.',
    // The `Organization` node's `knowsAbout` and `areaServed`, as two
    // JSON-encoded strings the frontend decodes (`docs/aeo-geo-samples.md`).
    organization_knows_about: JSON.stringify(solutions.map((s) => s.title)),
    organization_area_served: JSON.stringify(['Kolkata', 'Howrah']),
    phone: '+91 00000 00000',
    support_email: 'support@example.test',
    sales_email: 'sales@example.test',
    address: 'Address line one, Address line two',
    theme: 'olive',
    // Messaging (Phase 2): WhatsApp live, so the checkout draws its box;
    // push live with a mock web config, so the store strip draws the bell.
    messaging_whatsapp_live: '1', messaging_rcs_live: '0', push_live: '1',
    // Online meetings (docs/meetings-contract.md): the four public rows.
    meetings_enabled: '1', meeting_slot_step: '30', meeting_min_notice_hours: '4', meeting_max_days: '30',
    push_api_key: 'AIzaMockKey000000000000000000000000000', push_project_id: 'technoware-push',
    push_messaging_sender_id: '123456789012', push_app_id: '1:123456789012:web:0a1b2c3d4e5f', push_vapid_key: 'BMockVapidKey',
    motion_reveal: 'lift', motion_buttons: 'lift', motion_page: 'none', motion_loader: 'none', motion_splash: '0', motion_hero: 'grid', motion_progress: 'none',
    login_backdrop: 'image', login_intensity: 'medium', login_speed: 'normal', stats_animation: 'count',
    // The site theme. CI builds against this mock, and `classic` is also the
    // fallback for a missing key — so leaving it out would hide nothing and
    // prove nothing. It is here so the console's Themes screen has a row.
    site_theme: 'classic',
    // `homepage_page_slug` (0.113.0) is left out on purpose: the API sends it
    // only when Settings → Homepage names a published builder page, and absent
    // is the theme's own homepage, which is what CI should build and audit.
    // The homepage figures and the assistant's look, as the seeder ships them.
    stats_size: 'medium', chatbot_animation: 'burst', chatbot_background: '',
    reviews_kicker: 'Reviews', reviews_heading: 'What our customers say',
    store_shipping_service: 'Standard Shipping', store_transit_days_min: '3', store_transit_days_max: '7',
    // The announcement bar, live, as a gradient ticker with a link: the
    // hardest shape it takes, so every audit against the mock grades it.
    announcement_enabled: '1', announcement_live: '1',
    announcement_message: '<p><b>Prices slashed</b> across the switch range this month &mdash; <a href="/store">see the shop</a></p>',
    announcement_style: 'gradient', announcement_colour: '#12140d', announcement_colour_2: '#2f3a1f',
    announcement_mode: 'ticker', announcement_closable: '1',
    portal_enabled: '1',
    registration_enabled: '1',
    customer_approval_required: '0',
    // Sign-in codes are the default way in, both principals.
    otp_login_enabled: '1',
    otp_admin_login_enabled: '1',
    password_login_enabled: '1',
    cookie_consent_enabled: '1',
    cookie_consent_title: 'Cookies on this site',
    cookie_consent_message: 'We use analytics cookies to understand how visitors use this site.',
    cookie_consent_accept_label: 'Accept analytics',
    cookie_consent_decline_label: 'Decline',
    // The one key published from the otherwise-private newsletter group: the
    // footer needs to know whether to draw the signup form at all.
    newsletter_signup_enabled: '1',
    // On, with real copy, so the promo banner is exercised under the mock —
    // the real seeder defaults it off, which would leave it permanently
    // unauditable here otherwise.
    store_promo_enabled: '1',
    store_promo_kicker: 'Limited time',
    store_promo_heading: 'Save up to 15% on networking hardware',
    store_promo_price_text: 'From ₹2,199',
    store_promo_subheading: 'Switches, routers and access points, in stock and shipped this week.',
    store_promo_cta_label: 'Shop Now',
    store_promo_cta_href: '/store',
    store_promo_image_url: null,
    // The two tiles above the band: one on, one off, so `/store` shows the
    // lone-tile layout the component documents.
    store_tile_1_enabled: '1',
    store_tile_1_kicker: 'Networking',
    store_tile_1_heading: 'Switches from ₹4,990',
    store_tile_1_text: 'Managed and unmanaged, in stock.',
    store_tile_1_cta_label: 'Shop switches',
    store_tile_1_cta_href: '/store',
    store_tile_2_enabled: '0',
    store_tile_2_cta_label: 'Shop now',
    store_tile_2_cta_href: '/store',

    /* Page banners.
     *
     * Switched on with every picture null, which is the state a real install
     * ships in: the switch is on, nothing is uploaded, and every heading
     * renders on its flat ground exactly as it did before banners existed.
     * That is the case a build has to keep working, so it is the one the mock
     * describes — a URL here would make CI audit a layout no fresh install
     * has.
     *
     * Laravel drops null and empty values from this response, so a real
     * unconfigured install simply omits these keys; they are spelled out
     * because a mock that answers a shape and a mock that answers nothing are
     * different tests, and `bannerFor` has to give the same answer to both. */
    banner_enabled: '1',
    banner_default_url: null,
    banner_solutions_url: null,
    banner_products_url: null,
    banner_services_url: null,
    banner_industries_url: null,
    banner_store_url: null,
    banner_support_url: null,
    banner_resources_url: null,
    banner_company_url: null,
  } });

  // ---- staff / admin ----
  if (p.startsWith('/admin/')) {
    if (!isStaff) return json(res, 401, { message: 'Unauthenticated.' });

    if (p === '/admin/auth/me') return json(res, 200, { data: staff });

    /* Leads. `meta` is the contract that matters: the console builds its
       status, band and owner selects from it rather than listing them in
       TypeScript, so a mock that omitted them would render a screen with
       empty dropdowns and no error. Indented into the `/admin/` block — below
       it nothing is reachable, since that block answers every admin path. */
    /* Online meetings (docs/meetings-contract.md): the console's list,
       slots, detail and its moves, the types, the hosts and the Google
       panel. `meetings/google` and `meetings/slots` sit above the
       reference match, which is held to the reference's shape anyway. */
    if (p === '/admin/meetings/google' && req.method === 'GET') {
      return json(res, 200, { data: {
        is_connected: false, account: null, connected_at: null, client_configured: false, calendar_id: null,
        error: null, callback_path: '/admin/meetings/google/callback', synced_future_count: 0,
      } });
    }
    if (p === '/admin/meetings/google/authorize' && req.method === 'POST') {
      return json(res, 422, { message: 'Save the client ID and secret first.', errors: { redirect_uri: ['Save the client ID and secret first.'] } });
    }
    if (p === '/admin/meetings/google/callback' && req.method === 'POST') {
      return json(res, 200, { data: { account: 'meetings@technoware.test' } });
    }
    if (p === '/admin/meetings/google/disconnect' && req.method === 'POST') {
      return json(res, 200, { data: { is_connected: false, synced_future_count: 0 } });
    }
    if (p === '/admin/meetings/google/test' && req.method === 'POST') {
      return json(res, 422, { message: 'Connect a Google account first.', errors: { google: ['Connect a Google account first.'] } });
    }
    if (p === '/admin/meetings/customers' && req.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      if (q.length < 2) return json(res, 422, { message: 'The q field must be at least 2 characters.', errors: { q: ['The q field must be at least 2 characters.'] } });
      const rows = adminCustomers
        .filter((c) => [c.name, c.email, c.company].some((v) => (v ?? '').toLowerCase().includes(q)))
        .slice(0, 8)
        .map(({ id, name, email, company, phone, status, status_label }) => ({ id, name, email, company, phone, status, status_label }));
      return json(res, 200, { data: rows });
    }
    if (p === '/admin/meetings/slots' && req.method === 'GET' && url.searchParams.get('from') && url.searchParams.get('to')) {
      const type = meetingTypes.find((t) => t.slug === url.searchParams.get('type')) ?? meetingTypes[0];
      const days = [];
      for (let ymd = url.searchParams.get('from'); ymd <= url.searchParams.get('to'); ymd = new Date(Date.parse(`${ymd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
        days.push({ date: ymd, count: meetingSlotsFor(ymd, type.minutes).length });
      }
      return json(res, 200, { data: { type: type.slug, from: url.searchParams.get('from'), to: url.searchParams.get('to'), timezone: 'Asia/Kolkata', timezone_label: 'IST', days } });
    }
    if (p === '/admin/meetings/slots' && req.method === 'GET') {
      const type = meetingTypes.find((t) => t.slug === url.searchParams.get('type')) ?? meetingTypes[0];
      const date = url.searchParams.get('date') ?? isoDay(2);
      return json(res, 200, { data: {
        type: type.slug, date, timezone: 'Asia/Kolkata', timezone_label: 'IST',
        slots: meetingSlotsFor(date, type.minutes).map((sl) => ({ ...sl, hosts: [{ id: 1, name: 'Ada Admin' }] })),
      } });
    }
    if ((p === '/admin/meetings' || p === '/admin/my-meetings') && req.method === 'GET') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `trail` is left off the list read on purpose
      const rows = meetings.map(({ trail, ...m }) => m);
      return json(res, 200, {
        data: rows,
        meta: { ...meetingMeta, current_page: 1, last_page: 1, per_page: 20, total: rows.length },
        links: {},
      });
    }
    if (p === '/admin/meetings' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const type = meetingTypes.find((t) => t.slug === body.type) ?? meetingTypes[0];
      const m = { ...structuredClone(meetings[0]), id: meetings.length + 1, reference: `MT-2026-${String(meetings.length + 1).padStart(5, '0')}`,
        name: body.name ?? 'New contact', email: body.email ?? 'new@example.test', phone: body.phone ?? null, company: body.company ?? null,
        agenda: body.agenda ?? null, source: 'console', source_label: 'Console', meet_url: null, reschedule_count: -1,
        meeting_type: { id: type.id, name: type.name, slug: type.slug, minutes: type.minutes }, meeting_type_id: type.id, minutes: type.minutes,
        google: { status: 'pending', status_label: 'Waiting to sync', event_id: null, account: null, attempts: 0, error: null } };
      m.admin_path = `/admin/meetings/${m.reference}`;
      if (body.start) moveMeeting(m, body.start);
      m.reschedule_count = 0;
      meetings.push(m);
      return json(res, 201, { data: m });
    }
    const meetingMatch = p.match(/^\/admin\/(?:my-)?meetings\/([A-Z][A-Z0-9]{1,5}-\d{4}-\d{5})(\/move|\/cancel|\/resync)?$/);
    if (meetingMatch) {
      const m = meetingOf(meetingMatch[1]);
      if (!m) return json(res, 404, { message: 'Not found.' });
      const body = req.method === 'GET' ? {} : await readJsonBody(req);
      if (req.method === 'POST' && meetingMatch[2] === '/move') moveMeeting(m, body.start);
      else if (req.method === 'POST' && meetingMatch[2] === '/cancel') cancelMeeting(m, body.reason ?? null);
      else if (req.method === 'PATCH') {
        if ('staff_note' in body) m.staff_note = body.staff_note;
        if (body.status === 'completed' || body.status === 'no_show') {
          Object.assign(m, { status: body.status, status_label: body.status === 'completed' ? 'Completed' : 'No-show', is_open: false });
        }
      }
      return json(res, 200, { data: m });
    }
    if (p === '/admin/meeting-types' && req.method === 'GET') {
      return json(res, 200, { data: meetingTypes, meta: { eligible_hosts: [{ id: 1, name: 'Ada Admin' }] } });
    }
    if (p === '/admin/meeting-types' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.name) return json(res, 422, { message: 'Give it a name.', errors: { name: ['Give it a name.'] } });
      const t = {
        id: Math.max(0, ...meetingTypes.map((x) => x.id)) + 1, name: body.name,
        slug: body.slug || String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        description: body.description ?? null, minutes: body.minutes ?? 30, buffer_before: body.buffer_before ?? 0,
        buffer_after: body.buffer_after ?? 0, is_public: body.is_public !== false, is_active: body.is_active !== false,
        sort_order: body.sort_order ?? 0, host_ids: body.host_ids ?? [],
        hosts: (body.host_ids ?? []).map((id) => ({ id, name: 'Ada Admin', eligible: true })), meetings_count: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      meetingTypes.push(t);
      return json(res, 201, { data: t });
    }
    const meetingTypeMatch = p.match(/^\/admin\/meeting-types\/(\d+)$/);
    if (meetingTypeMatch) {
      const t = meetingTypes.find((x) => x.id === Number(meetingTypeMatch[1]));
      if (!t) return json(res, 404, { message: 'Not found.' });
      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        Object.assign(t, body, {
          hosts: (body.host_ids ?? t.host_ids).map((id) => ({ id, name: 'Ada Admin', eligible: true })),
          updated_at: new Date().toISOString(),
        });
      }
      if (req.method === 'DELETE') {
        if (t.meetings_count > 0) {
          return json(res, 422, { message: 'This type has meetings, so it cannot be deleted. Switch it off instead.', errors: { meeting_type: ['This type has meetings, so it cannot be deleted. Switch it off instead.'] } });
        }
        meetingTypes.splice(meetingTypes.indexOf(t), 1);
        return json(res, 204, {});
      }
      return json(res, 200, { data: t });
    }
    if (p === '/admin/meeting-hosts' && req.method === 'GET') {
      return json(res, 200, {
        data: meetingHosts,
        meta: { default_hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '10:00', end: '18:00' })), timezone: 'Asia/Kolkata', timezone_label: 'IST' },
      });
    }
    const meetingHostMatch = p.match(/^\/admin\/meeting-hosts\/(\d+)(\/hours|\/time-off(?:\/(\d+))?)?$/);
    if (meetingHostMatch) {
      const h = meetingHosts.find((x) => x.id === Number(meetingHostMatch[1]));
      if (!h) return json(res, 404, { message: 'Not found.' });
      if (req.method === 'PUT' && meetingHostMatch[2] === '/hours') {
        const body = await readJsonBody(req);
        h.hours = body.hours ?? [];
        h.uses_default_hours = h.hours.length === 0;
      } else if (req.method === 'POST' && meetingHostMatch[2] === '/time-off') {
        const body = await readJsonBody(req);
        if (!body.starts_at || !body.ends_at || body.ends_at <= body.starts_at) {
          return json(res, 422, { message: 'The end must be after the start.', errors: { ends_at: ['The end must be after the start.'] } });
        }
        h.time_off.push({ id: Date.now(), starts_at: `${body.starts_at}:00+05:30`, ends_at: `${body.ends_at}:00+05:30`, note: body.note ?? null,
          label: `${body.starts_at.replace('T', ' ')} – ${body.ends_at.replace('T', ' ')}` });
      } else if (req.method === 'DELETE' && meetingHostMatch[3]) {
        h.time_off = h.time_off.filter((t) => t.id !== Number(meetingHostMatch[3]));
        return json(res, 204, {});
      }
      return json(res, 200, { data: h });
    }
    /* Events (docs/events-contract.md): the list, the form's reads and
       writes, a duplicate, and one event's registrations. `meta` rides on the
       index, the read and both writes, because the console draws its format,
       status and registration-mode pickers from it and never from a list of
       its own. The export is matched above `{registration}`, the order the
       route file declares them in. */
    if (p === '/admin/events' && req.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const status = url.searchParams.get('status');
      const when = url.searchParams.get('when');
      const format = url.searchParams.get('format');
      const matched = events.filter((e) =>
        (!q || `${e.title} ${e.venue_name ?? ''} ${e.venue_city ?? ''}`.toLowerCase().includes(q))
        && (!status || e.status === status) && (!format || e.format === format)
        && (!when || (when === 'past') === eventIsPast(e)));
      // A header's sort, ending on the id; otherwise upcoming soonest first, then past newest first.
      const dir = url.searchParams.get('dir') === 'desc' ? -1 : 1;
      const by = { starts: (e) => e.starts_at, title: (e) => e.title.toLowerCase(), status: (e) => e.status }[url.searchParams.get('sort')];
      const rows = by
        ? [...matched].sort((a, b) => (by(a) < by(b) ? -dir : by(a) > by(b) ? dir : a.id - b.id))
        : [
            ...matched.filter((e) => !eventIsPast(e)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
            ...matched.filter(eventIsPast).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
          ];
      return json(res, 200, {
        data: rows.map((e) => adminEvent(e)),
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, per_page: 25, total: rows.length, ...EVENT_META },
      });
    }
    if (p === '/admin/events' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const blank = {
        title: '', summary: null, body: null, status: 'draft', is_featured: false, format: 'in_person',
        starts_at: null, ends_at: null, venue_name: null, venue_city: null, venue_address: null, map_url: null, online_url: null,
        cover_image_path: null, cover_image: null, speakers: [], agenda: [], registration_mode: 'none', external_url: null,
        capacity: null, waitlist_enabled: false, max_seats: 5, registration_closes_at: null, faqs: [], seo: null,
      };
      const refused = eventRefusal({ ...blank, ...body });
      if (refused) return invalid(res, ...refused);
      const now = new Date().toISOString();
      const event = { ...blank, id: Math.max(0, ...events.map((e) => e.id)) + 1, created_at: now, updated_at: now };
      applyEventBody(event, body);
      event.slug = freeEventSlug(eventSlug(body.slug || event.title));
      events.push(event);
      return json(res, 201, { data: adminEvent(event, true), meta: EVENT_META });
    }
    {
      const m = p.match(/^\/admin\/events\/(\d+)(\/duplicate)?$/);
      if (m) {
        const e = eventOf(m[1]);
        if (!e) return json(res, 404, { message: 'Not found.' });
        if (m[2]) {
          if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed.' });
          // A draft copy: "(copy)", a free slug, and none of the registrations.
          const now = new Date().toISOString();
          const copy = {
            ...structuredClone(e), id: Math.max(0, ...events.map((x) => x.id)) + 1, title: `${e.title} (copy)`,
            slug: freeEventSlug(`${e.slug}-copy`), status: 'draft', is_featured: false, created_at: now, updated_at: now,
          };
          events.push(copy);
          return json(res, 201, { data: adminEvent(copy, true), meta: EVENT_META });
        }
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const refused = eventRefusal(body, e);
          if (refused) return invalid(res, ...refused);
          applyEventBody(e, body);
          if ('slug' in body && body.slug) e.slug = freeEventSlug(eventSlug(body.slug), e.id);
          e.updated_at = new Date().toISOString();
        } else if (req.method === 'DELETE') {
          // Refused while anybody has registered — cancelled registrations included.
          if (eventRegistrations.some((r) => r.event_id === e.id)) {
            return invalid(res, 'event', 'People have registered for this event, so it cannot be deleted. Archive it instead.');
          }
          events.splice(events.indexOf(e), 1);
          return json(res, 200, { message: 'Event deleted.' });
        }
        return json(res, 200, { data: adminEvent(e, true), meta: EVENT_META });
      }
    }
    {
      const m = p.match(/^\/admin\/events\/(\d+)\/registrations(?:\/(export|\d+))?$/);
      if (m) {
        const e = eventOf(m[1]);
        if (!e) return json(res, 404, { message: 'Not found.' });
        const mine = () => eventRegistrations.filter((r) => r.event_id === e.id);

        if (m[2] === 'export') {
          // Every cell quoted; a leading =, +, - or @ is prefixed so a spreadsheet reads it as text.
          const cell = (value) => {
            const text = value === null || value === undefined ? '' : String(value);
            return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
          };
          const lines = [
            ['Name', 'Email', 'Phone', 'Company', 'Seats', 'Status', 'Note', 'Desk note', 'Source', 'Registered'],
            ...mine().map((r) => [r.name, r.email, r.phone, r.company, r.seats, eventLabelOf(EVENT_REGISTRATION_STATUSES, r.status), r.note, r.staff_note, r.source, r.created_at]),
          ];
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': `attachment; filename="${e.slug}-registrations.csv"` });
          return res.end(`﻿${lines.map((line) => line.map(cell).join(',')).join('\n')}\n`);
        }

        if (!m[2] && req.method === 'GET') {
          const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
          const status = url.searchParams.get('status');
          // Confirmed first, then waiting (oldest first), then the rest newest first.
          const rank = (r) => (r.status === 'confirmed' ? 0 : r.status === 'waitlisted' ? 1 : 2);
          const rows = mine()
            .filter((r) => (!status || r.status === status)
              && (!q || `${r.name} ${r.email} ${r.company ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(q)))
            .sort((a, b) => rank(a) - rank(b)
              || (rank(a) === 2 ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
          return json(res, 200, {
            data: rows.map(adminRegistration),
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, last_page: 1, per_page: 50, total: rows.length, ...registrationsMeta(e) },
          });
        }

        if (!m[2] && req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body.name) return invalid(res, 'name', 'The name field is required.');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email ?? '')) return invalid(res, 'email', 'Enter a valid email address.');
          const seats = Number(body.seats) || 1;
          const left = eventCounts(e).seats_left;
          let status = 'confirmed';
          if (!body.force && left !== null && seats > left) {
            // Staff are refused exactly as the public are, unless they ask to go past the limit.
            if (e.waitlist_enabled) status = 'waitlisted';
            else return left === 0
              ? invalid(res, 'registration', 'This event is full. Tick “Go past the limit” to add them anyway.')
              : invalid(res, 'seats', `Only ${left} ${left === 1 ? 'seat is' : 'seats are'} left.`);
          }
          const r = {
            id: Math.max(30, ...eventRegistrations.map((x) => x.id)) + 1, event_id: e.id, name: body.name, email: body.email,
            phone: body.phone ?? null, company: body.company ?? null, seats, note: body.note ?? null, staff_note: null, status,
            customer_id: null, lead_id: 1, source: 'staff', reminded_at: null, cancelled_at: null, created_at: new Date().toISOString(),
          };
          eventRegistrations.push(r);
          return json(res, 201, { data: adminRegistration(r), meta: registrationsMeta(e) });
        }

        const r = eventRegistrations.find((x) => x.id === Number(m[2]) && x.event_id === e.id);
        // A registration addressed through another event's id is a 404.
        if (!r) return json(res, 404, { message: 'Not found.' });

        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          const label = (value) => eventLabelOf(EVENT_REGISTRATION_STATUSES, value);
          const only = (n) => `Only ${n} ${n === 1 ? 'seat is' : 'seats are'} left.`;
          if ('staff_note' in body) r.staff_note = body.staff_note;
          if ('seats' in body && body.seats !== r.seats) {
            if (!Number.isInteger(body.seats) || body.seats < 1) return invalid(res, 'seats', 'The seats field must be at least 1.');
            // A confirmed party growing is held to the room unless `force`.
            const left = eventCounts(e).seats_left;
            const room = left === null ? null : left + r.seats;
            if (r.status === 'confirmed' && !body.force && room !== null && body.seats > room) return invalid(res, 'seats', only(room));
            r.seats = body.seats;
          }
          if ('status' in body && body.status !== r.status) {
            if (!EVENT_REGISTRATION_STATUSES.some((s) => s.value === body.status)) return invalid(res, 'status', 'The selected status is invalid.');
            if (!REGISTRATION_MOVES[r.status].includes(body.status)) {
              return invalid(res, 'status', `A registration cannot go from ${label(r.status)} to ${label(body.status)}.`);
            }
            if ((body.status === 'attended' || body.status === 'no_show') && !eventHasStarted(e)) {
              return invalid(res, 'status', `A registration can be marked ${label(body.status)} only once the event has started.`);
            }
            // Taking seats that were not held: is there room? The desk may overbook, but only by saying so.
            const left = eventCounts(e).seats_left;
            const takes = body.status === 'confirmed' && (r.status === 'waitlisted' || r.status === 'cancelled');
            if (takes && !body.force && left !== null && r.seats > left) {
              return invalid(res, 'status', `${only(left)} This registration is for ${r.seats} ${r.seats === 1 ? 'seat' : 'seats'} — raise the capacity or reduce the seats first.`);
            }
            r.status = body.status;
            r.cancelled_at = body.status === 'cancelled' ? new Date().toISOString() : r.cancelled_at;
          }
          return json(res, 200, { data: adminRegistration(r), meta: registrationsMeta(e) });
        }
        if (req.method === 'DELETE') {
          eventRegistrations.splice(eventRegistrations.indexOf(r), 1);
          return json(res, 204, {});
        }
        return json(res, 405, { message: 'Method not allowed.' });
      }
    }
    if (p === '/admin/visits' && req.method === 'GET') {
      return json(res, 200, {
        data: visitRequests,
        meta: { ...visitMeta, current_page: 1, last_page: 1, per_page: 20, total: visitRequests.length },
        links: {},
      });
    }
    const av = p.match(/^\/admin\/visits\/([\w-]+)(\/confirm)?$/);
    if (av) {
      const v = visitRequests.find((x) => x.reference === av[1]);
      if (!v) return json(res, 404, { message: 'Not found.' });
      if (req.method === 'POST' && av[2]) {
        const body = await readJsonBody(req);
        Object.assign(v, {
          status: 'confirmed', status_label: 'Confirmed', scheduled_start_at: `${body.start_at}:00+05:30`,
          visit_date: body.start_at?.slice(0, 10) ?? '', visit_time: body.start_at?.slice(11, 16) ?? '',
          allowed_next: [{ value: 'confirmed', label: 'Confirmed' }, { value: 'requested', label: 'Requested' }, { value: 'completed', label: 'Completed' }, { value: 'no_show', label: 'No-show' }, { value: 'cancelled', label: 'Cancelled' }],
        });
      } else if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        if (body.status === 'confirmed' && v.status !== 'confirmed') {
          return json(res, 422, { message: 'Set a time to confirm it.', errors: { status: ['A visit cannot go from Requested to Confirmed here — set a time to confirm it.'] } });
        }
        if ('staff_note' in body) v.staff_note = body.staff_note;
      }
      return json(res, 200, { data: v });
    }
    if (p === '/admin/leads' && req.method === 'GET') {
      return json(res, 200, {
        data: leads,
        meta: { ...leadMeta, current_page: 1, last_page: 1, per_page: 20, total: leads.length },
        links: {},
      });
    }
    /* The store's catalogue as a spreadsheet, both ways. The export is one
       product and its variation in the columns the import reads back; the
       dry run answers the shape the wizard maps against, and the commit the
       summary its done screen draws. Answered from a fixture rather than by
       reading the upload: the mock is a contract. */
    if (p === '/admin/store/products/export') {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': 'attachment; filename="technoware-store-catalogue-2026-09-20.csv"' });
      return res.end('\uFEFFsku,parent_sku,name,slug,type,category,brand,price,compare_at,stock,track_stock,allow_oversell,gtin,mpn,condition,weight_grams,status,feed_include,short_description\n'
        + 'SW-24,,"Cisco CBS350-24T-4G",cisco-cbs350-24t-4g,physical,switches,cisco,11800.00,,12,1,0,,,new,,published,1,"24-port managed switch"\n'
        + 'SW-24-POE,SW-24,"PoE model",,,,,14160.00,,4,,0,,,,,,,\n');
    }
    if (p === '/admin/store/products/import/analyse' && req.method === 'POST') {
      return json(res, 200, { data: {
        file: 'store-imports/mock.csv', original_name: 'catalogue.csv',
        headers: ['sku', 'parent_sku', 'name', 'price', 'stock', 'category'],
        fields: ['sku', 'parent_sku', 'name', 'slug', 'type', 'category', 'brand', 'price', 'compare_at', 'stock', 'track_stock', 'allow_oversell', 'gtin', 'mpn', 'condition', 'weight_grams', 'status', 'feed_include', 'short_description'],
        mapping: { sku: 0, parent_sku: 1, name: 2, slug: null, type: null, category: 5, brand: null, price: 3, compare_at: null, stock: 4, track_stock: null, allow_oversell: null, gtin: null, mpn: null, condition: null, weight_grams: null, status: null, feed_include: null, short_description: null },
        counts: { total: 3, create: 1, update_product: 1, update_variation: 0, invalid: 1 },
        problems: [{ line: 4, sku: 'SW-BAD', outcome: 'invalid', reason: 'No store category has the slug "swtiches".' }],
        preview: [
          { line: 2, outcome: 'update_product', sku: 'SW-24', parent_sku: null, name: null, price: '11800.00', stock: '12', category: null },
          { line: 3, outcome: 'create', sku: 'SW-48', parent_sku: null, name: '48-port switch', price: '23600.00', stock: '3', category: 'switches' },
          { line: 4, outcome: 'invalid', sku: 'SW-BAD', parent_sku: null, name: 'Mis-shelved', price: '10.00', stock: null, category: 'swtiches' },
        ],
      } });
    }
    if (p === '/admin/store/products/import' && req.method === 'POST') {
      return json(res, 201, { data: {
        id: 1, status: 'completed', filename: 'catalogue.csv',
        mapping: { sku: 0, parent_sku: 1, name: 2, price: 3, stock: 4, category: 5 },
        counts: { total: 3, create: 1, update_product: 1, update_variation: 0, invalid: 1 },
        problems: [{ line: 4, sku: 'SW-BAD', outcome: 'invalid', reason: 'No store category has the slug "swtiches".' }],
        created_at: '2026-09-20T10:00:00+05:30',
      } });
    }
    if (p === '/admin/leads/export') {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      return res.end('Received,Name,Email\n2026-09-01 09:12:00,Rahul Sen,rahul@meridianfoods.in\n');
    }
    if (p.startsWith('/admin/leads/') && p.endsWith('/notes') && req.method === 'POST') {
      return json(res, 201, { message: 'Note added.' });
    }
    if (p.startsWith('/admin/leads/')) {
      const lead = leads.find(l => String(l.id) === p.split('/')[3]);
      if (!lead) return json(res, 404, { message: 'Not found.' });
      if (req.method === 'DELETE') return json(res, 200, { message: 'Lead deleted.' });
      // The meeting a `meeting` lead came from (docs/meetings-contract.md), else null.
      const fromMeeting = meetings.find((m) => m.lead_id === lead.id);
      return json(res, 200, { data: { ...lead, meeting: fromMeeting ? { reference: fromMeeting.reference, admin_path: fromMeeting.admin_path } : null } });
    }

    /* Editor-built forms (0.117.0). `meta` is on the index as well as on every
       read of one form, because the console's *new* screen has no record to
       read the builder's vocabulary from. The three submission routes are
       matched before the form's own, the order the API declares them in:
       `export` would otherwise be read as a submission id. */
    if (p === '/admin/forms' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = forms.filter((f) => !q || f.name.toLowerCase().includes(q)).map((f) => adminForm(f, false));
      return json(res, 200, {
        data: rows,
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, per_page: 25, total: rows.length, ...FORM_META },
      });
    }
    if (p === '/admin/forms' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.name) return json(res, 422, { message: 'The name field is required.', errors: { name: ['The name field is required.'] } });
      const form = {
        id: Math.max(0, ...forms.map((f) => f.id)) + 1,
        name: body.name, slug: body.slug || String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        status: body.status ?? 'published', submit_label: body.submit_label ?? 'Send',
        success_message: body.success_message ?? null, redirect_url: body.redirect_url ?? null,
        notify_email: body.notify_email ?? null, embed_enabled: Boolean(body.embed_enabled),
        fields: storeFormFields(Array.isArray(body.fields) ? body.fields : []),
      };
      forms.push(form);
      return json(res, 201, { data: adminForm(form), meta: FORM_META });
    }
    {
      const m = p.match(/^\/admin\/forms\/(\d+)(?:\/(.+))?$/);
      if (m) {
        const form = forms.find((f) => f.id === Number(m[1]));
        if (!form) return json(res, 404, { message: 'Not found.' });
        const rest = m[2] ?? '';
        const mine = formSubmissions.filter((s) => s.form_id === form.id);

        if (rest === 'submissions' && req.method === 'GET') {
          return json(res, 200, {
            data: mine,
            links: { first: null, last: null, prev: null, next: null },
            meta: { current_page: 1, last_page: 1, per_page: 25, total: mine.length },
          });
        }
        // One column per field that has an answer — a hidden value included — between when it arrived and where from.
        if (rest === 'submissions/export' && req.method === 'GET') {
          const asked = form.fields.filter((f) => !FORM_LAYOUT_KINDS.includes(f.kind));
          const cell = (v) => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
          const lines = [
            ['Submitted at', ...asked.map((f) => f.label), 'Source page', 'IP'].map(cell).join(','),
            ...mine.map((s) => [s.created_at, ...asked.map((f) => s.data[f.name]), '', s.ip_address].map(cell).join(',')),
          ];
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': `attachment; filename="form-${form.slug}-2026-10-06.csv"` });
          return res.end(`${String.fromCharCode(0xFEFF)}${lines.join('\n')}\n`);
        }
        // The mock holds no uploads: every file is the 404 a missing one gets.
        if (/^submissions\/\d+\/files\/[a-z][a-z0-9_]*$/.test(rest) && req.method === 'GET') {
          return json(res, 404, { message: 'Not found.' });
        }
        {
          const sm = rest.match(/^submissions\/(\d+)$/);
          if (sm && req.method === 'DELETE') {
            const at = formSubmissions.findIndex((s) => s.form_id === form.id && s.id === Number(sm[1]));
            // A submission of another form is a 404: the id in the URL is a number anybody can change.
            if (at === -1) return json(res, 404, { message: 'Not found.' });
            formSubmissions.splice(at, 1);
            res.writeHead(204);
            return res.end();
          }
        }
        if (rest === '' && req.method === 'GET') return json(res, 200, { data: adminForm(form), meta: FORM_META });
        if (rest === '' && req.method === 'PATCH') {
          const body = await readJsonBody(req);
          for (const key of ['name', 'slug', 'status', 'submit_label', 'success_message', 'redirect_url', 'notify_email']) {
            if (key in body && (body[key] !== undefined)) form[key] = body[key];
          }
          if ('embed_enabled' in body) form.embed_enabled = Boolean(body.embed_enabled);
          // Replaced wholesale when sent; an absent key leaves the fields alone.
          if (Array.isArray(body.fields)) form.fields = storeFormFields(body.fields);
          return json(res, 200, { data: adminForm(form), meta: FORM_META });
        }
        if (rest === '' && req.method === 'DELETE') {
          // Submissions outlive their form: `form_id` goes null and the slug stays.
          for (const s of mine) s.form_id = null;
          forms.splice(forms.indexOf(form), 1);
          res.writeHead(204);
          return res.end();
        }
        return json(res, 404, { message: 'Not found.' });
      }
    }

    /* Menus. `meta` is the contract that matters: the console builds its
       location picker and its kind dropdown from these rather than listing
       them in TypeScript, so a mock that omitted them would render a screen
       with two empty selects and no error. */
    if (p === '/admin/menu-targets') return json(res, 200, { data: [] });
    if (p === '/admin/menus') return json(res, 200, {
      data: [],
      meta: {
        /* All four, in the enum's own order — page order, top to bottom. The
           two bars render one level, which is what `depth: 1` says: the
           console draws these as cards an editor reads down, so a mock short
           of two of them is a screen that cannot reach half the feature. */
        locations: [
          { value: 'topbar', label: 'Top bar', hint: 'The strip above the header. A flat list.', depth: 1 },
          { value: 'primary', label: 'Main navigation', hint: 'The header.', depth: 3 },
          { value: 'footer', label: 'Footer', hint: 'The footer.', depth: 3 },
          { value: 'bottom', label: 'Footer bottom bar', hint: 'The policy row. A flat list.', depth: 1 },
        ],
        types: [
          { value: 'custom', label: 'Custom link', needs_record: false },
          { value: 'page', label: 'Page', needs_record: true },
          { value: 'solution', label: 'Solution', needs_record: true },
          { value: 'section', label: 'Site section', needs_record: false },
          { value: 'catalogue', label: 'Live list', needs_record: false },
        ],
        sections: [{ value: 'about', label: 'About', path: '/about' }],
        // The live lists a `catalogue` item may show, as the API sends them.
        catalogues: [
          { value: 'solutions', label: 'Solutions', path: '/solutions' },
          { value: 'services', label: 'Services', path: '/services' },
          { value: 'industries', label: 'Industries', path: '/industries' },
          { value: 'product_categories', label: 'Product categories', path: '/products' },
        ],
        // A decision about navigation, not a gap in the code: every renderer
        // walks the whole tree, so this is where a fourth level is refused.
        max_depth: 3,
      },
    });

    /* Settings, and outgoing mail.
       Neither was ever implemented here, so a build against the mock rendered
       the Settings screen against a 404 -- the same gap that left the public
       /settings whitelist unimplemented for months. The shapes below are the
       contract, not anyone's configuration: a secret is `value: null` with
       `is_set`, exactly as the real API returns it, because the form's
       "blank means unchanged" rule is built on that and a mock that sent a
       plain string would let it be got wrong here and only fail in production. */
    /* The AI SEO assistant.
     *
     * Mocked as **switched on** since 2026-09-21 (it was off, as a fresh
     * install ships): the AEO tab's panel and its Apply path — draft
     * blocks into the repeater, FAQ rows, the `[MISSING: …]` marker — are
     * console code that has to be exercisable without a key, and a panel
     * that renders nothing exercises none of it. The eight AEO/GEO actions
     * answer canned results in their exact shapes (`SEO_AI_CANNED`, below
     * the ai handlers); the seven SEO actions still answer 422, because a
     * language model has no honest mock and a canned title would make a
     * build pass while proving nothing about the part that can fail. */
    /* The SEO overview and the store dashboard, in the shapes Laravel sends
     * them — with Search Console and Google Analytics both **unconfigured**,
     * which is a fresh install's state: `search` and `analytics` are null on
     * every row, `meta.search`/`meta.analytics` say so, and the dashboard's
     * `funnel.product_views`/`views_to_orders` are null rather than zero
     * because nothing has been measured. A mock that answered figures would
     * be describing an integration no build has connected. */
    /* The single-record score the AEO/GEO panel and the overview's Recheck
       read. `aeo`/`geo` carry `failed` here and only here; a record the
       fixture has not scored answers without them, which the panel draws as
       "Not scored yet". Matched by shape, and `ai` excluded, so
       `/admin/seo/ai/...` cannot bind here. */
    {
      const m = p.match(/^\/admin\/seo\/([a-z_]+)\/(\d+)$/);
      if (m && m[1] !== 'ai' && req.method === 'GET') {
        const type = m[1]; const id = Number(m[2]);
        const s = solutions.find((x) => x.id === id);
        if (type !== 'solution' || !s) return json(res, 404, { message: 'Not found.' });
        const aeo = readiness(AEO_SCORES, type, id, true);
        const geo = readiness(GEO_SCORES, type, id, true);
        return json(res, 200, { data: {
          type, type_label: 'Solutions', id, name: s.title, slug: s.slug,
          admin_path: `/admin/solutions/${id}`, url: `https://www.technoware.in/solutions/${s.slug}`,
          public_path: `/solutions/${s.slug}`, title: `${s.title} | Technoware`, description: s.summary || null,
          focus_keyword: null, has_override: false, overridden: [], sitemap_include: true, issues: [],
          score: { value: 80, band: 'good', passed: 8, checked: 10, failed: [] },
          ai_pending: 0, search: null, analytics: null,
          ...(aeo ? { aeo } : {}), ...(geo ? { geo } : {}),
        } });
      }
    }

    /* The page builder's pickers and its unsaved-draft preview (docs/page-builder.md). */
    if (p === '/admin/pages/builder' && req.method === 'GET') {
      return json(res, 200, { data: { ...BUILDER_OPTIONS, library: {
        sections: savedSections.filter((x) => x.kind === 'section').map(({ id, name, blocks }) => ({ id, name, type: blocks[0]?.type ?? null })),
        templates: savedSections.filter((x) => x.kind === 'template').map(({ id, name, description, blocks }) => ({ id, name, description, count: blocks.length })),
      } } });
    }

    /* The section library and page templates (docs/page-builder.md "The library"). */
    if (p === '/admin/saved-sections' && req.method === 'GET') {
      const kind = url.searchParams.get('kind');
      const rows = savedSections.filter((x) => !kind || x.kind === kind).map((x) => savedResource(x, false));
      return json(res, 200, { data: rows, meta: { current_page: 1, last_page: 1, per_page: 100, total: rows.length }, links: {} });
    }
    if (p === '/admin/saved-sections' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const blocks = Array.isArray(body.blocks) ? body.blocks : [];
      if (!body.name || !['section', 'template'].includes(body.kind) || !blocks.length || (body.kind === 'section' && blocks.length !== 1)) {
        return json(res, 422, { message: 'Check the library item.', errors: { blocks: ['A section is one section; a template is one or more.'] } });
      }
      const item = { id: savedSections.length ? Math.max(...savedSections.map((x) => x.id)) + 1 : 1, kind: body.kind, name: body.name, description: body.description ?? null, blocks, updated_at: new Date().toISOString() };
      savedSections.push(item);
      return json(res, 201, { data: savedResource(item, true) });
    }
    {
      const m = p.match(/^\/admin\/saved-sections\/(\d+)$/);
      if (m) {
        const item = savedSections.find((x) => x.id === Number(m[1]));
        if (!item) return json(res, 404, { message: 'Not found.' });
        if (req.method === 'GET') return json(res, 200, { data: savedResource(item, true) });
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          for (const k of ['name', 'description', 'blocks']) if (k in body) item[k] = body[k];
          item.updated_at = new Date().toISOString();
          return json(res, 200, { data: savedResource(item, true) });
        }
        if (req.method === 'DELETE') { savedSections.splice(savedSections.indexOf(item), 1); res.writeHead(204); return res.end(); }
      }
    }
    // The assistant on a section (0.127.0): refused, as it is with no key.
    if (p === '/admin/pages/ai-section' && req.method === 'POST') {
      return json(res, 422, { message: AI_DRAFT_OFF, errors: { section: [AI_DRAFT_OFF] } });
    }
    if (p === '/admin/pages/preview' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const blocks = Array.isArray(body.blocks) ? body.blocks : [];
      const bad = blocks.findIndex((b) => !SECTION_TYPES.some((t) => t.value === b.type));
      if (bad !== -1) return json(res, 422, { message: 'That is not a kind of section this site can draw.', errors: { [`blocks.${bad}.type`]: ['That is not a kind of section this site can draw.'] } });
      return json(res, 200, { data: { sections: presentSections(blocks) } });
    }
    // The AI page builder (0.116.0): refused exactly as the API refuses while the assistant is off.
    if (p === '/admin/pages/ai-draft' && req.method === 'POST') {
      await readJsonBody(req);
      return json(res, 422, { message: AI_DRAFT_OFF, errors: { brief: [AI_DRAFT_OFF] } });
    }
    // A page body laid out as sections, split at its <h2>s (BodySections, 0.109.0). Writes nothing.
    if (p === '/admin/pages/sections-from-body' && req.method === 'POST') {
      const body = String((await readJsonBody(req)).body ?? '').replace(/<script[\s\S]*?<\/script>/gi, '');
      if (!body.replace(/<[^>]*>/g, '').trim()) return json(res, 422, { message: 'This page has no content to lay out yet.', errors: { body: ['This page has no content to lay out yet.'] } });
      const parts = body.split(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const sections = [];
      const add = (heading, html) => {
        if (!html.replace(/<[^>]*>/g, '').trim()) return;
        sections.push({ id: crypto.randomUUID(), type: 'rich_text', hidden: false, background: null, reveal: null, style: null, data: heading ? { heading, body: html } : { body: html } });
      };
      add(null, parts[0]);
      for (let i = 1; i < parts.length; i += 2) add(parts[i].replace(/<[^>]*>/g, '').trim(), parts[i + 1] ?? '');
      return json(res, 200, { data: { sections } });
    }

    /* Custom field groups. */
    if (p === '/admin/custom-field-groups' && req.method === 'GET') {
      const page = paginate([CUSTOM_FIELD_GROUP].map(({ fields, ...g }) => { void fields; return g; }));
      Object.assign(page.meta, CUSTOM_FIELD_META);
      return json(res, 200, page);
    }
    if (p === '/admin/custom-field-groups' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 201, { data: { ...CUSTOM_FIELD_GROUP, ...body, id: 2 }, meta: CUSTOM_FIELD_META });
    }
    {
      const m = p.match(/^\/admin\/custom-field-groups\/(\d+)$/);
      if (m) {
        if (Number(m[1]) !== 1) return json(res, 404, { message: 'Not found.' });
        if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
        const body = req.method === 'PATCH' ? await readJsonBody(req) : {};
        return json(res, 200, { data: { ...CUSTOM_FIELD_GROUP, ...body }, meta: CUSTOM_FIELD_META });
      }
    }

    /* Content types and their entries. */
    const TYPE_META = {
      sorts: [{ value: 'newest', label: 'Newest first' }, { value: 'title', label: 'By title' }, { value: 'manual', label: 'By sort order' }],
      schema_types: [{ value: 'Article', label: 'Article' }, { value: 'WebPage', label: 'Web page' }],
    };
    if (p === '/admin/content-types' && req.method === 'GET') {
      const page = paginate(CONTENT_TYPES);
      Object.assign(page.meta, TYPE_META);
      return json(res, 200, page);
    }
    if (p === '/admin/content-types' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 201, { data: { ...CONTENT_TYPES[0], ...body, id: 2, path: `/${body.slug}` }, meta: TYPE_META });
    }
    {
      const m = p.match(/^\/admin\/content-types\/(\d+)$/);
      if (m) {
        if (Number(m[1]) !== 1) return json(res, 404, { message: 'Not found.' });
        if (req.method === 'DELETE') return json(res, 422, { message: 'This type still holds 2 entries.', errors: { content_type: ['Delete its entries first.'] } });
        const body = req.method === 'PATCH' ? await readJsonBody(req) : {};
        return json(res, 200, { data: { ...CONTENT_TYPES[0], ...body }, meta: TYPE_META });
      }
    }
    {
      const m = p.match(/^\/admin\/content-types\/([a-z0-9-]+)\/entries(?:\/(\d+))?$/);
      if (m) {
        if (m[1] !== CONTENT_TYPES[0].slug) return json(res, 404, { message: 'Not found.' });
        if (!m[2] && req.method === 'GET') {
          const page = paginate(ENTRIES.map(adminEntry));
          Object.assign(page.meta, {
            type: CONTENT_TYPES[0],
            statuses: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }],
            answer_block_kinds: ANSWER_BLOCK_KINDS,
            custom_field_groups: CUSTOM_FIELD_DEFINITIONS,
          });
          return json(res, 200, page);
        }
        if (!m[2] && req.method === 'POST') {
          const body = await readJsonBody(req);
          return json(res, 201, { data: { ...adminEntry(ENTRIES[0]), ...body, id: 3 } });
        }
        const e = ENTRIES.find((x) => x.id === Number(m[2]));
        if (!e) return json(res, 404, { message: 'Not found.' });
        if (req.method === 'DELETE') return json(res, 200, { message: 'Entry deleted.' });
        const body = req.method === 'PATCH' ? await readJsonBody(req) : {};
        return json(res, 200, { data: { ...adminEntry(e), ...body } });
      }
    }

    /* The admin CMS indexes and details, from `ADMIN_CMS`. */
    for (const entity of ADMIN_CMS) {
      if (p === entity.base && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        let rows = q ? entity.rows.filter((r) => `${r.title || r.name || ''} ${r.slug || ''}`.toLowerCase().includes(q)) : entity.rows;
        /* `/admin/services?category=<id|none>` and `/admin/service-categories?active=0|1`. */
        const cat = entity.base === '/admin/services' ? url.searchParams.get('category') : null;
        if (cat) rows = rows.filter((r) => (cat === 'none' ? !r.category : r.category?.id === Number(cat)));
        const active = entity.base === '/admin/service-categories' ? url.searchParams.get('active') : null;
        if (active === '0' || active === '1') rows = rows.filter((r) => r.is_active === (active === '1'));
        /* `?sort=title|category|status|order|updated&dir=` on services; uncategorised last when ascending by category. */
        const sortKey = entity.base === '/admin/services' ? url.searchParams.get('sort') : null;
        if (sortKey) {
          const dir = url.searchParams.get('dir') === 'desc' ? -1 : 1;
          const key = {
            title: (r) => r.title, status: () => 'published', order: (r) => r.sort_order ?? 0, updated: (r) => r.updated_at ?? '',
            category: (r) => (r.category ? serviceCategories.find((c) => c.id === r.category.id)?.sort_order ?? 0 : Number.MAX_SAFE_INTEGER),
          }[sortKey];
          if (key) rows = [...rows].sort((x, y) => (key(x) > key(y) ? dir : key(x) < key(y) ? -dir : x.id - y.id));
        }
        const page = paginate(rows.map((r) => entity.detail(r)));
        page.meta.answer_block_kinds = ANSWER_BLOCK_KINDS;
        if (entity.base === '/admin/pages') {
          page.meta.section_types = SECTION_TYPES;
          page.meta.section_presets = SECTION_PRESETS;
          // The AI page builder (0.116.0): the mock has no model behind it, so it reports itself off.
          page.meta.ai_draft = { available: false, reason: AI_DRAFT_OFF };
        }
        page.meta.custom_field_groups = entity.base === '/admin/pages' ? CUSTOM_FIELD_DEFINITIONS : [];
        if (entity.base === '/admin/services') page.meta.sorts = ['title', 'category', 'status', 'order', 'updated'];
        if (entity.base === '/admin/store/products') {
          page.meta.types = [{ value: 'physical', label: 'Physical', description: 'Shipped.' }, { value: 'digital', label: 'Digital', description: 'A code.' }, { value: 'service', label: 'Service', description: 'Work.' }];
          page.meta.statuses = [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }];
          page.meta.conditions = [{ value: 'new', label: 'New' }, { value: 'refurbished', label: 'Refurbished' }, { value: 'used', label: 'Used' }];
        }
        return json(res, 200, page);
      }
      if (p === entity.base && req.method === 'POST') {
        const body = await readJsonBody(req);
        const row = entity.detail({ id: entity.rows.length + 100, title: body.title, name: body.name, slug: body.slug || 'new' });
        return json(res, 201, { data: { ...row, ...body } });
      }
      const m = p.match(new RegExp(`^${entity.base.replace(/\//g, '\\/')}\\/(\\d+)$`));
      if (m) {
        const r = entity.rows.find((x) => x.id === Number(m[1]));
        if (!r) return json(res, 404, { message: 'Not found.' });
        /* A service category's delete answers 204, as Laravel's does. */
        if (req.method === 'DELETE' && entity.base === '/admin/service-categories') { res.writeHead(204); return res.end(); }
        if (req.method === 'DELETE') return json(res, 200, { message: 'Deleted.' });
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          /* Echoed the way Laravel would store it: the blocks come back
             numbered, with an id, in the order they were sent. */
          const blocks = Array.isArray(body.answer_blocks)
            ? body.answer_blocks.map((b, i) => ({ id: i + 1, question: null, detail: null, status: 'published', ...b, sort_order: i }))
            : entity.detail(r).answer_blocks;
          return json(res, 200, { data: { ...entity.detail(r), ...body, answer_blocks: blocks } });
        }
        return json(res, 200, { data: entity.detail(r) });
      }
    }

    if (p === '/admin/seo' && req.method === 'GET') {
      const score = { value: 80, band: 'good', passed: 8, checked: 10, failed: [] };
      const rows = solutions.slice(0, 2).map((s) => ({
        type: 'solution', type_label: 'Solutions', id: s.id, name: s.title, slug: s.slug,
        admin_path: `/admin/solutions/${s.id}`, url: `https://www.technoware.in/solutions/${s.slug}`,
        public_path: `/solutions/${s.slug}`, title: `${s.title} | Technoware`, description: s.summary || null,
        focus_keyword: null, has_override: false, overridden: [], sitemap_include: true, issues: [], score,
        ai_pending: 0, search: null, analytics: null,
        /* `{value, band}` only on a row; the detail read carries `failed`. Absent on an unscored record. */
        ...(readiness(AEO_SCORES, 'solution', s.id) ? { aeo: readiness(AEO_SCORES, 'solution', s.id) } : {}),
        ...(readiness(GEO_SCORES, 'solution', s.id) ? { geo: readiness(GEO_SCORES, 'solution', s.id) } : {}),
      }))
        /* `?aeo=poor|fair` and `?geo=poor|fair` filter by band, the way Laravel does; `?sort=aeo|geo` orders by the value. */
        .filter((r) => !url.searchParams.get('aeo') || r.aeo?.band === url.searchParams.get('aeo'))
        .filter((r) => !url.searchParams.get('geo') || r.geo?.band === url.searchParams.get('geo'))
        /* `?aeo_check=` / `?geo_check=`: the records failing one named check of that score — the site card's biggest wins. */
        .filter((r) => !url.searchParams.get('aeo_check') || (AEO_SCORES[`solution:${r.id}`]?.failed ?? []).some((f) => f.key === url.searchParams.get('aeo_check')))
        .filter((r) => !url.searchParams.get('geo_check') || (GEO_SCORES[`solution:${r.id}`]?.failed ?? []).some((f) => f.key === url.searchParams.get('geo_check')))
        .sort((a, b) => {
          const key = url.searchParams.get('sort');
          if (key !== 'aeo' && key !== 'geo') return 0;
          const d = (a[key]?.value ?? -1) - (b[key]?.value ?? -1);
          return url.searchParams.get('dir') === 'desc' ? -d : d;
        });
      return json(res, 200, { data: rows, meta: {
        total: rows.length, current_page: 1, last_page: 1, per_page: 50, with_issues: 0,
        site_score: { value: 80, band: 'good', records: rows.length, distribution: { good: rows.length, fair: 0, poor: 0 }, top_issues: [], groups: {},
          /* Each average carries its own biggest wins, ranked the way `top_issues` is, opened through `?aeo_check=` / `?geo_check=`. */
          aeo: { value: 62, band: 'fair', top_issues: topIssues(AEO_SCORES), groups: { answer: 'Answers', structure: 'Structure', links: 'Links' } },
          geo: { value: 48, band: 'poor', top_issues: topIssues(GEO_SCORES), groups: { entity: 'Entity', authority: 'Authority', content: 'Content' } } },
        ai: { enabled: false, configured: false, model: 'google/gemini-2.5-flash', models: [], actions: [], today: { runs: 0, cap: 100, remaining: 100, reached: false } },
        search: { configured: false, days: 28, error: null },
        analytics: { configured: false, days: 28, error: null },
        types: [{ value: 'solution', label: 'Solutions' }],
      } });
    }

    // The promo band's own door: its eight rows and the two tiles' seven each, in the settings row shape.
    if (p === '/admin/store/promo') {
      const row = (key, value, type = 'string') => ({ key, value, type, is_secret: false, is_set: value !== null && value !== '', url: null, options: null });
      const rows = [
        row('store_promo_enabled', '0', 'boolean'), row('store_promo_kicker', null), row('store_promo_heading', null),
        row('store_promo_price_text', null), row('store_promo_subheading', null, 'text'), row('store_promo_cta_label', 'Shop Now'),
        row('store_promo_cta_href', '/store'), row('store_promo_image_path', null),
        ...[1, 2].flatMap((n) => [
          row(`store_tile_${n}_enabled`, '0', 'boolean'), row(`store_tile_${n}_kicker`, null), row(`store_tile_${n}_heading`, null),
          row(`store_tile_${n}_text`, null, 'text'), row(`store_tile_${n}_cta_label`, 'Shop now'), row(`store_tile_${n}_cta_href`, '/store'),
          row(`store_tile_${n}_image_path`, null),
        ]),
      ];
      if (req.method === 'PATCH') return json(res, 200, { message: 'Promo banner saved.', data: rows });
      return json(res, 200, { data: rows });
    }

    /* The review queue: waiting by default, `all` for everything. */
    if (p === '/admin/store/reviews' && req.method === 'GET') {
      const status = url.searchParams.get('status') || 'pending';
      const rows = storeReviews.filter(r => status === 'all' || r.status === status).map(adminReview);
      return json(res, 200, { ...paginate(rows), meta: { ...paginate(rows).meta, statuses: [
        { value: 'pending', label: 'Waiting' }, { value: 'published', label: 'Published' }, { value: 'rejected', label: 'Rejected' }, { value: 'spam', label: 'Spam' },
      ], pending_count: storeReviews.filter(r => r.status === 'pending').length, sorts: ['created', 'rating', 'published'] } });
    }
    if (p === '/admin/store/reviews/moderate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const moved = storeReviews.filter(r => (body.ids || []).includes(r.id) && r.status !== body.status);
      for (const r of moved) { r.status = body.status; if (body.status === 'published') r.published_at ??= new Date().toISOString(); }
      return json(res, 200, { data: { moved: moved.length, pending_count: storeReviews.filter(r => r.status === 'pending').length, slugs: [] } });
    }
    {
      const m = p.match(/^\/admin\/store\/reviews\/(\d+)$/);
      const r = m && storeReviews.find(x => x.id === Number(m[1]));
      if (m && !r) return json(res, 404, { message: 'Not found.' });
      if (r && req.method === 'PATCH') { r.is_featured = Boolean((await readJsonBody(req)).is_featured); return json(res, 200, { data: adminReview(r) }); }
      if (r && req.method === 'DELETE') { storeReviews.splice(storeReviews.indexOf(r), 1); res.writeHead(204); return res.end(); }
    }

    if (p === '/admin/store/dashboard' && req.method === 'GET') {
      const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
      const series = Array.from({ length: days }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
        return { day: d.toISOString().slice(0, 10), revenue_paise: 0, orders: 0 };
      });
      return json(res, 200, { data: {
        days, low_stock_threshold: 5,
        orders: { total: 0, paid: 0, pending_payment: 0, cancelled: 0, period: 0, with_physical: 0, with_digital: 0 },
        revenue: { total_paise: 0, period_paise: 0, gst_paise: 0, discount_paise: 0, refunded_paise: 0, average_paise: null, sample: 0 },
        catalogue: { products: 0, published: 0, out_of_stock: 0 },
        attention: { awaiting_payment: 0, awaiting_dispatch: 0, awaiting_codes: 0, reviews_pending: 1, refund_requested: 0, out_of_stock: 0, codes_exhausted: 0, failed_payments: 0 },
        funnel: { product_views: null, paid_orders: 0, views_to_orders: null },
        // Null, not zeros: the mock never reminds anybody about a basket.
        recovered: null,
        series, recent: [], low_stock: [], codes_low: [],
        most_wished: [{ id: storeProducts[0].id, name: storeProducts[0].name, wishes: 3 }],
      } });
    }

    /* The models the "Test this model" control offers beside the OpenRouter key. */
    if (p === '/admin/seo/ai/models' && req.method === 'GET') {
      return json(res, 200, { data: SEO_AI_META.models, meta: { seo_model: SEO_AI_META.model, chatbot_model: SEO_AI_META.model, key_configured: false } });
    }

    if (p === '/admin/seo/ai/suggestions' && req.method === 'GET') {
      return json(res, 200, { data: [], meta: SEO_AI_META });
    }

    /* A decision on a suggestion: echoed back decided, the way Laravel
       answers, so Apply in the console completes against the mock. */
    {
      const m = p.match(/^\/admin\/seo\/ai\/suggestions\/(\d+)\/status$/);
      if (m && req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 200, { data: {
          id: Number(m[1]), action: 'answer_blocks', action_label: 'Draft answer blocks', model: 'mock',
          status: body.status, status_label: body.status === 'applied' ? 'Applied' : 'Rejected',
          result: {}, tokens: 0, decided_by: 'Mock', decided_at: new Date().toISOString(), created_at: new Date().toISOString(),
        } });
      }
    }

    if (p === '/admin/seo/ai/context' && req.method === 'GET') {
      const action = url.searchParams.get('action') || 'generate';
      const context = [
        'ABOUT THE BUSINESS', '', 'Name: Technoware', '', 'RULES YOU MUST FOLLOW', '- Never invent a fact.', '',
        'THE PAGE', '', 'Type: solution',
        ...(['answer_blocks', 'product_qa', 'improve_answer', 'faq_suggest'].includes(action)
          ? ['Where a fact is needed and the material does not give it, write [MISSING: what is missing] in its place.'] : []),
        '---WEBSITE COPY---', 'Name: Enterprise networking', '', 'Answer blocks already on the page:', '(none yet)', '',
        'FAQs already on the page:', '(none yet)', '---WEBSITE COPY---',
      ].join('\n');
      return json(res, 200, { data: { action, context, characters: context.length, approximate_tokens: Math.ceil(context.length / 4) } });
    }

    /* The eight AEO/GEO actions (`docs/aeo-geo-contract.md` §6), answered
       with a canned suggestion in each one's exact result shape, so the
       console's AEO tab — the Apply that turns `blocks` into repeater rows,
       the `[MISSING: …]` an editor is meant to see, the numbered
       `entity_links` — can be exercised here. The seven SEO actions keep
       the earlier decision: a language model has no honest mock, and those
       answer 422 with the sentence below. `improve_answer` refuses without
       a `block_id`, as the real API does. */
    {
      const m = p.match(/^\/admin\/seo\/ai\/([a-z_]+)$/);
      if (m && req.method === 'POST' && !['bulk', 'test-model', 'suggestions', 'context'].includes(m[1])) {
        const action = m[1];
        const body = await readJsonBody(req);
        const canned = SEO_AI_CANNED[action];
        if (!SEO_AI_META.actions.some((a) => a.value === action)) return json(res, 404, { message: 'No such AI action.' });
        if (!canned) {
          const message = 'The mock API does not fake a language model for this action. Run it against the real API.';
          return json(res, 422, { message, errors: { ai: [message] } });
        }
        if (action === 'improve_answer' && !body.block_id) {
          const message = 'Choose which answer block to improve.';
          return json(res, 422, { message, errors: { block_id: [message] } });
        }
        return json(res, 201, { data: {
          id: Date.now() % 100000, action, action_label: SEO_AI_META.actions.find((a) => a.value === action).label,
          model: 'mock', status: 'pending', status_label: 'Pending', result: canned, tokens: 0,
          asked_by: 'Mock', decided_by: null, decided_at: null, created_at: new Date().toISOString(),
        } });
      }
    }

    if (p === '/admin/settings' && req.method === 'GET') {
      const s = (key, value = null, extra = {}) => ({ key, value, type: 'string', group: 'general', ...extra });
      return json(res, 200, { data: {
        general: [s('company_name', 'Technoware'), s('tagline', 'Technology infrastructure that keeps your business connected.'), s('theme', 'olive')],
        contact: [s('phone', '+91 00000 00000'), s('support_email', 'support@example.test'), s('sales_email', 'sales@example.test'), s('address', 'Address line one, Address line two')],
        social: [s('social_linkedin'), s('social_twitter'), s('social_facebook'), s('social_reddit')],
        login: [
          s('login_backdrop', 'image', { group: 'login' }), s('login_intensity', 'medium', { group: 'login' }),
          s('login_speed', 'normal', { group: 'login' }), s('login_image_path', null, { group: 'login' }),
          s('login_message', null, { group: 'login', type: 'text' }),
        ],
        motion: [
          s('motion_reveal', 'lift', { group: 'motion' }), s('motion_buttons', 'lift', { group: 'motion' }), s('motion_page', 'none', { group: 'motion' }),
          s('motion_loader', 'none', { group: 'motion' }), s('motion_splash', '0', { group: 'motion', type: 'boolean' }), s('motion_hero', 'grid', { group: 'motion' }),
          s('motion_progress', 'none', { group: 'motion' }),
        ],
        themes: [s('site_theme', 'classic', { group: 'themes' }), s('site_theme_options', null, { group: 'themes', type: 'text' })],
        announcement: [
          s('announcement_enabled', '1', { group: 'announcement', type: 'boolean' }),
          s('announcement_message', '<p><b>Prices slashed</b> across the switch range this month &mdash; <a href="/store">see the shop</a></p>', { group: 'announcement', type: 'text' }),
          s('announcement_style', 'gradient', { group: 'announcement' }), s('announcement_colour', '#12140d', { group: 'announcement' }),
          s('announcement_colour_2', '#2f3a1f', { group: 'announcement' }), s('announcement_mode', 'ticker', { group: 'announcement' }),
          s('announcement_closable', '1', { group: 'announcement', type: 'boolean' }),
          s('announcement_starts_at', null, { group: 'announcement' }), s('announcement_ends_at', null, { group: 'announcement' }),
        ],
        portal: [s('portal_enabled', '1'), s('registration_enabled', '1'), s('customer_approval_required', '0')],
        /* Events → Settings (docs/events-contract.md): three private rows. */
        events: [
          s('events_email', null, { group: 'events' }), s('event_reminder_hours', '24', { group: 'events' }),
          s('event_max_seats', '5', { group: 'events' }),
        ],
        auth: [s('otp_login_enabled', '1'), s('otp_admin_login_enabled', '1'), s('password_login_enabled', '1')],
        mail: [
          s('mail_transport'), s('smtp_host'), s('smtp_port', '587'), s('smtp_username'),
          s('smtp_password', null, { is_secret: true, is_set: false }), s('smtp_encryption', 'tls'),
          s('oauth_client_id'), s('oauth_client_secret', null, { is_secret: true, is_set: false }),
          s('mail_api_key', null, { is_secret: true, is_set: false }),
          s('mailgun_domain'), s('mailgun_endpoint', 'api.mailgun.net'),
          s('ses_key'), s('ses_secret', null, { is_secret: true, is_set: false }), s('ses_region', 'ap-south-1'),
          s('mail_from_address'), s('mail_from_name'),
        ],
        /* The support mailbox (Settings -> Ticketing). Off, with the
           choices the real API offers, so the panel draws every select. */
        tickets: [
          s('inbound_mail_enabled', '0', { group: 'tickets', type: 'boolean' }),
          s('inbound_mail_provider', null, { group: 'tickets', options: [
            { value: 'imap', label: 'IMAP', description: 'Any mailbox with an IMAP server and a password.' },
            { value: 'google', label: 'Gmail or Google Workspace', description: 'Connect a Google mailbox with its own consent screen.' },
            { value: 'microsoft', label: 'Microsoft 365 / Outlook', description: 'Connect a Microsoft 365 mailbox through an app registration.' },
          ] }),
          s('inbound_mail_address', null, { group: 'tickets' }),
          s('inbound_imap_host', null, { group: 'tickets' }), s('inbound_imap_port', '993', { group: 'tickets' }),
          s('inbound_imap_encryption', 'ssl', { group: 'tickets', options: [
            { value: 'ssl', label: 'SSL / TLS (port 993)', description: 'The usual choice.' },
            { value: 'tls', label: 'STARTTLS (port 143)', description: 'A plain connection upgraded to TLS.' },
            { value: 'none', label: 'None', description: 'A plain connection.' },
          ] }),
          s('inbound_imap_username', null, { group: 'tickets' }),
          s('inbound_imap_password', null, { group: 'tickets', is_secret: true, is_set: false }),
          s('inbound_oauth_client_id', null, { group: 'tickets' }),
          s('inbound_oauth_client_secret', null, { group: 'tickets', is_secret: true, is_set: false }),
          s('inbound_oauth_tenant', 'common', { group: 'tickets' }),
          s('inbound_oauth_account', null, { group: 'tickets' }), s('inbound_oauth_connected_at', null, { group: 'tickets' }),
          s('inbound_mail_folder', 'INBOX', { group: 'tickets' }),
          s('inbound_mail_after', 'move', { group: 'tickets', options: [
            { value: 'move', label: 'Move it to a folder', description: 'Each message is moved once it is a ticket.' },
            { value: 'seen', label: 'Mark it as read', description: 'Each message is marked read and left where it is.' },
          ] }),
          s('inbound_mail_processed_folder', 'Processed', { group: 'tickets' }),
          s('inbound_mail_unknown_sender', 'create', { group: 'tickets', options: [
            { value: 'create', label: 'Open a ticket and create a portal account', description: 'An active portal account is created from the sender.' },
            { value: 'ignore', label: 'Ignore it', description: 'Only existing customers get tickets by email.' },
          ] }),
          s('inbound_mail_category_id', null, { group: 'tickets' }),
          s('inbound_mail_priority', 'normal', { group: 'tickets', options: [
            { value: 'low', label: 'Low', description: 'Target first response within 24 hours.' },
            { value: 'normal', label: 'Normal', description: 'Target first response within 8 hours.' },
            { value: 'high', label: 'High', description: 'Target first response within 4 hours.' },
            { value: 'critical', label: 'Critical', description: 'Target first response within 1 hour.' },
          ] }),
          s('inbound_mail_last_run', null, { group: 'tickets' }), s('inbound_mail_error', null, { group: 'tickets' }),
        ],
        /* Messaging channels (Messaging -> Settings). */
        messaging: [
          s('messaging_whatsapp_provider', 'meta_cloud', { group: 'messaging' }), s('messaging_rcs_provider', null, { group: 'messaging' }),
          s('messaging_push_provider', 'fcm', { group: 'messaging' }),
          s('messaging_promo_start', '09:00', { group: 'messaging' }), s('messaging_promo_end', '21:00', { group: 'messaging' }),
          s('messaging_webhook_secret', null, { group: 'messaging', is_secret: true, is_set: false }),
          s('whatsapp_meta_phone_number_id', '105500000000000', { group: 'messaging' }), s('whatsapp_meta_business_account_id', '900100000000000', { group: 'messaging' }),
          s('whatsapp_meta_access_token', null, { group: 'messaging', is_secret: true, is_set: true }),
          s('whatsapp_meta_app_secret', null, { group: 'messaging', is_secret: true, is_set: true }),
          s('whatsapp_meta_verify_token', null, { group: 'messaging', is_secret: true, is_set: false }),
          s('whatsapp_gupshup_api_key', null, { group: 'messaging', is_secret: true, is_set: false }), s('whatsapp_gupshup_app_name', null, { group: 'messaging' }),
          s('whatsapp_gupshup_app_id', null, { group: 'messaging' }), s('whatsapp_gupshup_source', null, { group: 'messaging' }),
          s('whatsapp_twilio_account_sid', null, { group: 'messaging' }), s('whatsapp_twilio_auth_token', null, { group: 'messaging', is_secret: true, is_set: false }),
          s('whatsapp_twilio_from', null, { group: 'messaging' }),
          s('rcs_rbm_agent_id', null, { group: 'messaging' }), s('rcs_rbm_service_account', null, { group: 'messaging', type: 'text', is_secret: true, is_set: false }),
          s('rcs_rbm_client_token', null, { group: 'messaging', is_secret: true, is_set: false }),
          s('rcs_gupshup_userid', null, { group: 'messaging' }), s('rcs_gupshup_password', null, { group: 'messaging', is_secret: true, is_set: false }),
          s('rcs_gupshup_bot_id', null, { group: 'messaging' }),
          s('push_fcm_service_account', null, { group: 'messaging', type: 'text', is_secret: true, is_set: true }),
          s('messaging_whatsapp_error', null, { group: 'messaging' }), s('messaging_rcs_error', null, { group: 'messaging' }), s('messaging_push_error', null, { group: 'messaging' }),
        ],
        push: [
          s('push_api_key', 'AIzaMockKey000000000000000000000000000', { group: 'push' }), s('push_project_id', 'technoware-push', { group: 'push' }),
          s('push_messaging_sender_id', '123456789012', { group: 'push' }), s('push_app_id', '1:123456789012:web:0a1b2c3d4e5f', { group: 'push' }),
          s('push_vapid_key', 'BMockVapidKey', { group: 'push' }),
        ],
      } });
    }
    if (p === '/admin/settings' && req.method === 'PATCH') return json(res, 200, { data: [] });
    if (p === '/admin/settings/clear-secret' && req.method === 'POST') return json(res, 200, { data: { cleared: true } });

    /* `available` mirrors what this project actually ships: the two Symfony
       bridges are required in composer.json, and aws/aws-sdk-php is not --
       SES was deferred rather than paid for at ~50MB of vendor per deploy. So
       ses reports false here too, which is what makes a build against the mock
       render the disabled option and its install command at least once. A
       fixture that says everything is fine tests only the happy path. */
    if (p === '/admin/settings/mail') {
      const t = (value, label, fields, is_oauth = false, install = null, available = true) => ({
        value, label, blurb: `${label} -- mock fixture.`, fields, is_oauth, available, install,
      });
      return json(res, 200, { data: {
        transport: null,
        transports: [
          t('smtp', 'SMTP server', ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption']),
          t('google', 'Gmail or Google Workspace', ['oauth_client_id', 'oauth_client_secret'], true),
          t('brevo', 'Brevo', ['mail_api_key']),
          t('mailgun', 'Mailgun', ['mail_api_key', 'mailgun_domain', 'mailgun_endpoint']),
          t('ses', 'Amazon SES', ['ses_key', 'ses_secret', 'ses_region'], false, 'composer require aws/aws-sdk-php', false),
          t('log', 'Write to the log -- do not send', []),
        ],
        account: null,
        connected_at: null,
        is_connected: false,
        error: null,
      } });
    }
    /* The support mailbox tickets are read from. Off in the fixture, with two
       rows in the log so the table renders in CI: one that became a ticket
       and one the loop guard skipped. */
    if (p === '/admin/settings/tickets/inbound' && req.method === 'GET') {
      const provider = (value, label, fields, is_oauth = false, imap_host = null) => ({
        value, label, blurb: `${label} -- mock fixture.`, fields, is_oauth, imap_host,
      });
      return json(res, 200, { data: {
        enabled: false, switched_on: false, provider: null,
        providers: [
          provider('imap', 'IMAP', ['inbound_imap_host', 'inbound_imap_port', 'inbound_imap_encryption', 'inbound_imap_username', 'inbound_imap_password']),
          provider('google', 'Gmail or Google Workspace', ['inbound_oauth_client_id', 'inbound_oauth_client_secret'], true, 'imap.gmail.com'),
          provider('microsoft', 'Microsoft 365 / Outlook', ['inbound_oauth_client_id', 'inbound_oauth_client_secret', 'inbound_oauth_tenant'], true, 'outlook.office365.com'),
        ],
        address: null, account: null, connected_at: null, is_connected: false,
        folder: 'INBOX', moves_processed: true, processed_folder: 'Processed',
        error: null, last_run_at: '2026-09-18T09:00:00+05:30',
        scheduler: { known: true, last_run_seconds: 20, running: true },
        categories: [{ id: 1, name: 'Networking' }, { id: 2, name: 'Servers' }],
        callback_path: '/admin/settings/tickets/callback',
        php: { zip: true, openssl: true, mbstring: true, iconv: true, fileinfo: true },
        recent: [
          { id: 2, from: 'neil@example.test', from_name: 'Neil Basu', subject: 'AP-04 dropping clients in the warehouse',
            outcome: 'ticket_created', reason: null, ticket_reference: 'TW-2026-00021',
            received_at: '2026-09-18T08:58:00+05:30', created_at: '2026-09-18T09:00:00+05:30' },
          { id: 1, from: 'noreply@example.test', from_name: 'Technoware', subject: '[TW-2026-00019] New ticket: New user setup',
            outcome: 'skipped:own_address', reason: null, ticket_reference: null,
            received_at: '2026-09-18T08:40:00+05:30', created_at: '2026-09-18T08:41:00+05:30' },
        ],
      } });
    }
    if (p === '/admin/settings/tickets/inbound/authorize') return json(res, 422, { message: 'Save the client ID and secret before connecting an account.' });
    if (p === '/admin/settings/tickets/inbound/callback') return json(res, 422, { message: 'That connection link has expired or was already used. Start again from Settings.' });
    if (p === '/admin/settings/tickets/inbound/disconnect') return json(res, 200, { data: { is_connected: false } });
    if (p === '/admin/settings/tickets/inbound/test') return json(res, 422, { message: 'Choose how the mailbox is reached and save first.' });

    if (p === '/admin/settings/mail/authorize') return json(res, 422, { message: 'Save the client ID and secret first.' });
    if (p === '/admin/settings/mail/callback') return json(res, 422, { message: 'That connection did not complete. Start again from Settings.' });
    if (p === '/admin/settings/mail/disconnect') return json(res, 200, { data: { is_connected: false } });
    if (p === '/admin/settings/mail/test') {
      return json(res, 422, { message: 'No transport is configured, so there was nothing to send through.', transport: 'SMTP server' });
    }

    /* Resending a sent campaign to its non-openers: a new campaign, already
       sending, pointing home through `resend_of`. The one refusal the screen
       has to draw is the second press. */
    {
      const m = p.match(/^\/admin\/newsletter\/campaigns\/(\d+)\/resend$/);
      if (m && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (Number(m[1]) === 12) return json(res, 422, { message: 'This campaign has already been resent once.' });
        return json(res, 201, { data: {
          id: 12, name: 'September news — resend', subject: body.subject ?? 'In case you missed it', subject_b: null,
          ab_test_percent: null, ab_wait_hours: null, preheader: null, from_name: 'Technoware', from_email: 'news@example.test',
          reply_to: null, status: 'sending', status_label: 'Sending', is_editable: false, template_id: null, blocks: [],
          recipient_count: 4, health_score: 91, scheduled_at: null, started_at: '2026-09-20T09:00:00+05:30',
          completed_at: null, test_sent_at: null, created_at: '2026-09-20T09:00:00+05:30',
          resend: null, resend_of: { id: Number(m[1]), name: 'September news' }, group_ids: [1], groups: [{ id: 1, name: 'Everyone' }],
        } });
      }
    }

    /* Automation sequences: one fixture with two steps, one active enrolment,
       and a report, so every panel of the sequence screen renders in CI. The
       write endpoints answer from the fixture rather than mutating it — the
       mock is a contract, and a stateful one answers differently on the
       second run. */
    if (p.startsWith('/admin/newsletter/sequences')) {
      const steps = [
        { id: 31, position: 1, subject: 'Welcome to Technoware', name: 'Welcome series — step 1', delay_days: 0, health_score: 88, sent_count: 42, updated_at: '2026-09-18T09:00:00+05:30' },
        { id: 32, position: 2, subject: 'Three things to set up first', name: 'Welcome series — step 2', delay_days: 3, health_score: 84, sent_count: 30, updated_at: '2026-09-18T09:00:00+05:30' },
      ];
      const counts = { active: 12, completed: 30, cancelled: 2 };
      const sequence = {
        id: 1, name: 'Welcome series', status: 'active', status_label: 'Active', newsletter_group_id: 1,
        group: { id: 1, name: 'Everyone' }, from_name: 'Technoware', from_email: 'news@example.test', reply_to: null,
        author: staff.name, created_at: '2026-09-18T09:00:00+05:30', updated_at: '2026-09-18T09:00:00+05:30',
        steps, enrolments: counts,
      };
      const statuses = [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }];

      if (p === '/admin/newsletter/sequences' && req.method === 'GET') {
        return json(res, 200, { data: [{ ...sequence, steps: undefined, enrolments: undefined, steps_count: 2, active_enrolments: 12 }], meta: { statuses } });
      }
      if (p === '/admin/newsletter/sequences' && req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 201, { data: { ...sequence, id: 2, name: body.name ?? 'New sequence', status: 'paused', status_label: 'Paused', steps: [], enrolments: { active: 0, completed: 0, cancelled: 0 } } });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+\/report$/.test(p)) {
        return json(res, 200, { data: {
          sequence: { id: 1, name: sequence.name, status: 'active' },
          steps: [
            { id: 31, position: 1, subject: steps[0].subject, delay_days: 0, sent: 42, opened: 20, clicked: 6 },
            { id: 32, position: 2, subject: steps[1].subject, delay_days: 3, sent: 30, opened: 11, clicked: 2 },
          ],
          enrolments: counts,
        } });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+\/enrolments$/.test(p) && req.method === 'GET') {
        const rows = [
          { id: 501, subscriber: { id: 7, email: 'priya@meridian.example', name: 'Priya Nair', status: 'active' }, status: 'active', status_label: 'Active',
            next_position: 2, next_at: '2026-09-23T09:00:00+05:30', enrolled_at: '2026-09-20T09:00:00+05:30', completed_at: null, cancelled_reason: null },
          { id: 500, subscriber: { id: 6, email: 'arjun@meridian.example', name: 'Arjun Rao', status: 'unsubscribed' }, status: 'cancelled', status_label: 'Cancelled',
            next_position: 2, next_at: null, enrolled_at: '2026-09-10T09:00:00+05:30', completed_at: null, cancelled_reason: 'The subscriber is Unsubscribed.' },
        ];
        const status = url.searchParams.get('status');
        const shown = status ? rows.filter((r) => r.status === status) : rows;
        return json(res, 200, {
          data: shown,
          meta: { current_page: 1, last_page: 1, per_page: 25, total: shown.length,
            statuses: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }] },
          links: {},
        });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+\/enrolments\/\d+\/cancel$/.test(p)) {
        return json(res, 200, { data: { id: 501, subscriber: { id: 7, email: 'priya@meridian.example', name: 'Priya Nair', status: 'active' },
          status: 'cancelled', status_label: 'Cancelled', next_position: 2, next_at: null, enrolled_at: '2026-09-20T09:00:00+05:30', completed_at: null, cancelled_reason: 'Cancelled by staff.' } });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+\/enrol$/.test(p)) {
        return json(res, 200, { data: { enrolled: 3, already_enrolled: 1, not_active: 0, suppressed: 1, no_steps: 0, unknown: 0 } });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+\/steps(\/reorder|\/\d+)?$/.test(p)) {
        if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
        return json(res, req.method === 'POST' ? 201 : 200, { data: sequence });
      }
      if (/^\/admin\/newsletter\/sequences\/\d+$/.test(p)) {
        if (req.method === 'DELETE') return json(res, 422, { message: '12 people are still enrolled in this sequence. Pause it or cancel their enrolments before deleting it.' });
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          return json(res, 200, { data: { ...sequence, ...body, status_label: body.status === 'paused' ? 'Paused' : 'Active' } });
        }
        return json(res, 200, { data: sequence });
      }
    }

    /* The activity log. Read-only in the real API too -- there is no store,
       update or destroy, and a mock that offered one would have the console
       built against a write path that does not exist. */
    /* Importing a WordPress site. The index reports one import already read
       and waiting for review, so the review — the choices, the ACF table and
       the plan with its reasons — renders in CI; starting a scan answers
       what a stopped queue answers. The contract is `WordPressImportController`. */
    const wpImport = (status) => ({
      id: 1, site_url: 'https://shop.example', status, sections: ['content', 'catalogue', 'customers', 'custom'],
      error: null, uploaded_by: 'Admin', created_at: '2026-09-27T09:00:00+05:30', completed_at: null,
      expires_at: '2026-09-30T09:00:00+05:30', can_resume: false, decisions: {},
      progress: { collections: { posts: 42, pages: 9, products: 120, orders: 860 }, totals: {}, requests: 118, current: null, tasks_done: 12, tasks_total: 12, analyse_step: null, analyse_percent: 100, commit_step: null, commit_percent: 0 },
      site: { name: 'Old Shop', url: 'https://shop.example', woocommerce: true, acf: true, yoast: true, counts: { posts: 42, pages: 9, products: 120, orders: 860, customers: 310 }, missing: { menus: 'The credentials are not allowed to read this (wp/v2/menus).' } },
      analysis: {
        analysed_at: '2026-09-27T09:02:00+05:30',
        notices: ['Every imported page, post, product and category gets a redirect from its old address. Old "?p=123" links cannot be redirected.'],
        decisions: {
          media_scope: { value: 'referenced', library: 1480 },
          page_layout: { value: 'sections', pages: 18 },
          currency: 'INR',
          tax_basis: { value: 'keep', choices: ['keep', 'add_gst'] },
          content_types: [{ source: 'portfolio', name: 'Portfolio', slug: 'portfolio', problem: null, imported: false, entries: 14 }],
          acf: { blog_post: [
            { source: 'subtitle', key: 'subtitle', label: 'Subtitle', kind: 'text', unsupported: null, count: 30 },
            { source: 'rows', key: 'rows', label: 'Rows', kind: null, unsupported: 'a repeater or flexible content', count: 4 },
          ] },
          acf_exposed: true,
          newsletter: { customers: 310, group: 'Existing customers', sequences: ['Welcome series'] },
        },
        steps: [
          { key: 'posts', label: 'Blog posts', create: 40, update: 0, skip: 2, warn: 6, reasons: [
            { reason: 'In the bin on the old site.', count: 2, kind: 'skip', examples: ['Old launch notes'] },
            { reason: 'Had tags, which are not kept: the blog has categories only.', count: 6, kind: 'warn', examples: ['Cabling guide', 'Wi-Fi survey'] },
          ] },
          { key: 'page_parts', label: 'Forms, pricing tables and galleries', create: 5, update: 0, skip: 0, warn: 1, reasons: [
            { reason: 'Forms, placed as form sections', count: 2, kind: 'info', examples: ['Contact', 'Get a quote'] },
            { reason: 'Galleries and carousels, made galleries', count: 2, kind: 'info', examples: ['Projects', 'About us'] },
            { reason: 'Pricing tables, made pricing blocks', count: 1, kind: 'info', examples: ['AMC plans'] },
            { reason: 'A file upload field has no field here and was left out of its form.', count: 1, kind: 'warn', examples: ['Careers — Your CV'] },
          ] },
          { key: 'media', label: 'Files and pictures', create: 212, update: 0, skip: 1, warn: 0, reasons: [
            { reason: 'Not a file type the library accepts (.psd).', count: 1, kind: 'skip', examples: ['brochure.psd'] },
          ] },
          { key: 'products', label: 'Products', create: 112, update: 0, skip: 8, warn: 3, reasons: [
            { reason: 'Downloadable: the store delivers activation codes, not files.', count: 5, kind: 'skip', examples: ['Install manual'] },
            { reason: 'A grouped product; the store has no product made of other products.', count: 3, kind: 'skip', examples: ['Starter kit'] },
          ] },
          { key: 'orders', label: 'Orders', create: 860, update: 0, skip: 0, warn: 0, reasons: [] },
        ],
      },
      result: null,
    });
    if (p === '/admin/imports/wordpress' && req.method === 'GET') {
      return json(res, 200, { data: [], meta: { active: wpImport('ready'), delivering: false, sections: ['content', 'catalogue', 'customers', 'custom'] } });
    }
    if (p === '/admin/imports/wordpress' && req.method === 'POST') {
      return json(res, 422, { message: 'Nothing is draining the queue, so the scan would never start.', errors: { queue: ['Nothing is draining the queue, so the scan would never start.'] } });
    }
    if (/^\/admin\/imports\/wordpress\/\d+$/.test(p) && req.method === 'GET') return json(res, 200, { data: wpImport('ready') });
    if (/^\/admin\/imports\/wordpress\/\d+$/.test(p) && req.method === 'PATCH') return json(res, 202, { data: wpImport('analysing') });
    if (/^\/admin\/imports\/wordpress\/\d+$/.test(p) && req.method === 'DELETE') return json(res, 200, { data: wpImport('cancelled') });
    if (/^\/admin\/imports\/wordpress\/\d+\/commit$/.test(p) && req.method === 'POST') return json(res, 202, { data: wpImport('running') });

    /* Backups (2026-09-27, docs/backups.md): one full and one incremental that
       reached S3, a failed one, the schedule on, S3 set up and the other two
       not — so the list, the badges and the status cards all render in CI. */
    const backupRow = (id, type, status, extra = {}) => ({
      id, uuid: `00000000-0000-4000-8000-00000000000${id}`, folder: `2026092${id}-021500-${type === 'full' ? 'full' : 'incr'}-0000000${id}`,
      type, trigger: 'schedule', status, error: status === 'failed' ? 'Access Denied (HTTP 403)' : null,
      includes: { database: true, public: true, private: true }, base_id: type === 'full' ? null : 1, parent_id: type === 'full' ? null : 1,
      dumper: 'mysqldump', db_bytes: 215431, file_count: type === 'full' ? 388 : 3, files_bytes: type === 'full' ? 92632257 : 41230, deleted_count: 0,
      total_bytes: type === 'full' ? 92860000 : 260000, created_by: null, created_at: `2026-09-2${id}T02:15:00+05:30`,
      started_at: `2026-09-2${id}T02:15:02+05:30`, finished_at: `2026-09-2${id}T02:16:40+05:30`, local: id === 2,
      destinations: [{ key: 's3', label: 'S3 / S3-compatible', status: status === 'failed' ? 'failed' : 'done', bytes_sent: 1, bytes: 1, error: status === 'failed' ? 'Access Denied (HTTP 403)' : null }],
      restorable_from: status === 'completed' ? (id === 2 ? ['s3', 'local'] : ['s3']) : [],
      progress: { archived: 0, volumes: 1, dump_table: null }, ...extra,
    });
    if (p === '/admin/backups' && req.method === 'GET') {
      return json(res, 200, {
        data: [backupRow(3, 'incremental', 'failed'), backupRow(2, 'incremental', 'completed'), backupRow(1, 'full', 'completed')],
        meta: {
          running: null, restore: null, restoring: false, last_success: '2026-09-22T02:16:40+05:30', next_run: '2026-09-28T02:15:00+05:30',
          schedule: { enabled: true, time: '02:15', full_day: 'sun', incremental_every: 24, keep_chains: 4 },
          includes: { database: true, public: true, private: true },
          destinations: [
            { key: 's3', label: 'S3 / S3-compatible', enabled: true, configured: true, error: null, detail: { bucket: 'site-backups', endpoint: 'Amazon S3' } },
            { key: 'gdrive', label: 'Google Drive', enabled: false, configured: false, error: null, detail: {} },
            { key: 'ftp', label: 'FTP / FTPS / SFTP', enabled: false, configured: false, error: null, detail: { protocol: 'SFTP' } },
          ],
          error: 'The incremental backup of Wed 23 Sep 2026 2:15 AM did not reach S3 / S3-compatible. Access Denied (HTTP 403)',
          scheduler: { known: true, last_run_seconds: 20, running: true },
          dumper: { chosen: 'mysqldump', binary: true }, disk_free: 52428800000, code_schema: '2026_09_27_130000_create_backups',
        },
      });
    }
    if (p === '/admin/backups' && req.method === 'POST') return json(res, 202, { data: backupRow(4, 'full', 'pending') });
    if (p === '/admin/backups/drive' && req.method === 'GET') {
      return json(res, 200, { data: { is_connected: false, account: null, connected_at: null, client_configured: false, error: null, callback_path: '/admin/backups/drive/callback' } });
    }
    if (/^\/admin\/backups\/destinations\/[a-z0-9]+\/folders$/.test(p)) return json(res, 200, { data: [], meta: { total: 0 } });
    if (/^\/admin\/backups\/destinations\/[a-z0-9]+\/test$/.test(p)) return json(res, 200, { data: { message: 'The mock answered.' } });

    /* Importing subscribers from a mailbox. Not connected, no client saved,
       the queue not delivering — the shapes the screen has to draw before
       anything works — and one scan fixture that is ready to review, so the
       domain table renders in CI. */
    if (p === '/admin/newsletter/imports/mailbox' && req.method === 'GET') {
      const provider = (value, label, fields, imap_host) => ({ value, label, blurb: `${label} -- mock fixture.`, fields, is_oauth: true, imap_host });
      return json(res, 200, { data: {
        providers: [
          provider('google', 'Gmail or Google Workspace', ['inbound_oauth_client_id', 'inbound_oauth_client_secret'], 'imap.gmail.com'),
          provider('microsoft', 'Microsoft 365 / Outlook', ['inbound_oauth_client_id', 'inbound_oauth_client_secret', 'inbound_oauth_tenant'], 'outlook.office365.com'),
        ],
        provider: null, account: null, connected_at: null, is_connected: false, client_configured: false,
        error: null, callback_path: '/admin/newsletter/subscribers/import/mailbox/callback',
        php: { zip: true, openssl: true, mbstring: true, iconv: true, fileinfo: true },
        delivering: false, active: null,
      } });
    }
    if (p === '/admin/newsletter/imports/mailbox/authorize') return json(res, 422, { message: 'No OAuth client is saved. An administrator saves the client ID and secret under Settings → Ticketing; this screen only adds its own callback address to it.' });
    if (p === '/admin/newsletter/imports/mailbox/callback') return json(res, 422, { message: 'That connection link has expired or was already used. Start again from the import screen.' });
    if (p === '/admin/newsletter/imports/mailbox/disconnect') return json(res, 200, { data: { is_connected: false } });
    if (p === '/admin/newsletter/imports/mailbox/scan') return json(res, 422, { message: 'Nothing is draining the queue, so the scan would never start.', errors: { queue: ['Nothing is draining the queue, so the scan would never start. On the server add the cron entry `* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`, or run `php artisan queue:work`.'] } });
    /* Crawling a website for subscribers: no Hunter key, the queue not
       delivering, nothing in flight -- the first step's shape. */
    if (p === '/admin/newsletter/imports/crawl' && req.method === 'GET') {
      return json(res, 200, { data: {
        active: null, delivering: false, hunter_configured: false, hunter: null,
        industries: ['Hospitals', 'Hardware retail'],
        limits: { depth: 4, pages: 500, linked_sites: 100, hunter_domains: 50 },
      } });
    }
    if (p === '/admin/newsletter/imports/crawl') return json(res, 422, { message: 'Nothing is draining the queue, so the crawl would never start.', errors: { queue: ['Nothing is draining the queue, so the crawl would never start. On the server add the cron entry `* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`, or run `php artisan queue:work`.'] } });
    if (/^\/admin\/newsletter\/imports\/\d+$/.test(p) && req.method === 'DELETE') return json(res, 200, { data: { id: 7, source: 'mailbox', status: 'cancelled' } });
    if (/^\/admin\/newsletter\/imports\/\d+$/.test(p) && req.method === 'GET') {
      return json(res, 200, { data: {
        id: 7, source: 'mailbox', status: 'ready', filename: 'marketing@example.test (mailbox, 2025-09-18 to 2026-09-18)',
        total_rows: 6, imported: 0, updated: 0, invalid: 0, duplicates: 0, suppressed: 0, excluded: 0,
        progress: { since: '2025-09-18', until: '2026-09-18', include_junk: false, folders_total: 3, folders_done: 3, folder: null,
          messages: 412, messages_total: 412, addresses: 6, capped: false, started_at: '2026-09-18T09:00:00+05:30', updated_at: '2026-09-18T09:04:00+05:30',
          skipped: [{ path: '[Gmail]/All Mail', name: 'All Mail', skip: 'virtual' }] },
        analysis: {
          headers: ['email', 'first_name', 'last_name'], mapping: { email: 0, first_name: 1, last_name: 2, company: null, phone: null },
          counts: { total: 6, valid: 4, invalid: 0, duplicates: 0, already_subscribed: 1, suppressed: 1 },
          domains: [
            { domain: 'meridian.example', addresses: 3, valid: 2, role: 0, sample: ['priya@meridian.example', 'arjun@meridian.example', 'ops@meridian.example'], kind: null, default: true },
            { domain: 'example.test', addresses: 2, valid: 1, role: 0, sample: ['engineer@example.test', 'desk@example.test'], kind: 'own', default: false },
            { domain: 'bounces.crm.example', addresses: 1, valid: 1, role: 1, sample: ['noreply@bounces.crm.example'], kind: 'machine', default: false },
          ],
          roles: { addresses: 1, sample: ['noreply@bounces.crm.example'] },
          problems: [], preview: [], capped: false, account: 'marketing@example.test',
        },
        error: null, expires_at: '2026-09-19T09:04:00+05:30', created_at: '2026-09-18T09:00:00+05:30',
      } });
    }

    /*
     * Messaging channels. Answered from the fixtures; writes echo what was
     * sent, the webhooks block's rule.
     */
    if (p === '/admin/settings/messaging') return json(res, 200, { data: MESSAGING_STATUS });
    if (p === '/admin/settings/messaging/test' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return json(res, 200, { data: { sent_to: body.channel === 'push' ? 'that browser' : '+919820011223', provider: 'Meta WhatsApp Cloud API', id: 'wamid.mock' } });
    }
    if (p === '/admin/messaging/templates/sync' && req.method === 'POST') return json(res, 200, { data: { matched: 2, unknown: ['hello_world'] } });
    if (p === '/admin/messaging/templates') {
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 201, { data: msgTemplate({ id: 9, channel: body.channel, channel_label: (MSG_CHANNELS.find((c) => c.value === body.channel) || {}).label,
          key: body.key, name: body.name, body: body.body, approval_status: body.channel === 'whatsapp' ? 'draft' : 'not_required',
          approval_label: body.channel === 'whatsapp' ? 'Not submitted' : 'No approval needed', sendable: body.channel !== 'whatsapp', placeholders: [] }) });
      }
      const channel = url.searchParams.get('channel');
      const rows = channel ? messageTemplates.filter((t) => t.channel === channel) : messageTemplates;
      return json(res, 200, { ...paginate(rows), meta: { current_page: 1, last_page: 1, per_page: 50, total: rows.length, ...MSG_TEMPLATE_META } });
    }
    {
      const m = p.match(/^\/admin\/messaging\/templates\/(\d+)(\/submit|\/test)?$/);
      if (m) {
        const t = messageTemplates.find((r) => r.id === Number(m[1]));
        if (!t) return json(res, 404, { message: 'Not found.' });
        if (m[2] === '/submit') return json(res, 200, { data: { ...t, approval_status: 'pending', approval_label: 'Waiting for approval', sendable: false } });
        if (m[2] === '/test') return json(res, 200, { data: { sent_to: '+919820011223', id: 'wamid.mock' } });
        if (req.method === 'PATCH') return json(res, 200, { data: { ...t, ...(await readJsonBody(req)) } });
        if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
        return json(res, 200, { data: t, meta: MSG_TEMPLATE_META });
      }
    }
    if (p === '/admin/messaging/automations') {
      return json(res, 200, { data: msgAutomationGrid(), meta: msgAutomationMeta(), ...(req.method === 'PUT' ? { message: 'Automations saved.' } : {}) });
    }
    if (p === '/admin/messaging/contacts') {
      const channel = url.searchParams.get('channel');
      const status = url.searchParams.get('status');
      const rows = messageContacts.filter((c) => (!channel || c.channel === channel) && (!status || (status === 'active' ? c.is_active : !c.is_active)));
      return json(res, 200, { ...paginate(rows), meta: { current_page: 1, last_page: 1, per_page: 40, total: rows.length,
        channels: MSG_CHANNELS.map((c) => ({ value: c.value, label: c.label, active: messageContacts.filter((k) => k.channel === c.value && k.is_active).length })) } });
    }
    {
      const m = p.match(/^\/admin\/messaging\/contacts\/(\d+)\/opt-out$/);
      if (m) {
        const c = messageContacts.find((r) => r.id === Number(m[1]));
        return c ? json(res, 200, { data: { ...c, is_active: false, opted_out_at: '2026-09-25T12:00:00+05:30', opt_out_reason: 'staff' } }) : json(res, 404, { message: 'Not found.' });
      }
    }
    if (p === '/admin/messaging/broadcasts/audience') return json(res, 200, { data: { count: 1 } });
    if (p === '/admin/messaging/broadcasts') {
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 201, { data: { ...messageBroadcasts[1], id: 9, name: body.name || 'New broadcast', channel: body.channel || 'whatsapp' } });
      }
      const status = url.searchParams.get('status');
      const rows = status ? messageBroadcasts.filter((b) => b.status === status) : messageBroadcasts;
      return json(res, 200, { ...paginate(rows.map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'report' && k !== 'audience_count')))), meta: { current_page: 1, last_page: 1, per_page: 25, total: rows.length, ...MSG_BROADCAST_META } });
    }
    {
      const m = p.match(/^\/admin\/messaging\/broadcasts\/(\d+)(\/send|\/cancel)?$/);
      if (m) {
        const b = messageBroadcasts.find((r) => r.id === Number(m[1]));
        if (!b) return json(res, 404, { message: 'Not found.' });
        if (m[2] === '/send') return json(res, 200, { data: { ...b, status: 'sending', status_label: 'Sending', recipient_count: 1 }, starts_at: '2026-09-25T11:00:00+05:30' });
        if (m[2] === '/cancel') return json(res, 200, { data: { ...b, status: 'cancelled', status_label: 'Cancelled' } });
        if (req.method === 'PATCH') return json(res, 200, { data: { ...b, ...(await readJsonBody(req)) } });
        if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
        return json(res, 200, { data: b, meta: MSG_BROADCAST_META });
      }
    }

    /*
     * Outgoing webhooks. Answered from the fixture rather than mutated, the
     * rule the customers block below keeps — except that the secret rides on
     * the 201 and on a rotate and on nothing else, which is the contract.
     */
    if (p === '/admin/webhooks') {
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        return json(res, 201, { data: {
          ...webhooks[0], id: 3, name: body.name || 'New webhook', url: body.url || webhooks[0].url,
          events: body.events || [], event_labels: (body.events || []).map((e) => (webhookEvents.find((o) => o.value === e) || { label: e }).label),
          deliveries_count: 0, last_delivered_at: null, last_error: null, secret: 'whsec_mock000000000000000000000000000000000000',
        } });
      }
      return json(res, 200, {
        ...paginate(webhooks),
        meta: { current_page: 1, last_page: 1, per_page: 40, total: webhooks.length, events: webhookEvents },
      });
    }
    {
      const m = p.match(/^\/admin\/webhooks\/(\d+)(\/ping|\/deliveries(\/(\d+)(\/redeliver)?)?)?$/);
      if (m) {
        const hook = webhooks.find((h) => h.id === Number(m[1]));
        if (!hook) return json(res, 404, { message: 'Not found.' });
        if (m[2] === '/ping') return json(res, 202, { data: { delivery_id: 99 } });
        if (m[2] && m[2].startsWith('/deliveries')) {
          const rows = webhookDeliveries.filter((d) => d.webhook_id === hook.id);
          if (m[4]) {
            const row = rows.find((d) => d.id === Number(m[4]));
            if (!row) return json(res, 404, { message: 'Not found.' });
            if (m[5]) return json(res, 202, { data: { ...row, id: 99, status: 'pending', attempts: 0, response_status: null, response_excerpt: null, delivered_at: null } });
            return json(res, 200, { data: { ...row, payload: { reference: 'TW-2026-00007', subject: 'Wi-Fi drops in the warehouse', status: 'open' } } });
          }
          const status = url.searchParams.get('status');
          const shown = status ? rows.filter((d) => d.status === status) : rows;
          return json(res, 200, { ...paginate(shown), meta: { current_page: 1, last_page: 1, per_page: 25, total: shown.length, statuses: ['pending', 'delivered', 'failed'] } });
        }
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          return json(res, 200, { data: { ...hook, ...(body.name ? { name: body.name } : {}), ...(body.rotate_secret ? { secret: 'whsec_mock111111111111111111111111111111111111', last_error: null } : {}) } });
        }
        if (req.method === 'DELETE') return json(res, 200, { message: 'Webhook deleted.' });
        return json(res, 200, { data: hook });
      }
    }

    if (p === '/admin/activity') {
      const rows = [
        { id: 3, action: 'login', actor: { id: 1, name: staff.name, email: staff.email, exists: true },
          subject: null, context: null, ip: '203.0.113.10', created_at: '2026-08-26T08:12:00+00:00' },
        { id: 2, action: 'destroy', actor: { id: 1, name: staff.name, email: staff.email, exists: true },
          subject: { type: 'redirect', id: 4, label: '/old-switch-page' }, context: null,
          ip: '203.0.113.10', created_at: '2026-08-25T16:40:00+00:00' },
        { id: 1, action: 'login_failed', actor: { id: null, name: 'Unknown', email: 'someone@example.test', exists: false },
          subject: null, context: { reason: 'bad_credentials' }, ip: '198.51.100.7',
          created_at: '2026-08-25T03:07:00+00:00' },
      ];
      const action = url.searchParams.get('action');
      const shown = action ? rows.filter((r) => r.action === action) : rows;
      return json(res, 200, {
        data: shown,
        meta: { current_page: 1, last_page: 1, per_page: 50, total: shown.length,
                retention_days: 90, actions: ['destroy', 'login', 'login_failed'] },
        links: {},
      });
    }

    if (p === '/admin/customers') {
      const status = url.searchParams.get('status');
      const rows = status ? adminCustomers.filter((c) => c.status === status) : adminCustomers;
      return json(res, 200, {
        data: rows,
        meta: {
          current_page: 1, last_page: 1, per_page: 25, total: rows.length,
          pending_count: adminCustomers.filter((c) => c.status === 'pending').length,
        },
        links: {},
      });
    }
    {
      const m = p.match(/^\/admin\/customers\/(\d+)(\/(approve|reject|status|resend-verification|impersonate))?$/);
      if (m) {
        const row = adminCustomers.find((c) => c.id === Number(m[1]));
        if (!row) return json(res, 404, { message: 'Not found.' });
        // Answered from the fixture rather than mutated: the mock is a contract,
        // and a stateful one gives a different answer on the second run.
        if (m[3] === 'approve') {
          return json(res, 200, { data: { ...row, status: 'active', status_label: 'Active', approved_by: staff.name } });
        }
        if (m[3] === 'reject') {
          return json(res, 200, { data: { ...row, status: 'rejected', status_label: 'Rejected' } });
        }
        if (m[3] === 'status') {
          const body = await readJsonBody(req);
          return json(res, 200, { data: { ...row, status: body.status, status_label: body.status === 'active' ? 'Active' : 'Suspended' } });
        }
        if (m[3] === 'resend-verification') return json(res, 200, { data: row });
        if (m[3] === 'impersonate') {
          if (row.status !== 'active') {
            return json(res, 422, { message: `Only an active account can be viewed as. This one is ${row.status}.` });
          }
          return json(res, 200, { token: IMPERSONATION_TOKEN, customer, expires_at: new Date(Date.now() + 3600e3).toISOString() });
        }
        return json(res, 200, { data: row });
      }
    }
    if (p === '/admin/auth/logout' && req.method === 'POST') return json(res, 200, { message: 'Signed out.' });
    if (p === '/admin/dashboard') return json(res, 200, { data: buildAdminDashboard(url.searchParams.get('volume') || 'month') });
    // The "Getting started" checklist (App\Support\Onboarding): half done, like a fresh install part-way through.
    if (p === '/admin/onboarding') {
      const steps = [
        ['logo', 'Add your logo', '/admin/settings?tab=general#setting__logo_path', true],
        ['contact', 'Replace the sample phone number and address', '/admin/settings?tab=contact', false],
        ['figures', 'Put your own figures on the homepage', '/admin/site/settings?tab=homepage', false],
        ['social', 'Check the social links', '/admin/settings?tab=social', true],
        ['look', 'Choose a look', '/admin/themes', true],
        ['mail', 'Send a test email', '/admin/settings?tab=mail', false],
        ['scheduler', 'Add the scheduler’s cron line', '/admin/system/status#scheduler', true],
        ['backups', 'Turn on backups', '/admin/backups/settings', false],
        ['team', 'Invite your team', '/admin/users/new', true],
        ['legal', 'Have the privacy and terms pages reviewed', '/admin/pages', false],
      ].map(([key, label, href, done]) => ({ key, label, hint: '', href, done }));
      return json(res, 200, { data: { steps, done: steps.filter((s) => s.done).length, total: steps.length } });
    }
    if (p === '/admin/system/status') {
      return json(res, 200, { data: {
        version: { version: '0.128.0', commit: null, built_at: null },
        code_schema: '2026_10_06_000000', database_schema: '2026_10_06_000000', installed: null,
        php: { version: '8.3.0', checks: [], max_execution_time: 30, memory_limit: '256M' },
        scheduler: {
          known: true, last_run_seconds: null, running: false,
          setup: {
            os: 'linux', panel: 'plesk', php: '/opt/plesk/php/8.3/bin/php', php_checked: null, php_version: null,
            artisan: '/var/www/vhosts/example.com/altis-tech-cms/api/artisan', user: 'example',
            command: '/opt/plesk/php/8.3/bin/php /var/www/vhosts/example.com/altis-tech-cms/api/artisan schedule:run >> /dev/null 2>&1',
            cron: '* * * * * /opt/plesk/php/8.3/bin/php /var/www/vhosts/example.com/altis-tech-cms/api/artisan schedule:run >> /dev/null 2>&1',
            work: '/opt/plesk/php/8.3/bin/php /var/www/vhosts/example.com/altis-tech-cms/api/artisan schedule:work',
            windows_task: null, dev: true,
          },
        },
        disk: { free: null, total: null },
        website: { reachable: true, version: '0.128.0', api: true, url: 'http://127.0.0.1:3000', error: null },
      } });
    }
    if (p === '/admin/users') return json(res, 200, { data: staffList });

    if (p === '/admin/tickets' && req.method === 'GET') {
      let rows = tickets;
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      const assignedTo = url.searchParams.get('assigned_to');
      const unassigned = url.searchParams.get('unassigned');
      const overdue = url.searchParams.get('overdue');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      if (status) rows = rows.filter((t) => t.status === status);
      if (priority) rows = rows.filter((t) => t.priority === priority);
      if (assignedTo) rows = rows.filter((t) => t.assigned_to && String(t.assigned_to.id) === assignedTo);
      if (unassigned) rows = rows.filter((t) => !t.assigned_to);
      if (overdue) rows = rows.filter((t) => t.is_overdue);
      if (q) rows = rows.filter((t) => (t.reference + ' ' + t.subject).toLowerCase().includes(q));
      return json(res, 200, {
        data: rows, links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, per_page: 25, total: rows.length },
      });
    }

    // ---- saved replies ----
    if (p === '/admin/canned-replies' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = q ? cannedReplies.filter((r) => (r.title + ' ' + r.body).toLowerCase().includes(q)) : cannedReplies;
      return json(res, 200, {
        data: rows, links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, per_page: 50, total: rows.length, placeholders: CANNED_PLACEHOLDERS },
      });
    }
    if (p === '/admin/canned-replies' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.title || !body.body) {
        return json(res, 422, { message: 'Check the highlighted fields.', errors: {
          ...(body.title ? {} : { title: ['Give the reply a title — it is what the picker lists.'] }),
          ...(body.body ? {} : { body: ['Write the reply.'] }),
        } });
      }
      const row = { id: cannedReplies.length + 1, title: body.title, body: body.body, sort_order: Number(body.sort_order) || 0,
        created_by: { id: staff.id, name: staff.name }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      cannedReplies.push(row);
      return json(res, 201, { data: row });
    }
    {
      const m = p.match(/^\/admin\/canned-replies\/(\d+)$/);
      if (m) {
        const row = cannedReplies.find((r) => r.id === Number(m[1]));
        if (!row) return json(res, 404, { message: 'Not found.' });
        if (req.method === 'PATCH') {
          const body = await readJsonBody(req);
          Object.assign(row, body, { updated_at: new Date().toISOString() });
          return json(res, 200, { data: row });
        }
        if (req.method === 'DELETE') {
          cannedReplies.splice(cannedReplies.indexOf(row), 1);
          return json(res, 200, { message: 'Saved reply deleted.' });
        }
        return json(res, 200, { data: row });
      }
    }
    {
      const m = p.match(/^\/admin\/tickets\/([\w-]+)\/canned-replies$/);
      if (m && req.method === 'GET') {
        const t = tickets.find((x) => x.reference === m[1]);
        if (!t) return json(res, 404, { message: 'Not found.' });
        return json(res, 200, { data: cannedReplies.map((r) => ({ ...r, body: fillCannedReply(r.body, t) })) });
      }
    }

    const am = p.match(/^\/admin\/tickets\/([\w-]+)$/);
    if (am && req.method === 'PATCH') {
      const t = tickets.find((x) => x.reference === am[1]);
      if (!t) return json(res, 404, { message: 'Not found.' });

      const patch = await readJsonBody(req);
      if (patch.status) {
        t.status = patch.status;
        t.status_label = STATUS_LABELS[patch.status];
        t.allowed_transitions = nextStatuses(patch.status);
        if (patch.status === 'closed') ensureSurvey(t.reference);
      }
      if (patch.priority) {
        t.priority = patch.priority;
        t.priority_label = PRIORITY_LABELS[patch.priority];
      }
      if ('assigned_to' in patch) {
        const person = patch.assigned_to ? staffList.find((s) => s.id === patch.assigned_to) : null;
        t.assigned_to = person ? { id: person.id, name: person.name } : null;
      }
      return json(res, 200, { data: t });
    }

    if (am && req.method === 'GET') {
      const t = tickets.find((x) => x.reference === am[1]);
      if (!t) return json(res, 404, { message: 'Not found.' });
      const sv = surveys.find((x) => x.reference === t.reference);
      const survey = sv
        ? { sent_at: sv.sent_at, rating: sv.rating, rating_label: surveyLabel(sv.rating), comment: sv.comment, answered_at: sv.answered_at }
        : null;
      return json(res, 200, { data: { ...t, customer, messages: messages[t.reference] || [], survey } });
    }

    // Merge: the same refusals as Laravel's, as 422s on `into`, and the
    // target back on success. Answered from the fixture rather than mutated
    // for the moved rows; the source is marked so its read shows the alert.
    const mg = p.match(/^\/admin\/tickets\/([\w-]+)\/merge$/);
    if (mg && req.method === 'POST') {
      const source = tickets.find((x) => x.reference === mg[1]);
      if (!source) return json(res, 404, { message: 'Not found.' });
      const body = await readJsonBody(req);
      const into = String(body.into || '').trim().toUpperCase();
      const refuse = (why) => json(res, 422, { message: why, errors: { into: [why] } });
      const target = tickets.find((x) => x.reference === into);
      if (!target) return refuse(`There is no ticket ${into}.`);
      if (target === source) return refuse('A ticket cannot be merged into itself.');
      if (source.merged_into) return refuse(`${source.reference} has already been merged into ${source.merged_into}.`);
      if (!['open', 'assigned', 'in_progress', 'pending_customer'].includes(target.status)) {
        return refuse(`${target.reference} is ${STATUS_LABELS[target.status]}. Merge into a ticket that is still open, or reopen that one first.`);
      }
      (messages[target.reference] ||= []).push(...(messages[source.reference] || []));
      messages[source.reference] = [];
      Object.assign(source, { merged_into: target.reference, status: 'closed', status_label: 'Closed', allowed_transitions: [] });
      return json(res, 200, { data: { ...target, customer, messages: messages[target.reference] } });
    }

    const rm = p.match(/^\/admin\/tickets\/([\w-]+)\/reply$/);
    if (rm && req.method === 'POST') {
      const t = tickets.find((x) => x.reference === rm[1]);
      if (!t) return json(res, 404, { message: 'Not found.' });

      // Real Laravel parses multipart/form-data; this mock only needs enough
      // of it to exercise the UI, so it reads the raw body for the plain
      // text fields it cares about rather than a full multipart parser.
      let body = '';
      for await (const chunk of req) body += chunk;
      const bodyMatch = body.match(/name="body"\r?\n\r?\n([\s\S]*?)\r?\n--/);
      const internalMatch = body.match(/name="is_internal"\r?\n\r?\n([\s\S]*?)\r?\n--/);
      const sensitiveMatch = body.match(/name="is_sensitive"\r?\n\r?\n([\s\S]*?)\r?\n--/);

      const message = {
        id: Date.now(),
        body: bodyMatch ? bodyMatch[1].trim() : '',
        is_internal: Boolean(internalMatch && internalMatch[1].trim() === '1'),
        /* Laravel stores a sensitive body encrypted and answers the plain text; the mock has nothing to seal. */
        is_sensitive: Boolean(sensitiveMatch && sensitiveMatch[1].trim() === '1'),
        author: { id: staff.id, name: staff.name, type: 'staff' },
        attachments: [],
        created_at: new Date().toISOString(),
      };
      (messages[t.reference] ||= []).push(message);
      return json(res, 201, { data: message });
    }

    return json(res, 404, { message: 'Not found.' });
  }

  // ---- public marketing content ----
  /* ?in_menu=1 narrows an index to what the mega menu may show. The mock has
     to honour it, or a build against it renders a menu the real API would have
     filtered -- which is the exact drift mock-api.mjs exists to prevent. */
  const inMenu = url.searchParams.get('in_menu') === '1';
  const menuOnly = (rows) => (inMenu ? rows.filter((r) => r.show_in_menu !== false) : rows);

  if (p === '/careers') return json(res, 200, { data: jobOpenings });
  {
    const m = p.match(/^\/careers\/([a-z0-9-]+)$/);
    if (m && req.method === 'GET') {
      const job = jobOpenings.find((j) => j.slug === m[1]);
      return job ? json(res, 200, { data: job }) : json(res, 404, { message: 'Not found.' });
    }
    const a = p.match(/^\/careers\/([a-z0-9-]+)\/apply$/);
    if (a && req.method === 'POST') {
      // Answered like the real one: 202 and one sentence, whatever was sent.
      return json(res, 202, { message: 'Thank you — your application is with us.' });
    }
  }

  if (p === '/solutions') return json(res, 200, { data: menuOnly(solutions) });
  /*
   * Every public detail read below carries `answer_blocks`, `faqs`, `entity`
   * and — with two or more questions — `faq_schema` (`docs/aeo-geo-contract.md`
   * §1, §2, §4; `answerContent()` above). The first solution, the store's
   * first product and the first knowledge article carry a full set of block
   * kinds; the rest answer empty lists and an entity block of whatever the
   * fixture links, so a page with nothing to draw renders nothing.
   */
  if (p === '/solutions/networking') {
    return json(res, 200, { data: { ...solutionDetail, ...answerContent(SOLUTION_ANSWER_BLOCKS, solutionDetail.faqs, {
      solutions: [], services: services.slice(0, 2).map((s) => ({ name: s.title, path: `/services/${s.slug}` })),
      industries: solutionDetail.industries.map((i) => ({ name: i.name, path: `/industries/${i.slug}` })),
      articles: [{ name: kbArticles[1].title, path: `/knowledge-base/${kbArticles[1].slug}` }, { name: posts[0].title, path: `/blog/${posts[0].slug}` }],
      faq_count: solutionDetail.faqs.length,
    }) } });
  }
  if (p.startsWith('/solutions/')) {
    const s2 = solutions.find(x => x.slug === p.split('/')[2]);
    return s2
      ? json(res, 200, { data: { ...s2, seo: null, schema: serviceSchema(s2, '/solutions/'), ...answerContent([], [], {}) } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/services') return json(res, 200, { data: menuOnly(services) });
  /* Active categories only, in order, the public shape (no counts, no flags beyond the one the cards need). */
  if (p === '/service-categories') {
    return json(res, 200, { data: serviceCategories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order)
      .map(({ id, name, slug, description, icon, image_background }) => ({ id, name, slug, description, icon, image_background })) });
  }
  if (p.startsWith('/services/')) {
    const s2 = services.find(x => x.slug === p.split('/')[2]);
    return s2
      ? json(res, 200, { data: { ...s2, body: '<p>Managed properly, with the migration handled out of hours.</p>', seo: null, schema: serviceSchema(s2, '/services/'),
          ...answerContent([], [], { solutions: [{ name: solutions[0].title, path: `/solutions/${solutions[0].slug}` }] }) } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/industries') return json(res, 200, { data: menuOnly(industries) });
  if (p.startsWith('/industries/')) {
    const i2 = industries.find(x => x.slug === p.split('/')[2]);
    return i2 ? json(res, 200, { data: { ...i2, body: '<p>Sector-specific notes.</p>', solutions, seo: null,
          ...answerContent([], [], { solutions: solutions.map((s) => ({ name: s.title, path: `/solutions/${s.slug}` })) }) } })
              : json(res, 404, { message: 'Not found.' });
  }
  // `?partners=1` lists the brands with a tier, products or none.
  if (p === '/brands') return json(res, 200, { data: url.searchParams.get('partners') ? brands.filter((b) => b.partner_tier) : brands });
  if (p === '/team') return json(res, 200, { data: team });
  if (p === '/clients') return json(res, 200, { data: clients });
  if (p === '/certifications') return json(res, 200, { data: certifications });
  // Editor-built forms. 404 for an unknown slug and for a form with no fields,
  // because the frontend's fallback depends on that being a miss.
  if (p.startsWith('/forms/')) {
    const f = forms.find(x => x.slug === p.split('/')[2]);
    // A form of headings and step breaks alone asks nothing, so it is a miss too.
    if (!f || f.status !== 'published' || !f.fields.some((field) => !FORM_LAYOUT_KINDS.includes(field.kind))) {
      return json(res, 404, { message: 'Not found.' });
    }
    // `redirect_url` rides on the answer: where to send the visitor instead of showing `message`, or null.
    if (req.method === 'POST') return json(res, 201, { message: f.success_message, redirect_url: f.redirect_url ?? null, data: { id: 1 } });
    return json(res, 200, { data: publicForm(f) });
  }
  /*
   * Popups. A collection and a 200 even when empty, unlike a slider or a
   * gallery: no popups is the ordinary state of this site, so a miss on the
   * common case would put an error in the log on every page render.
   *
   * `paths` carries **patterns**, never section keys — the API resolves the
   * section checklist before it sends anything, so the browser matches strings
   * and never learns that `SiteSection` exists.
   *
   * `image_width`/`image_height` are here for the reason the `/settings`
   * handler above states for the logo: the renderer reserves the box from them,
   * and a fixture sending the URL alone reintroduces exactly the layout shift
   * they were added to remove.
   */
  if (p === '/popups') {
    return json(res, 200, { data: popups });
  }

  // Carousels, addressed by slug. 404 for anything unknown, and for a slider
  // with no slides — the frontend's fallback depends on that being a miss.
  /*
    Content blocks (2026-09-24). The default CTA is `data: null` in a 200 —
    the real API's answer for "none chosen", and what keeps every page's
    closing band as the theme draws it. One sample stat bar answers by slug so
    a `[stats slug="mock-figures"]` shortcode renders; anything else is a 404,
    like a draft.
  */
  if (p === '/blocks/default/cta') return json(res, 200, { data: null });
  if (p.startsWith('/blocks/') && req.method === 'GET') {
    const slug = p.split('/')[2];
    if (slug === 'mock-figures') {
      return json(res, 200, { data: {
        id: 1, type: 'stats', layout: 'row', name: 'Mock figures', slug,
        content: { items: [{ value: '16 yrs', label: 'In the field' }, { value: '340+', label: 'Sites under AMC' }] },
        updated_at: '2026-09-24T10:00:00+05:30',
      } });
    }
    return json(res, 404, { message: 'Not found.' });
  }
  if (p.startsWith('/blocks/') && p.endsWith('/submit') && req.method === 'POST') {
    return json(res, 202, { message: 'Thank you.' });
  }

  if (p.startsWith('/sliders/')) {
    const sl = sliders.find(x => x.slug === p.split('/')[2]);
    return sl && sl.slides.length
      ? json(res, 200, { data: sl })
      : json(res, 404, { message: 'Not found.' });
  }
  // Galleries follow the slider's rule exactly: 404 for an unknown slug and
  // for one with no pictures, because the frontend's fallback is to render
  // nothing and it has to be told rather than handed an empty success.
  if (p.startsWith('/galleries/')) {
    const g = galleries.find(x => x.slug === p.split('/')[2]);
    return g && g.items.length
      ? json(res, 200, { data: g })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/product-categories') return json(res, 200, { data: menuOnly(productCategories) });
  if (p.startsWith('/product-categories/')) {
    const c2 = productCategories.find(x => x.slug === p.split('/')[2]);
    // Detail carries the solutions this category's hardware is deployed in.
    return c2 ? json(res, 200, { data: { ...c2, related_solutions: solutions.slice(0, 2),
          ...answerContent([], [], { solutions: solutions.slice(0, 2).map((s) => ({ name: s.title, path: `/solutions/${s.slug}` })) }) } })
              : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/products') {
    const cat = url.searchParams.get('category');
    const brand = url.searchParams.get('brand');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const sort = url.searchParams.get('sort');
    let rows = products;
    if (cat) rows = rows.filter(x => x.category?.slug === cat);
    if (brand) rows = rows.filter(x => x.brand?.slug === brand);
    // name, sku and brand — the manufacturer is rarely in the product's own name
    if (q) rows = rows.filter(x => (x.name + ' ' + (x.sku || '') + ' ' + (x.brand?.name || '')).toLowerCase().includes(q));
    // Same whitelist as Laravel: an unknown sort falls back rather than erroring.
    if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'newest') rows = [...rows].slice().reverse();
    return json(res, 200, paginate(rows));
  }
  if (p.startsWith('/products/')) {
    const pr = products.find(x => x.slug === p.split('/')[2]);
    // `schema` on the detail response only, the same rule the API follows: an
    // index of twenty products has no use for twenty graphs.
    return pr
      ? json(res, 200, { data: { ...pr, schema: productSchema(pr), ...answerContent([], pr.faqs || [], {
          brand: pr.brand ? { name: pr.brand.name, path: `/products?brand=${pr.brand.slug}` } : null,
          category: pr.category ? { name: pr.category.name, path: `/products/${pr.category.slug}` } : null,
          solutions: (pr.related_solutions || []).map((s) => ({ name: s.title, path: `/solutions/${s.slug}` })),
          faq_count: (pr.faqs || []).length,
        }) } })
      : json(res, 404, { message: 'Not found.' });
  }
  /* Checkout and orders.

     The mock prices the order from the basket, the same way Laravel does --
     never from anything in the request. A mock that accepted a total would let
     the frontend be built against a hole that does not exist in the real API. */
  if (p === '/checkout' && req.method === 'POST') {
    const { token, lines } = cartFor(req.headers['x-cart-token']);
    const body = await readJsonBody(req);

    if (!lines.length) {
      return json(res, 422, { message: 'Your basket is empty.', errors: { cart: ['Your basket is empty.'] } });
    }

    const summary = summarise(token, lines);
    const shipped = summary.has_shippable;

    if (shipped && !body?.address?.line1) {
      return json(res, 422, {
        message: 'Check the highlighted fields.',
        errors: { 'address.line1': ['This is needed to deliver the order.'] },
      });
    }

    orderSeq += 1;
    const number = `ORD-2026-${String(orderSeq).padStart(5, '0')}`;
    // 64 hex characters, the shape `bin2hex(random_bytes(32))` gives and the
    // frontend's order cookie refuses anything else (lib/order-access.ts).
    const accessToken = 'deadbeef'.repeat(8);

    const order = {
      order_number: number,
      status: 'pending_payment',
      status_label: 'Pending payment',
      subtotal_paise: summary.subtotal_paise,
      discount_paise: 0,
      taxable_paise: summary.taxable_paise,
      gst_paise: summary.gst_paise,
      total_paise: summary.total_paise,
      customer_name: body?.name ?? 'Someone',
      customer_email: body?.email ?? 'someone@example.test',
      customer_phone: body?.phone ?? null,
      customer_note: body?.customer_note ?? null,
      billing_address: body?.address ?? null,
      shipping_address: shipped ? (body?.address ?? null) : null,
      gst_required: Boolean(body?.gst_required),
      gstin: body?.gstin ?? null,
      company_name: body?.company_name ?? null,
      has_invoice: false,
      courier: null, tracking_number: null, tracking_url: null,
      placed_at: new Date().toISOString(), paid_at: null,
      items: summary.items.map((i) => ({
        id: i.id, name: i.name, variation_name: i.variation_name, sku: i.sku,
        options: null, type: i.type, quantity: i.quantity,
        unit_price_paise: i.unit_price_paise, line_total_paise: i.line_total_paise,
        returnable: i.returnable, slug: i.slug,
      })),
      payments: [],
    };

    orders.set(number, { order, accessToken });
    lines.length = 0;

    return json(res, 201, { data: order, meta: { access_token: accessToken } });
  }

  if (p.startsWith('/orders/')) {
    const [, , number, action] = p.split('/');
    const held = orders.get(number);
    const supplied = url.searchParams.get('token') ?? (await readJsonBody(req).catch(() => ({})))?.token;

    // A wrong token is a 404, never a 403 -- the real API answers the same way,
    // so the frontend is built against the behaviour it will actually meet.
    if (!held || held.accessToken !== supplied) return json(res, 404, { message: 'Not found.' });

    if (!action) return json(res, 200, { data: held.order });

    if (action === 'pay') {
      return json(res, 200, { data: {
        gateway: 'razorpay',
        gateway_order_id: 'order_mock123',
        key_id: 'rzp_test_mock',
        amount_paise: held.order.total_paise,
        currency: 'INR',
        order_number: number,
        name: 'Technoware',
        prefill: { name: held.order.customer_name, email: held.order.customer_email },
      } });
    }

    if (action === 'verify') {
      held.order.status = 'paid';
      held.order.status_label = 'Paid';
      held.order.paid_at = new Date().toISOString();
      return json(res, 200, { data: held.order });
    }
  }

  /* The store, the cart, and nothing shared with the catalogue above. */
  if (p === '/store/products') {
    const cat = url.searchParams.get('category');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const sort = url.searchParams.get('sort');
    let rows = storeProducts;
    if (cat) rows = rows.filter(x => x.category?.slug === cat);
    if (q) rows = rows.filter(x => (x.name + ' ' + (x.sku || '') + ' ' + (x.brand?.name || '')).toLowerCase().includes(q));
    const specs = specSelection(url.searchParams);
    if (Object.keys(specs).length) rows = rows.filter(x => matchesSpecs(x, specs));
    if (sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price-low') rows = [...rows].sort((a, b) => a.price_paise - b.price_paise);
    if (sort === 'price-high') rows = [...rows].sort((a, b) => b.price_paise - a.price_paise);
    if (sort === 'newest') rows = [...rows].slice().reverse();
    return json(res, 200, paginate(rows));
  }
  if (p === '/store/feed') {
    const rows = storeFeedRows();
    return json(res, 200, {
      data: rows,
      meta: { current_page: 1, last_page: 1, per_page: 200, total: rows.length, problems: [], skipped: {} },
    });
  }
  /*
   * "Email me when this is back." 202 and one sentence whatever was sent —
   * a suppressed address, a filled honeypot and a shelf that is not empty
   * all answer the same, so a form cannot be used to tell them apart. The
   * cancel link's endpoint answers 200 to any token, used or not.
   */
  if (/^\/store\/products\/[^/]+\/notify$/.test(p) && req.method === 'POST') {
    return json(res, 202, { message: 'Thank you. If it comes back into stock, we will email you once.' });
  }
  if (/^\/store\/stock-notices\/[^/]+\/cancel$/.test(p)) {
    return json(res, 200, { message: 'Done. We will not email you about that product.' });
  }
  /* Reviews: the published page, and the portal's own review and write. */
  {
    const m = p.match(/^\/store\/products\/([^/]+)\/reviews(\/mine)?$/);
    if (m) {
      const sp = storeProducts.find(x => x.slug === m[1]);
      if (!sp) return json(res, 404, { message: 'Not found.' });
      if (m[2]) {
        if (!auth) return json(res, 401, { message: 'Unauthenticated.' });
        return json(res, 200, { data: null, meta: { can_review: true, verified: sp.id === 1 } });
      }
      if (req.method === 'POST') {
        if (!auth) return json(res, 401, { message: 'Unauthenticated.' });
        return json(res, 202, { message: 'Thanks — we will publish it once it has been checked.' });
      }
      const sort = REVIEW_SORT[url.searchParams.get('sort')] ? url.searchParams.get('sort') : 'featured';
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const rows = storeReviews.filter(r => r.product_id === sp.id && r.status === 'published').sort(REVIEW_SORT[sort]);
      const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      for (const r of rows) distribution[r.rating]++;
      return json(res, 200, {
        data: rows.slice((page - 1) * 6, page * 6).map(publicReview),
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: page, last_page: Math.max(1, Math.ceil(rows.length / 6)), per_page: 6, total: rows.length,
          sort, average: sp.rating?.average ?? null, count: rows.length, distribution },
      });
    }
  }
  if (p.startsWith('/store/products/')) {
    const sp = storeProducts.find(x => x.slug === p.split('/')[3]);
    // `schema` on the detail read only, gated on `withSchema()` in Laravel.
    // The first product carries the §3 fields and a full block set; the
    // FAQ here is the one the marketing catalogue's twin already has.
    if (!sp) return json(res, 404, { message: 'Not found.' });
    const first = sp.id === 1;
    const spFaqs = first ? [{ id: 31, question: 'Can it be rack-mounted?', answer: 'Yes — one rack unit, and the brackets are in the box.' }] : [];
    return json(res, 200, { data: { ...sp, condition: 'new', schema: storeProductSchema(sp),
      warranty: first ? 'Limited lifetime warranty' : null,
      applications: first ? 'Wiring closets feeding up to two dozen desks, printers and access points.\nBranch offices uplinked to a central core over SFP.' : null,
      services: first ? [{ id: 2, title: services[1].title, slug: services[1].slug }] : [],
      // Videos (2026-09-26): a YouTube id with no poster, so the facade draws
      // its own panel — never YouTube's thumbnail.
      videos: first ? [{ kind: 'youtube', youtube_id: 'dQw4w9WgXcQ', title: 'Unboxing and first set-up' }] : [],
      ...answerContent(first ? STORE_PRODUCT_ANSWER_BLOCKS : [], spFaqs, {
        brand: sp.brand ? { name: sp.brand.name, path: `/store?brand=${sp.brand.slug}` } : null,
        category: sp.category ? { name: sp.category.name, path: `/store/categories/${sp.category.slug}` } : null,
        services: first ? [{ name: services[1].title, path: `/services/${services[1].slug}` }] : [],
        solutions: first ? [{ name: solutions[0].title, path: `/solutions/${solutions[0].slug}` }] : [],
        faq_count: spFaqs.length,
      }) } });
  }
  if (p === '/store/categories') return json(res, 200, { data: storeCategories });
  // The category's filters and their counts. `data: []` in a 200 for a
  // category that offers none, never a 404 (the `/menus/*` rule).
  if (/^\/store\/categories\/[^/]+\/facets$/.test(p)) {
    const sc = storeCategories.find(x => x.slug === p.split('/')[3]);
    if (!sc) return json(res, 404, { message: 'Not found.' });
    const selection = specSelection(url.searchParams);
    const inCategory = storeProducts.filter(x => x.category?.slug === sc.slug);
    const num = (s) => { const m = /^\s*(\d+(?:\.\d+)?)/.exec(s); return m ? Number(m[1]) : null; };
    const data = (sc.filter_specs || []).map((label) => {
      const key = specKeyOf(label);
      const counts = new Map();
      for (const product of inCategory.filter(x => matchesSpecs(x, selection, key))) {
        const seen = new Set();
        for (const [l, v] of specPairsOf(product)) {
          if (specKeyOf(l) !== key || seen.has(specKeyOf(v))) continue;
          seen.add(specKeyOf(v));
          const row = counts.get(specKeyOf(v)) || { value: String(v), key: specKeyOf(v), count: 0, selected: false };
          row.count += 1;
          counts.set(specKeyOf(v), row);
        }
      }
      for (const v of selection[key] || []) if (!counts.has(v)) counts.set(v, { value: v, key: v, count: 0, selected: true });
      const values = [...counts.values()].map(r => ({ ...r, selected: Boolean(selection[key]?.has(r.key)) }))
        .sort((a, b) => ((num(a.value) ?? Infinity) - (num(b.value) ?? Infinity)) || a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }));
      return { label, key, values };
    }).filter(f => f.values.length);
    return json(res, 200, { data, meta: { category: sc.slug, filtered: Object.keys(selection).length > 0 } });
  }
  if (p.startsWith('/store/categories/')) {
    const sc = storeCategories.find(x => x.slug === p.split('/')[3]);
    return sc ? json(res, 200, { data: { ...sc, ...answerContent([], [], { solutions: [{ name: solutions[0].title, path: `/solutions/${solutions[0].slug}` }] }) } })
              : json(res, 404, { message: 'Not found.' });
  }

  if (p === '/cart' || p.startsWith('/cart/')) {
    const { token, lines } = cartFor(req.headers['x-cart-token']);

    if (p === '/cart' && req.method === 'GET') return json(res, 200, { data: summarise(token, lines) });
    if (p === '/cart/contact' && req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const phone = typeof body.phone === 'string' ? body.phone.replace(/\s+/g, ' ').trim() : body.phone;
      if (phone && !/^(?:\+?91[-\s]?)?0?[6-9](?:[-\s]?\d){9}$/.test(phone)) {
        return json(res, 422, { message: 'That does not look like a mobile number.', errors: { phone: ['That does not look like a mobile number. Ten digits starting 6 to 9, with or without +91.'] } });
      }
      const current = cartContacts.get(token) ?? { email: null, phone: null };
      if ('email' in body) current.email = body.email ? String(body.email).trim().toLowerCase() : null;
      if ('phone' in body) current.phone = phone || null;
      cartContacts.set(token, current);
      return json(res, 200, { data: summarise(token, lines) });
    }
    if (p.startsWith('/cart/restore/') && req.method === 'GET') {
      return json(res, 404, { message: 'That basket is no longer available.' });
    }
    if (p === '/cart' && req.method === 'DELETE') {
      lines.length = 0;
      return json(res, 200, { data: summarise(token, lines) });
    }
    if (p === '/cart/items' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const product = storeProducts.find(x => x.id === Number(body.product_id));
      if (!product) return json(res, 422, { message: 'That product is not on sale.' });
      if (product.variations.length && !body.variation_id) {
        return json(res, 422, { message: 'Choose an option before adding this to your basket.' });
      }
      const existing = lines.find(l => l.product_id === product.id && l.variation_id === (Number(body.variation_id) || null));
      if (existing) existing.quantity += Number(body.quantity) || 1;
      else lines.push({ id: lines.length + 1, product_id: product.id, variation_id: Number(body.variation_id) || null, quantity: Number(body.quantity) || 1 });
      return json(res, 201, { data: summarise(token, lines), warning: null });
    }
    const lineId = Number(p.split('/')[3]);
    const index = lines.findIndex(l => l.id === lineId);
    if (index === -1) return json(res, 404, { message: 'Not found.' });
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (Number(body.quantity) === 0) lines.splice(index, 1);
      else lines[index].quantity = Number(body.quantity);
      return json(res, 200, { data: summarise(token, lines) });
    }
    if (req.method === 'DELETE') {
      lines.splice(index, 1);
      return json(res, 200, { data: summarise(token, lines) });
    }
  }

  /* The wishlist -- see the helpers beside the basket's. */
  if (p === '/wishlist' && req.method === 'GET') return json(res, 200, { data: wishlistSummary(wishlistFor(req)) });
  if (p === '/wishlist' && req.method === 'PATCH') {
    const found = wishlistFor(req);
    if (!found) return json(res, 404, { message: 'Not found.' });
    const body = await readJsonBody(req);
    if ('email' in body) {
      if (found.key === ACCOUNT_WISHLIST) {
        return json(res, 422, { message: 'Messages about this list go to your account’s address.', errors: { email: ['Messages about this list go to your account’s address.'] } });
      }
      found.list.email = body.email ? String(body.email).toLowerCase() : null;
      if (body.email) found.list.alertsOff = false;
    }
    if ('alerts' in body) found.list.alertsOff = !body.alerts;
    return json(res, 200, { data: wishlistSummary(found) });
  }
  if (p === '/wishlist/items' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const product = storeProducts.find((x) => x.id === Number(body.product_id));
    if (!product) return json(res, 422, { message: 'That product is not on sale.' });
    const found = wishlistFor(req, true);
    const variationId = Number(body.variation_id) || null;
    if (!found.list.lines.some((l) => l.product_id === product.id && l.variation_id === variationId)) {
      const variation = product.variations?.find((v) => v.id === variationId);
      found.list.lines.unshift({ id: ++wishSeq, product_id: product.id, variation_id: variationId, price_at_save: variation?.price_paise ?? product.price_paise, added_at: new Date().toISOString() });
    }
    return json(res, 201, { data: wishlistSummary(found) });
  }
  {
    const m = p.match(/^\/wishlist\/items\/(\d+)(\/move-to-basket)?$/);
    if (m) {
      const found = wishlistFor(req);
      const index = found ? found.list.lines.findIndex((l) => l.id === Number(m[1])) : -1;
      if (index === -1) return json(res, 404, { message: 'Not found.' });
      const line = found.list.lines[index];
      if (m[2] && req.method === 'POST') {
        const product = storeProducts.find((x) => x.id === line.product_id);
        if (!line.variation_id && product?.variations?.length) {
          return json(res, 422, { message: 'Choose an option before adding this to your basket.' });
        }
        const { token, lines } = cartFor(req.headers['x-cart-token']);
        const existing = lines.find((l) => l.product_id === line.product_id && l.variation_id === line.variation_id);
        if (existing) existing.quantity += 1;
        else lines.push({ id: lines.length + 1, product_id: line.product_id, variation_id: line.variation_id, quantity: 1 });
        found.list.lines.splice(index, 1);
        return json(res, 200, { data: wishlistSummary(found), cart: summarise(token, lines) });
      }
      if (!m[2] && req.method === 'DELETE') {
        found.list.lines.splice(index, 1);
        return json(res, 200, { data: wishlistSummary(found) });
      }
    }
  }
  if (/^\/wishlist\/alerts\/[^/]+\/stop$/.test(p)) {
    return json(res, 200, { message: 'Done. We will not email you about your wishlist again. Your list is still there.' });
  }

  if (p === '/blog') {
    // `?category=`, `?q=`, `?year=` and `?month=` all narrow the same list, as
    // ContentController::posts() does.
    let rows = posts;
    const cat = url.searchParams.get('category');
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    if (cat) rows = rows.filter(x => (x.categories ?? []).some(c => c.slug === cat));
    if (q) rows = rows.filter(x => `${x.title} ${x.excerpt} ${x.body}`.toLowerCase().includes(q));
    if (year) rows = rows.filter(x => String(new Date(x.published_at).getUTCFullYear()) === year);
    if (month) rows = rows.filter(x => String(new Date(x.published_at).getUTCMonth() + 1) === month);
    if (url.searchParams.get('order') === 'oldest') rows = [...rows].reverse();

    return json(res, 200, paginate(rows));
  }

  /*
   * Declared ABOVE `/blog/{slug}`, exactly as they are in routes/api.php.
   * Underneath it, "taxonomy" and "featured" are read as post slugs and 404 —
   * which is the routing bug `media/move` already has a test for.
   */
  if (p === '/blog/taxonomy') {
    const archive = [...new Set(posts.map(x => x.published_at.slice(0, 7)))]
      .sort().reverse()
      .map(ym => {
        const [y, m] = ym.split('-').map(Number);
        const total = posts.filter(x => x.published_at.startsWith(ym)).length;
        const label = new Date(Date.UTC(y, m - 1, 1))
          .toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        return { year: y, month: m, label, total };
      });

    return json(res, 200, {
      data: {
        // Only categories with something published in them, like the API.
        categories: blogCategories
          .map(c => ({ ...c, posts_count: posts.filter(x => (x.categories ?? []).some(k => k.id === c.id)).length }))
          .filter(c => c.posts_count > 0),
        archive,
      },
    });
  }

  if (p === '/blog/featured') {
    const limit = Number(url.searchParams.get('limit') ?? 4);
    // Featured first, falling back to the newest when nothing is ticked —
    // the same rule as the real endpoint, so the hero is never empty.
    const featured = posts.filter(x => x.is_featured);
    return json(res, 200, { data: (featured.length ? featured : posts).slice(0, limit) });
  }

  /*
   * Comments. Declared above `/blog/{slug}` so "comments" is not read as a post
   * slug — the same ordering routes/api.php uses.
   */
  {
    const m = p.match(/^\/blog\/([^/]+)\/comments$/);
    if (m) {
      if (req.method === 'POST') {
        // Always 202 and one sentence, honeypot or not: telling a bot it was
        // caught tells it what to change.
        return json(res, 202, { message: 'Thank you. Your comment will appear once it has been read.' });
      }
      // Nothing approved in the mock, which is the ordinary state of a new
      // install: comments arrive waiting and a person publishes them.
      return json(res, 200, { data: [], meta: { open: true, total: 0 } });
    }
  }

  if (p.startsWith('/blog/')) {
    const b2 = posts.find(x => x.slug === p.split('/')[2]);
    // The neighbours by date, the way Laravel's `neighbours()` answers.
    if (b2) {
      const byDate = [...posts].sort((a, b) => a.published_at < b.published_at ? -1 : 1);
      const i = byDate.indexOf(b2);
      const pick = (x) => x ? { title: x.title, slug: x.slug } : null;
      b2.previous = pick(byDate[i - 1]); b2.next = pick(byDate[i + 1]);
    }
    return b2
      ? json(res, 200, { data: { ...b2, schema: articleSchema(b2, 'Article', '/blog/'),
          ...answerContent([], [], b2.id === 1 ? { solutions: [{ name: solutions[2].title, path: `/solutions/${solutions[2].slug}` }] } : {}) } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/search') {
    /*
     * Same contract as SearchController: groups, each with a total that is
     * every match rather than the number returned, and an exact-SKU-first
     * order within products. Kept here so a build against the mock exercises
     * the real shape.
     */
    const term = (url.searchParams.get('q') || '').trim();
    if (term.length < 2) {
      return json(res, 200, { data: { groups: [], total: 0 }, meta: { q: term, min_length: 2 } });
    }
    const needle = term.toLowerCase();
    const hit = (s) => String(s || '').toLowerCase().includes(needle);
    const group = (type, label, prefix, rows, title, body, path) => {
      const found = rows.filter((r) => hit(r[title]) || hit(r[body]) || hit(r.sku));
      if (!found.length) return null;
      return {
        type, label, total: found.length,
        results: found.slice(0, 5).map((r) => ({
          title: r[title],
          excerpt: String(r[body] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || null,
          path: path ? path(r) : `${prefix}/${r.slug}`,
        })),
      };
    };
    const groups = [
      group('product', 'Products', '/products', products, 'name', 'short_description'),
      group('solution', 'Solutions', '/solutions', solutions, 'title', 'summary'),
      group('service', 'Services', '/services', services, 'title', 'summary'),
      group('industry', 'Industries', '/industries', industries, 'name', 'summary'),
      group('article', 'Knowledge base', '/knowledge-base', kbArticles, 'title', 'excerpt'),
      group('post', 'Blog', '/blog', posts, 'title', 'excerpt'),
      group('case_study', 'Case studies', '/case-studies', caseStudies, 'title', 'summary'),
      // Published events, past or upcoming (docs/events-contract.md).
      group('event', 'Events', '/events', events.filter((e) => e.status === 'published'), 'title', 'summary'),
      group('page', 'Pages', '', cmsPages, 'title', 'body', (r) => `/${r.slug}`),
    ].filter(Boolean);
    return json(res, 200, {
      data: { groups, total: groups.reduce((n, g) => n + g.total, 0) },
      meta: { q: term, min_length: 2 },
    });
  }
  /* Custom content types: the list, an archive, an entry. */
  if (p === '/content-types') return json(res, 200, { data: CONTENT_TYPES.map(publicType) });
  {
    const m = p.match(/^\/types\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
    if (m) {
      const t = CONTENT_TYPES.find((x) => x.slug === m[1]);
      if (!t) return json(res, 404, { message: 'Not found.' });
      if (!m[2]) {
        const page = paginate(ENTRIES.map(({ body, ...e }) => { void body; return publicEntry(e, t); }));
        page.meta.type = publicType(t);
        return json(res, 200, page);
      }
      const e = ENTRIES.find((x) => x.slug === m[2]);
      if (!e) return json(res, 404, { message: 'Not found.' });
      const path = `${t.path}/${e.slug}`;
      return json(res, 200, { data: { ...publicEntry(e, t), ...answerContent([], [], {}),
        schema: { '@context': 'https://schema.org', '@type': 'Article', headline: e.title, url: `https://www.technoware.in${path}` } } });
    }
  }
  if (p === '/pages') {
    // Summaries: the real endpoint omits body for exactly this reason.
    return json(res, 200, { data: cmsPages.map(({ id, title, slug, updated_at, seo }) => ({ id, title, slug, updated_at, seo })) });
  }
  if (p.startsWith('/pages/')) {
    const found = cmsPages.find(x => x.slug === p.split('/')[2]);
    // `blocks` is the console's; the public read carries `sections`, and only for a builder page.
    const pg = found && { ...found, blocks: undefined, sections: found.template === 'builder' ? found.sections : undefined };
    return pg ? json(res, 200, { data: { ...pg, ...answerContent([], pg.faqs || [], { faq_count: (pg.faqs || []).length }) } })
              : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/case-studies') return json(res, 200, { data: caseStudies });
  if (p.startsWith('/case-studies/')) {
    const c3 = caseStudies.find(x => x.slug === p.split('/')[2]);
    // A case study carries `entity` (and the gate's `faq_schema`) and no
    // blocks or FAQs of its own — the API's shape exactly.
    return c3
      ? json(res, 200, { data: { ...c3, schema: articleSchema(c3, 'Article', '/case-studies/'),
          entity: entityOf({ industries: c3.industry ? [{ name: c3.industry.name, path: `/industries/${c3.industry.slug}` }] : [],
            solutions: [{ name: solutions[0].title, path: `/solutions/${solutions[0].slug}` }] }) } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/knowledge-base') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const cat = url.searchParams.get('category');
    let rows = kbArticles;
    if (q) {
      // Mirrors KnowledgeArticle::scopeSearch — prose, tags, and a
      // punctuation-stripped title so "wifi" matches "Wi-Fi".
      const compact = q.replace(/[^a-z0-9]/gi, '');
      rows = rows.filter(x => {
        const hay = (x.title + ' ' + x.excerpt + ' ' + x.body + ' ' + (x.tags || []).join(' ')).toLowerCase();
        const flat = x.title.toLowerCase().replace(/[-\s.]/g, '');
        return hay.includes(q) || (compact.length >= 3 && flat.includes(compact));
      });
    }
    if (cat) rows = rows.filter(x => x.category?.slug === cat);
    return json(res, 200, paginate(rows));
  }
  if (p.startsWith('/knowledge-base/')) {
    const k2 = kbArticles.find(x => x.slug === p.split('/')[2]);
    return k2
      ? json(res, 200, { data: { ...k2, schema: articleSchema(k2, 'TechArticle', '/knowledge-base/'),
          ...answerContent(k2.id === 1 ? KB_ANSWER_BLOCKS : [], [],
            k2.id === 1 ? { services: [{ name: services[2].title, path: `/services/${services[2].slug}` }] } : {}) } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/enquiries' && req.method === 'POST') return json(res, 201, { message: 'Thanks', data: { id: 1 } });
  // Online meetings (docs/meetings-contract.md): the options, the slots in
  // both forms, a booking, and the guest link scoped by its token.
  if (p === '/meetings/options') {
    return json(res, 200, { data: {
      enabled: true,
      types: meetingTypes.filter((t) => t.is_active && t.is_public).map((t) => ({ id: t.id, name: t.name, slug: t.slug, description: t.description, minutes: t.minutes })),
      step: 30, min_notice_hours: 4, max_days: 30, min_date: isoDay(1), max_date: isoDay(30), holidays: [],
      timezone: 'Asia/Kolkata', timezone_label: 'IST', agenda_max: 2000,
    } });
  }
  if (p === '/meetings/slots') {
    const type = meetingTypes.find((t) => t.slug === url.searchParams.get('type'));
    if (!type) return json(res, 422, { message: 'Choose a kind of meeting.', errors: { type: ['Choose a kind of meeting.'] } });
    const date = url.searchParams.get('date');
    if (date) {
      return json(res, 200, { data: { type: type.slug, date, timezone: 'Asia/Kolkata', timezone_label: 'IST', slots: meetingSlotsFor(date, type.minutes) } });
    }
    const from = url.searchParams.get('from') ?? isoDay(0);
    const to = url.searchParams.get('to') ?? isoDay(30);
    const days = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const ymd = d.toISOString().slice(0, 10);
      days.push({ date: ymd, count: meetingSlotsFor(ymd, type.minutes).length });
    }
    return json(res, 200, { data: { type: type.slug, from, to, timezone: 'Asia/Kolkata', timezone_label: 'IST', days } });
  }
  if (p === '/meetings' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (!body.start) return json(res, 422, { message: 'Choose a time.', errors: { start: ['Choose a time.'] } });
    if (String(body.start).includes('T15:30')) {
      return json(res, 422, { message: 'That time was just taken — choose another.', errors: { start: ['That time was just taken — choose another.'] } });
    }
    const ymd = String(body.start).slice(0, 10);
    const hm = String(body.start).slice(11, 16);
    return json(res, 201, { message: 'Your meeting is booked.', data: {
      reference: 'MT-2026-00001', access_token: MEETING_TOKEN, starts_at: body.start,
      date_label: meetingDateLabel(ymd), time_label: `${hm} – ${addMinutes(hm, 30)}`, timezone: 'IST',
    } });
  }
  const gm = p.match(/^\/meetings\/([A-Z][A-Z0-9]{1,5}-\d{4}-\d{5})(\/cancel|\/reschedule)?$/);
  if (gm) {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const token = url.searchParams.get('token') ?? body.token;
    const m = meetingOf(gm[1]);
    if (!m || token !== MEETING_TOKEN) return json(res, 404, { message: 'Not found.' });
    if (req.method === 'POST' && gm[2] === '/cancel') cancelMeeting(m);
    // The API's "just taken" answer on a move too — a start at 15:30 is taken.
    if (req.method === 'POST' && gm[2] === '/reschedule' && String(body.start ?? '').includes('T15:30')) {
      return json(res, 422, { message: 'That time was just taken — choose another.', errors: { start: ['That time was just taken — choose another.'] } });
    }
    if (req.method === 'POST' && gm[2] === '/reschedule' && body.start) moveMeeting(m, body.start);
    return json(res, 200, { data: customerMeeting(m), ...(req.method === 'POST' ? { message: 'Done.' } : {}) });
  }
  /* Events (docs/events-contract.md): the list, an event's page, what its
     registration panel asks after mount, its calendar file, a registration,
     and the registrant's own link. Published events only — a draft or an
     archived one is a 404 everywhere here — and `online_url` is on none of
     them. The registrant's routes are matched first: `registrations` would
     otherwise be read as an event's slug. */
  {
    const m = p.match(/^\/events\/registrations\/([^/]+)(\/cancel)?$/);
    if (m) {
      const r = eventRegistrations.find((x) => x.id === eventTokenRegistration);
      const e = r ? eventOf(r.event_id) : null;
      // A token that is not 64 hex, or nobody's, is a 404.
      if (!/^[0-9a-f]{64}$/.test(m[1]) || m[1] !== EVENT_TOKEN || !r || !e) return json(res, 404, { message: 'Not found.' });
      if (m[2]) {
        if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed.' });
        if (eventHasStarted(e) || r.status === 'attended' || r.status === 'no_show') {
          return invalid(res, 'registration', 'This event has started, so the registration can no longer be cancelled.');
        }
        // Idempotent for one already cancelled.
        if (r.status !== 'cancelled') Object.assign(r, { status: 'cancelled', cancelled_at: new Date().toISOString() });
      }
      return json(res, 200, { data: registrantView(r, e) });
    }
  }
  if (p === '/events' && req.method === 'GET') {
    const past = url.searchParams.get('when') === 'past';
    const format = url.searchParams.get('format');
    const featured = url.searchParams.get('featured') === '1';
    // Upcoming soonest first; past newest first.
    const rows = events
      .filter((e) => e.status === 'published' && eventIsPast(e) === past
        && (!format || e.format === format) && (!featured || e.is_featured))
      .sort((a, b) => (past ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)));
    const page = paginate(rows.map(publicEvent));
    page.meta.per_page = 12;
    return json(res, 200, page);
  }
  {
    const m = p.match(/^\/events\/([a-z0-9-]+)(\/availability|\/calendar|\/register)?$/);
    if (m) {
      const e = events.find((x) => x.slug === m[1] && x.status === 'published');
      if (!e) return json(res, 404, { message: 'Not found.' });

      if (m[2] === '/availability') {
        // Never cached: the page around it is, and this is the part that moves.
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ data: eventAvailability(e) }));
      }

      if (m[2] === '/calendar') {
        // The event as an .ics, with no join link in it.
        const stamp = (wall) => `${wall.replace(/[-:]/g, '')}00`;
        const ics = [
          'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Technoware//Events//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
          `UID:event-${e.id}@technoware.test`, `DTSTART;TZID=Asia/Kolkata:${stamp(e.starts_at)}`,
          ...(e.ends_at ? [`DTEND;TZID=Asia/Kolkata:${stamp(e.ends_at)}`] : []),
          `SUMMARY:${e.title.replace(/([,;])/g, '\\$1')}`,
          ...(e.format !== 'online' && e.venue_name ? [`LOCATION:${e.venue_name.replace(/([,;])/g, '\\$1')}`] : []),
          'END:VEVENT', 'END:VCALENDAR',
        ].join('\r\n');
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename=${e.slug}.ics` });
        return res.end(`${ics}\r\n`);
      }

      if (m[2] === '/register') {
        if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed.' });
        const body = await readJsonBody(req);
        const seats = body.seats === undefined || body.seats === null || body.seats === '' ? 1 : Number(body.seats);
        const done = (status) => ({
          message: status === 'waitlisted'
            ? `This event is full, so you are on the waiting list. We have emailed ${body.email} and will write again if a place opens.`
            : `You are registered. We have emailed your confirmation to ${body.email}.`,
          // No manage link here: it is in the confirmation email only (docs/events.md).
          data: { status, seats },
        });
        // A filled honeypot: the ordinary success answer, and nothing stored.
        if (body.website) return json(res, 201, done('confirmed'));
        if (!body.name) return invalid(res, 'name', 'Please tell us your name.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email ?? '')) return invalid(res, 'email', 'Enter a valid email address.');
        if (!Number.isInteger(seats) || seats < 1 || seats > e.max_seats) {
          return invalid(res, 'seats', `You can register between 1 and ${e.max_seats} seats.`);
        }
        const state = eventAvailability(e);
        if (state.state === 'none' || state.state === 'external') return invalid(res, 'registration', 'This event does not take registrations here.');
        if (state.message) return invalid(res, 'registration', state.message);

        // The typed address proves nothing, so a repeat is answered exactly as a
        // stranger would be and a live registration is left as it is; only a
        // cancelled one is revived, like a newcomer (docs/events.md).
        const found = eventRegistrations.find((r) => r.event_id === e.id && r.email.toLowerCase() === String(body.email).toLowerCase());
        const left = eventCounts(e).seats_left;
        let status = 'confirmed';
        if (left !== null && seats > left) {
          if (e.waitlist_enabled) status = 'waitlisted';
          else return invalid(res, 'seats', `Only ${left} ${left === 1 ? 'seat is' : 'seats are'} left.`);
        }
        if (found && found.status !== 'cancelled') return json(res, 201, done(status));
        const again = found;
        const fields = {
          name: body.name, email: body.email, phone: body.phone ?? null, company: body.company ?? null,
          seats, note: body.note ?? null, status, cancelled_at: null,
        };
        const r = again
          ? Object.assign(again, fields)
          : { id: Math.max(30, ...eventRegistrations.map((x) => x.id)) + 1, event_id: e.id, ...fields, staff_note: null,
              customer_id: null, lead_id: 1, source: 'public', reminded_at: null, created_at: new Date().toISOString() };
        if (!again) eventRegistrations.push(r);
        eventTokenRegistration = r.id;
        return json(res, 201, done(status));
      }

      return json(res, 200, { data: publicEventDetail(e) });
    }
  }
  // Engineer visits (docs/visits.md): what the form offers, a request, and the
  // guest link — scoped by its token, a wrong one the same 404 as Laravel's.
  if (p === '/visits/options') {
    return json(res, 200, { data: {
      enabled: true, windows: visitWindows, days: [1, 2, 3, 4, 5, 6], min_date: isoDay(1), max_date: isoDay(30),
      holidays: [], max_preferred: 3,
      services: services.map((x) => ({ id: x.id, title: x.title, slug: x.slug, location_ids: [] })),
      solutions: solutions.map((x) => ({ id: x.id, title: x.title, slug: x.slug })),
      locations: [],
    } });
  }
  if (p === '/visits' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (!Array.isArray(body.preferred) || body.preferred.length === 0) {
      return json(res, 422, { message: 'Choose at least one date and time that suits you.', errors: { preferred: ['Choose at least one date and time that suits you.'] } });
    }
    return json(res, 201, { message: 'Thank you', data: { reference: 'TV-2026-00001', access_token: VISIT_TOKEN } });
  }
  const gv = p.match(/^\/visits\/([\w-]+)(\/cancel|\/reschedule)?$/);
  if (gv) {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const token = url.searchParams.get('token') ?? body.token;
    const v = visitRequests.find((x) => x.reference === gv[1]);
    if (!v || token !== VISIT_TOKEN) return json(res, 404, { message: 'Not found.' });
    return json(res, 200, { data: customerVisit(v) });
  }
  // The redirect table the proxy holds in memory, and the per-path lookup
  // it calls on a hit to record it. `/old-privacy` is a CMS page rename at
  // the root — the case the old prefix list could not cover.
  const REDIRECTS = [
    { from: '/solutions/old-networking', to: '/solutions/networking', status: 301 },
    { from: '/old-privacy', to: '/privacy', status: 301 },
  ];
  // `meta.coming_soon` is what the proxy reads for the coming-soon page (0.122.0).
  if (p === '/redirects') return json(res, 200, { data: REDIRECTS, meta: { coming_soon: false, media_cdn: null } });
  if (p === '/redirects/lookup') {
    const hit = REDIRECTS.find((r) => r.from === url.searchParams.get('path'));
    return hit ? json(res, 200, { data: { to: hit.to, status: hit.status } }) : json(res, 404, { data: null });
  }

  if (!auth) return json(res, 401, { message: 'Unauthenticated.' });

  if (p === '/auth/me') return json(res, 200, { data: customer, meta: { impersonated: bearer === IMPERSONATION_TOKEN } });
  if (p === '/messaging/preferences') {
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      return json(res, 200, { data: { ...messagingPreferences, channels: messagingPreferences.channels.map((c) => (c.channel in body ? { ...c, opted_in: Boolean(body[c.channel]) } : c)) }, message: 'Your message preferences are saved.' });
    }
    return json(res, 200, { data: messagingPreferences });
  }
  if (p === '/auth/profile' && req.method === 'PATCH') return json(res, 200, { data: customer });
  if (p === '/my/meetings') {
    const mine = meetings.filter((m) => m.customer_id === customer.id).map(customerMeeting);
    return json(res, 200, { data: mine, links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, last_page: 1, per_page: 20, total: mine.length } });
  }
  const mym = p.match(/^\/my\/meetings\/([A-Z][A-Z0-9]{1,5}-\d{4}-\d{5})(\/cancel|\/reschedule)?$/);
  if (mym) {
    const m = meetings.find((x) => x.reference === mym[1] && x.customer_id === customer.id);
    if (!m) return json(res, 404, { message: 'Not found.' });
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    if (req.method === 'POST' && mym[2] === '/cancel') cancelMeeting(m);
    // The API's "just taken" answer on a move too — a start at 15:30 is taken.
    if (req.method === 'POST' && mym[2] === '/reschedule' && String(body.start ?? '').includes('T15:30')) {
      return json(res, 422, { message: 'That time was just taken — choose another.', errors: { start: ['That time was just taken — choose another.'] } });
    }
    if (req.method === 'POST' && mym[2] === '/reschedule' && body.start) moveMeeting(m, body.start);
    return json(res, 200, { data: customerMeeting(m), ...(req.method === 'POST' ? { message: 'Done.' } : {}) });
  }
  if (p === '/my/visits') {
    const mine = visitRequests.filter((v) => v.customer_id === customer.id).map(customerVisit);
    return json(res, 200, { data: mine, links: { first: null, last: null, prev: null, next: null }, meta: { current_page: 1, last_page: 1, per_page: 20, total: mine.length } });
  }
  const mv = p.match(/^\/my\/visits\/([\w-]+)(\/cancel|\/reschedule)?$/);
  if (mv) {
    const v = visitRequests.find((x) => x.reference === mv[1] && x.customer_id === customer.id);
    return v ? json(res, 200, { data: customerVisit(v) }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/tickets/summary') return json(res, 200, { data: { open: 1, in_progress: 1, pending: 1, resolved: 1, closed: 1 } });

  if (p === '/tickets' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    const data = status ? tickets.filter(t => t.status === status) : tickets;
    return json(res, 200, {
      data, links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
    });
  }

  const m = p.match(/^\/tickets\/([\w-]+)$/);
  if (m) {
    const t = tickets.find(x => x.reference === m[1]);
    if (!t) return json(res, 404, { message: 'Not found.' });
    return json(res, 200, { data: { ...t, customer, messages: messages[t.reference] || [] } });
  }

  // The customer's verdict on a staff reply: stars, or a report. Only a
  // visible staff reply on the ticket; anything else is a 404, as on Laravel.
  const v = p.match(/^\/tickets\/([\w-]+)\/messages\/(\d+)\/(rating|report)$/);
  if (v && req.method === 'POST') {
    const list = messages[v[1]] || [];
    const msg = list.find((x) => x.id === Number(v[2]) && x.author.type === 'staff' && !x.is_internal);
    if (!msg) return json(res, 404, { message: 'Not found.' });
    const body = await readJsonBody(req);
    if (v[3] === 'rating') {
      const rating = Number(body.rating);
      if (!(rating >= 1 && rating <= 5)) return json(res, 422, { message: 'The rating must be between 1 and 5.', errors: { rating: ['The rating must be between 1 and 5.'] } });
      Object.assign(msg, { rating, rated_at: new Date().toISOString() });
    } else {
      const reason = String(body.reason ?? '').trim();
      if (reason.length < 5) return json(res, 422, { message: 'The reason must be at least 5 characters.', errors: { reason: ['The reason must be at least 5 characters.'] } });
      Object.assign(msg, { report_reason: reason, reported_at: msg.reported_at ?? new Date().toISOString() });
    }
    return json(res, 200, { data: msg });
  }

  return json(res, 404, { message: 'Not found.' });
}).listen(MOCK_PORT, () => console.log(`mock api on ${MOCK_PORT}`));
