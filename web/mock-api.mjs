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
  return { period: key, bucket, points };
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
    leads: { new: 2, open: 3, overdue: 1, unassigned: 1 },
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

const services = [
  { id:1, title:'Domain registration', slug:'domains', icon:'globe', summary:'Register, transfer and renew domains with DNS managed correctly from day one.' },
  { id:2, title:'Web hosting', slug:'web-hosting', icon:'cloud', summary:'Linux and Windows hosting with backups and SSL included.' },
  { id:3, title:'Business email', slug:'business-email', icon:'mail', summary:'Professional mailboxes on your own domain.' },
];

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
  { id: 1, name: 'Switches', slug: 'switches', description: 'Managed and unmanaged access switches.', icon_url: 'http://127.0.0.1:8899/storage/mock/switch-icon.png', image_url: null, image_focus: null, product_count: 2 },
  { id: 2, name: 'Licences', slug: 'licences', description: 'Software and security licences, delivered by activation code.', icon_url: null, image_url: null, image_focus: null, product_count: 1 },
];

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
    fields: [
      { id:1, kind:'text', name:'name', label:'Your name', placeholder:null, help:null, required:true, options:[], width:'half' },
      { id:2, kind:'email', name:'email', label:'Work email', placeholder:null, help:null, required:true, options:[], width:'half' },
      { id:3, kind:'tel', name:'phone', label:'Phone', placeholder:null, help:null, required:false, options:[], width:'half' },
      { id:4, kind:'text', name:'company', label:'Company', placeholder:null, help:null, required:false, options:[], width:'half' },
      { id:5, kind:'text', name:'subject', label:'Subject', placeholder:null, help:null, required:false, options:[], width:'full' },
      { id:6, kind:'textarea', name:'message', label:'How can we help?', placeholder:null, help:null, required:true, options:[], width:'full' },
    ],
  },
];

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
  enabled: true, configured: true, model: 'gpt-4o-mini',
  models: [{ value: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Cheapest and quickest.' }],
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
const ADMIN_CMS = [
  { base: '/admin/solutions', rows: solutions, detail: (r) => adminOf(r, r.id === 1
    ? { problem_statement: solutionDetail.problem_statement, overview: solutionDetail.overview,
        benefits: solutionDetail.benefits, technologies: solutionDetail.technologies,
        hero_image_path: null, product_ids: [1], industry_ids: [4],
        faqs: solutionDetail.faqs.map(({ question, answer }) => ({ question, answer })),
        answer_blocks: SOLUTION_ANSWER_BLOCKS }
    : { problem_statement: null, overview: null, benefits: [], technologies: [], hero_image_path: null, product_ids: [], industry_ids: [] }) },
  { base: '/admin/services', rows: services, detail: (r) => adminOf(r, { body: null }) },
  { base: '/admin/industries', rows: industries, detail: (r) => adminOf(r, { body: null, solution_ids: [] }) },
  { base: '/admin/product-categories', rows: productCategories, detail: (r) => adminOf(r, { image_path: null, parent_name: null }) },
  { base: '/admin/brands', rows: brands, detail: (r) => adminOf(r, { logo_path: null, is_featured: false, product_count: 1 }) },
  { base: '/admin/products', rows: products, detail: (r) => adminOf(r, {
      brand_id: r.brand?.id ?? null, brand_name: r.brand?.name ?? null,
      product_category_id: r.category?.id ?? null, category_name: r.category?.name ?? null,
      image_urls: [], datasheet_path: null, is_featured: false, solution_ids: [1], related_product_ids: [],
      faqs: (r.faqs || []).map(({ question, answer }) => ({ question, answer })) }) },
  { base: '/admin/pages', rows: cmsPages, detail: (r) => adminOf(r) },
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
  if (p.startsWith('/newsletter/unsubscribe/')) {
    return req.method === 'POST'
      ? json(res, 200, { data: { email: 'someone@example.test' }, message: 'You have been unsubscribed.' })
      : json(res, 200, { data: { email: 'someone@example.test', already: false } });
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
    motion_reveal: 'lift', motion_buttons: 'lift', motion_page: 'none', motion_loader: 'none', motion_splash: '0', motion_hero: 'grid',
    login_backdrop: 'image', login_intensity: 'medium', login_speed: 'normal', stats_animation: 'count',
    // The site theme. CI builds against this mock, and `classic` is also the
    // fallback for a missing key — so leaving it out would hide nothing and
    // prove nothing. It is here so the console's Themes screen has a row.
    site_theme: 'classic',
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
      return json(res, 200, { data: lead });
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

    /* The admin CMS indexes and details, from `ADMIN_CMS`. */
    for (const entity of ADMIN_CMS) {
      if (p === entity.base && req.method === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const rows = q ? entity.rows.filter((r) => (r.title || r.name || '').toLowerCase().includes(q)) : entity.rows;
        const page = paginate(rows.map((r) => entity.detail(r)));
        page.meta.answer_block_kinds = ANSWER_BLOCK_KINDS;
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
        ai: { enabled: false, configured: false, model: 'gpt-4o-mini', models: [], actions: [], today: { runs: 0, cap: 100, remaining: 100, reached: false } },
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
        attention: { awaiting_payment: 0, awaiting_dispatch: 0, awaiting_codes: 0, refund_requested: 0, out_of_stock: 0, codes_exhausted: 0, failed_payments: 0 },
        funnel: { product_views: null, paid_orders: 0, views_to_orders: null },
        // Null, not zeros: the mock never reminds anybody about a basket.
        recovered: null,
        series, recent: [], low_stock: [], codes_low: [],
        most_wished: [{ id: storeProducts[0].id, name: storeProducts[0].name, wishes: 3 }],
      } });
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
      return json(res, 200, { data: { ...t, customer, messages: messages[t.reference] || [] } });
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
    if (!f || !f.fields.length) return json(res, 404, { message: 'Not found.' });
    if (req.method === 'POST') return json(res, 201, { message: f.success_message, data: { id: 1 } });
    return json(res, 200, { data: f });
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
    const accessToken = 'mock-order-token-'.padEnd(64, '0');

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
      ...answerContent(first ? STORE_PRODUCT_ANSWER_BLOCKS : [], spFaqs, {
        brand: sp.brand ? { name: sp.brand.name, path: `/store?brand=${sp.brand.slug}` } : null,
        category: sp.category ? { name: sp.category.name, path: `/store/categories/${sp.category.slug}` } : null,
        services: first ? [{ name: services[1].title, path: `/services/${services[1].slug}` }] : [],
        solutions: first ? [{ name: solutions[0].title, path: `/solutions/${solutions[0].slug}` }] : [],
        faq_count: spFaqs.length,
      }) } });
  }
  if (p === '/store/categories') return json(res, 200, { data: storeCategories });
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
      group('page', 'Pages', '', cmsPages, 'title', 'body', (r) => `/${r.slug}`),
    ].filter(Boolean);
    return json(res, 200, {
      data: { groups, total: groups.reduce((n, g) => n + g.total, 0) },
      meta: { q: term, min_length: 2 },
    });
  }
  if (p === '/pages') {
    // Summaries: the real endpoint omits body for exactly this reason.
    return json(res, 200, { data: cmsPages.map(({ id, title, slug, updated_at, seo }) => ({ id, title, slug, updated_at, seo })) });
  }
  if (p.startsWith('/pages/')) {
    const pg = cmsPages.find(x => x.slug === p.split('/')[2]);
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
  // The redirect table the proxy holds in memory, and the per-path lookup
  // it calls on a hit to record it. `/old-privacy` is a CMS page rename at
  // the root — the case the old prefix list could not cover.
  const REDIRECTS = [
    { from: '/solutions/old-networking', to: '/solutions/networking', status: 301 },
    { from: '/old-privacy', to: '/privacy', status: 301 },
  ];
  if (p === '/redirects') return json(res, 200, { data: REDIRECTS });
  if (p === '/redirects/lookup') {
    const hit = REDIRECTS.find((r) => r.from === url.searchParams.get('path'));
    return hit ? json(res, 200, { data: { to: hit.to, status: hit.status } }) : json(res, 404, { data: null });
  }

  if (!auth) return json(res, 401, { message: 'Unauthenticated.' });

  if (p === '/auth/me') return json(res, 200, { data: customer, meta: { impersonated: bearer === IMPERSONATION_TOKEN } });
  if (p === '/auth/profile' && req.method === 'PATCH') return json(res, 200, { data: customer });
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
}).listen(8899, () => console.log('mock api on 8899'));
