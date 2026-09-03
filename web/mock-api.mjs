import { createServer } from 'node:http';

/* Mock of the Laravel API, implementing exactly the /api/v1 contract the
   frontend was written against. Used to verify the portal end-to-end while
   the real backend cannot be booted in this sandbox. */

const TOKEN = 'mock-token-abc123';
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
  is_overdue: false, due_at: '2026-08-19T09:00:00Z', assigned_to: null,
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

function buildAdminDashboard() {
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
  };
}

const tickets = [
  mk({ id: 1, reference: 'TW-2026-00021', subject: 'AP-04 dropping clients in the warehouse',
    status: 'in_progress', status_label: 'In progress', priority: 'high', priority_label: 'High',
    is_overdue: true, assigned_to: { id: 3, name: 'S. Rao' },
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
    { id: 11, body: 'Thanks — I can see AP-04 flapping in the controller logs. Could you confirm whether the racking in aisle 3 was moved during the power cut work?', is_internal: false,
      author: { id: 3, name: 'S. Rao', type: 'staff' }, attachments: [], created_at: '2026-08-17T11:40:00Z' },
    { id: 12, body: 'Yes — the contractors moved two pallet racks closer to that corner on Tuesday afternoon.', is_internal: false,
      author: { id: 1, name: 'Neil Basu', type: 'customer' },
      attachments: [{ id: 5, filename: 'warehouse-layout.pdf', url: '#', size: 284000, mime: 'application/pdf' }],
      created_at: '2026-08-17T14:02:00Z' },
    { id: 14, body: 'Checked the install photos — the AP is mounted on a steel purlin, not the ceiling grid. Flagging in case the resurvey needs a bracket swap too.', is_internal: true,
      author: { id: 5, name: 'M. Iyer', type: 'staff' }, attachments: [], created_at: '2026-08-17T15:20:00Z' },
    { id: 13, body: 'That will be it. Metal racking that close to an AP kills the 5 GHz coverage. I am scheduling a site visit Thursday to reposition AP-04 and re-survey that aisle.', is_internal: false,
      author: { id: 3, name: 'S. Rao', type: 'staff' }, attachments: [], created_at: '2026-08-18T09:15:00Z' },
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
].map(s => ({ ...s, hero_image:null, hero_image_alt:null, status:'published' }));

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
  { id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null, product_count:1 },
  { id:2, name:'Firewalls', slug:'firewalls', description:'NGFW & UTM appliances', icon:'firewall', parent_id:null, product_count:0 },
];

/* Brands that have a published product — the same restriction Laravel applies,
   because a facet that can only return nothing is worse than an absent one. */
const brands = [
  { id:1, name:'Cisco', slug:'cisco', logo:null },
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
  offers: { '@type': 'Offer', url: `https://www.technoware.in/products/${p.slug}`, priceCurrency: 'INR', seller: publisher() },
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
  { id: 1, name: 'Switches', slug: 'switches', description: 'Managed and unmanaged access switches.', image_url: null, product_count: 2 },
  { id: 2, name: 'Licences', slug: 'licences', description: 'Software and security licences, delivered by activation code.', image_url: null, product_count: 1 },
];

const storeProducts = [
  { id: 1, name: 'CBS350-24T-4G Managed Switch', slug: 'cbs350-24t-4g', sku: 'CBS350-24T-4G',
    type: 'physical',
    short_description: '24-port Gigabit managed switch with 4 SFP uplinks.',
    description: '<p>A managed access switch for wiring closets that need proper VLAN support.</p>',
    specifications: { Ports: '24 x 1G', Uplinks: '4 x SFP', 'Rack units': '1U' },
    features: ['Layer 3 lite static routing', 'Fanless', 'Limited lifetime warranty'],
    images: [], image_alts: [],
    price_paise: 4720000, compare_at_paise: 5310000,
    in_stock: true, returnable: true, is_featured: true,
    category: storeCategories[0], brand: { id: 1, name: 'Cisco', slug: 'cisco', logo: null },
    variations: [
      { id: 11, name: '24-Port', sku: 'CBS350-24T', options: { Ports: '24' }, price_paise: 4720000, in_stock: true, image_url: null, image_alt: null },
      { id: 12, name: '48-Port', sku: 'CBS350-48T', options: { Ports: '48' }, price_paise: 7080000, in_stock: true, image_url: null, image_alt: null },
    ] },
  { id: 2, name: 'Unmanaged 8-Port Switch', slug: 'unmanaged-8-port-switch', sku: 'SG108',
    type: 'physical',
    short_description: 'Eight Gigabit ports, no configuration, metal case.',
    description: null, specifications: {}, features: [],
    images: [], image_alts: [],
    price_paise: 129900, in_stock: false, returnable: true,
    category: storeCategories[0], brand: null, variations: [] },
  { id: 3, name: 'Endpoint Security 1 Year', slug: 'endpoint-security-1-year', sku: 'EPS-1Y',
    type: 'digital',
    short_description: 'One year of endpoint protection, delivered as an activation code.',
    description: null, specifications: {}, features: [],
    images: [], image_alts: [],
    price_paise: 236000, in_stock: true, returnable: false,
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

const cartFor = (token) => {
  const key = token && carts.has(token) ? token : `mock-cart-${carts.size + 1}`;
  if (!carts.has(key)) carts.set(key, []);
  return { token: key, lines: carts.get(key) };
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
  };
};

const products = [
  { id:1, name:'Catalyst CBS350-24T-4G', slug:'cisco-cbs350-24t-4g', sku:'CBS350-24T-4G',
    short_description:'24-port Gigabit managed switch with 4 SFP uplinks.',
    description:'<p>A managed access switch for wiring closets that need Layer 3 lite, static routing and proper VLAN support without a full enterprise licence.</p>',
    specifications:{ 'Ports':'24 × 10/100/1000', 'Uplinks':'4 × 1G SFP', 'Switching capacity':'56 Gbps', 'Rack units':'1U' },
    features:['Layer 3 lite static routing','802.1X port authentication','Rack-mount, fanless','Limited lifetime warranty'],
    images:[], image_alts:[], datasheet_url:null, status:'published',
    brand:{ id:1, name:'Cisco', slug:'cisco', logo:null },
    category:{ id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null },
    related_products:[], related_solutions:[{ id:1, title:'Enterprise networking', slug:'networking', icon:'network', summary:'', hero_image:null, hero_image_alt:null, status:'published' }],
    faqs:[{ id:9, question:'Does this support PoE?', answer:'No — this is the non-PoE variant. Ask us about the CBS350-24P if you need to power access points or phones.' }],
    seo:null },
];


const forms = [
  {
    id: 1, name: 'Contact', slug: 'contact', status: 'published',
    submit_label: 'Send enquiry',
    success_message: 'Thank you — we have your enquiry and will be in touch shortly.',
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

const sliders = [
  {
    id: 1, name: 'Homepage hero', slug: 'homepage-hero', status: 'published',
    autoplay: true, interval_ms: 6000,
    slides: [
      { id: 1, kind: 'image', url: null, poster_url: null, youtube_id: null,
        alt: 'A rack of network switches', heading: null, caption: null,
        link_url: null, link_label: null },
      { id: 2, kind: 'youtube', url: null, poster_url: null, youtube_id: 'dQw4w9WgXcQ',
        alt: 'Product overview', heading: 'Watch the walkthrough', caption: null,
        link_url: null, link_label: null },
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
      { id: 1, url: null, alt: 'A core switch stack in a wall-mounted rack',
        title: 'Core switch stack', subtitle: 'Salt Lake, 2026', link_url: null, group: 'networking' },
      { id: 2, url: null, alt: 'Fibre patching in a comms room',
        title: 'Fibre patching', subtitle: 'Howrah', link_url: null, group: 'networking' },
      { id: 3, url: null, alt: 'A camera on a warehouse gantry',
        title: 'Gantry camera run', subtitle: 'New Town', link_url: null, group: 'surveillance' },
      // Ungrouped on purpose: it must appear under All and under no tab, which
      // is the case the tab filter is easiest to get wrong.
      { id: 4, url: null, alt: 'A UPS cabinet', title: 'UPS cabinet', subtitle: null,
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
    cover_image:null, cover_image_alt:null, published_at:'2026-08-12T09:00:00Z', reading_minutes:7, author:{ name:'S. Rao' }, seo:null,
    is_featured:true, categories:[blogCategories[1], blogCategories[0]] },
  { id:2, title:'Sizing a UPS for a small server room', slug:'sizing-a-ups',
    excerpt:'Load calculation, runtime targets and the mistake almost everyone makes with power factor.',
    body:'<p>Most undersized UPS installations come from reading the wrong number off the label.</p>',
    cover_image:null, cover_image_alt:null, published_at:'2026-08-04T09:00:00Z', reading_minutes:5, author:{ name:'A. Fernandes' }, seo:null,
    is_featured:false, categories:[blogCategories[2]] },
];

const caseStudies = [
  { id:1, title:'Six-plant network consolidation', slug:'six-plant-consolidation',
    client_name:'Meridian Foods', summary:'Replaced six independently-built site networks with one standardised design, central firewall policy and site-to-site VPN.',
    body:'<p>Each plant had been wired by whichever local contractor was available at the time.</p><h2>What we changed</h2><p>One switching standard, one addressing plan, one firewall policy pushed from the centre.</p>',
    results:[{value:'-71%',label:'Network tickets'},{value:'6 wks',label:'Cutover'},{value:'6',label:'Sites standardised'},{value:'Zero',label:'Production stoppages'}],
    cover_image:null, cover_image_alt:null, industry:{ id:4, name:'Manufacturing', slug:'manufacturing', summary:null, icon:'factory' }, seo:null },
  { id:2, title:'Hospital Wi-Fi & device segmentation', slug:'hospital-wifi',
    client_name:null, summary:'High-density wireless across four floors with clinical devices, staff and guest traffic properly separated.',
    body:'<p>Clinical devices cannot share a broadcast domain with guest phones.</p>',
    results:[{value:'180',label:'Access points'},{value:'Zero',label:'Clinical downtime'}],
    cover_image:null, cover_image_alt:null, industry:{ id:2, name:'Healthcare', slug:'healthcare', summary:null, icon:'health' }, seo:null },
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

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace('/api/v1', '');
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const auth = bearer === TOKEN;
  const isStaff = bearer === STAFF_TOKEN;

  if (p === '/auth/login' && req.method === 'POST') return json(res, 200, { token: TOKEN, customer });
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
  if (p.startsWith('/menus/')) return json(res, 404, { message: 'No menu is assigned to that location.' });

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
    phone: '+91 00000 00000',
    support_email: 'support@example.test',
    sales_email: 'sales@example.test',
    address: 'Address line one, Address line two',
    theme: 'olive',
    portal_enabled: '1',
    registration_enabled: '1',
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
        locations: [
          { value: 'primary', label: 'Main navigation', hint: 'The header.', depth: 2 },
          { value: 'footer', label: 'Footer', hint: 'The footer.', depth: 2 },
        ],
        types: [
          { value: 'custom', label: 'Custom link', needs_record: false },
          { value: 'page', label: 'Page', needs_record: true },
          { value: 'solution', label: 'Solution', needs_record: true },
        ],
        max_depth: 2,
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
    if (p === '/admin/settings' && req.method === 'GET') {
      const s = (key, value = null, extra = {}) => ({ key, value, type: 'string', group: 'general', ...extra });
      return json(res, 200, { data: {
        general: [s('company_name', 'Technoware'), s('tagline', 'Technology infrastructure that keeps your business connected.'), s('theme', 'olive')],
        contact: [s('phone', '+91 00000 00000'), s('support_email', 'support@example.test'), s('sales_email', 'sales@example.test'), s('address', 'Address line one, Address line two')],
        social: [s('social_linkedin'), s('social_twitter'), s('social_facebook')],
        portal: [s('portal_enabled', '1'), s('registration_enabled', '1')],
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
    if (p === '/admin/settings/mail/authorize') return json(res, 422, { message: 'Save the client ID and secret first.' });
    if (p === '/admin/settings/mail/callback') return json(res, 422, { message: 'That connection did not complete. Start again from Settings.' });
    if (p === '/admin/settings/mail/disconnect') return json(res, 200, { data: { is_connected: false } });
    if (p === '/admin/settings/mail/test') {
      return json(res, 422, { message: 'No transport is configured, so there was nothing to send through.', transport: 'SMTP server' });
    }

    /* The activity log. Read-only in the real API too -- there is no store,
       update or destroy, and a mock that offered one would have the console
       built against a write path that does not exist. */
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
      const m = p.match(/^\/admin\/customers\/(\d+)(\/(approve|reject|status|resend-verification))?$/);
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
        return json(res, 200, { data: row });
      }
    }
    if (p === '/admin/auth/logout' && req.method === 'POST') return json(res, 200, { message: 'Signed out.' });
    if (p === '/admin/dashboard') return json(res, 200, { data: buildAdminDashboard() });
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

      const message = {
        id: Date.now(),
        body: bodyMatch ? bodyMatch[1].trim() : '',
        is_internal: Boolean(internalMatch && internalMatch[1].trim() === '1'),
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
  if (p === '/solutions/networking') return json(res, 200, { data: solutionDetail });
  if (p.startsWith('/solutions/')) {
    const s2 = solutions.find(x => x.slug === p.split('/')[2]);
    return s2
      ? json(res, 200, { data: { ...s2, faqs: [], seo: null, schema: serviceSchema(s2, '/solutions/') } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/services') return json(res, 200, { data: menuOnly(services) });
  if (p.startsWith('/services/')) {
    const s2 = services.find(x => x.slug === p.split('/')[2]);
    return s2
      ? json(res, 200, { data: { ...s2, body: '<p>Managed properly, with the migration handled out of hours.</p>', faqs: [], seo: null, schema: serviceSchema(s2, '/services/') } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/industries') return json(res, 200, { data: menuOnly(industries) });
  if (p.startsWith('/industries/')) {
    const i2 = industries.find(x => x.slug === p.split('/')[2]);
    return i2 ? json(res, 200, { data: { ...i2, body: '<p>Sector-specific notes.</p>', solutions, seo: null } })
              : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/brands') return json(res, 200, { data: brands });
  // Editor-built forms. 404 for an unknown slug and for a form with no fields,
  // because the frontend's fallback depends on that being a miss.
  if (p.startsWith('/forms/')) {
    const f = forms.find(x => x.slug === p.split('/')[2]);
    if (!f || !f.fields.length) return json(res, 404, { message: 'Not found.' });
    if (req.method === 'POST') return json(res, 201, { message: f.success_message, data: { id: 1 } });
    return json(res, 200, { data: f });
  }
  // Carousels, addressed by slug. 404 for anything unknown, and for a slider
  // with no slides — the frontend's fallback depends on that being a miss.
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
    return c2 ? json(res, 200, { data: { ...c2, related_solutions: solutions.slice(0, 2) } })
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
      ? json(res, 200, { data: { ...pr, schema: productSchema(pr) } })
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
  if (p.startsWith('/store/products/')) {
    const sp = storeProducts.find(x => x.slug === p.split('/')[3]);
    return sp ? json(res, 200, { data: sp }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/store/categories') return json(res, 200, { data: storeCategories });
  if (p.startsWith('/store/categories/')) {
    const sc = storeCategories.find(x => x.slug === p.split('/')[3]);
    return sc ? json(res, 200, { data: sc }) : json(res, 404, { message: 'Not found.' });
  }

  if (p === '/cart' || p.startsWith('/cart/')) {
    const { token, lines } = cartFor(req.headers['x-cart-token']);

    if (p === '/cart' && req.method === 'GET') return json(res, 200, { data: summarise(token, lines) });
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

  if (p.startsWith('/blog/')) {
    const b2 = posts.find(x => x.slug === p.split('/')[2]);
    return b2
      ? json(res, 200, { data: { ...b2, schema: articleSchema(b2, 'Article', '/blog/') } })
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
    return pg ? json(res, 200, { data: pg }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/case-studies') return json(res, 200, { data: caseStudies });
  if (p.startsWith('/case-studies/')) {
    const c3 = caseStudies.find(x => x.slug === p.split('/')[2]);
    return c3
      ? json(res, 200, { data: { ...c3, schema: articleSchema(c3, 'Article', '/case-studies/') } })
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
      ? json(res, 200, { data: { ...k2, schema: articleSchema(k2, 'TechArticle', '/knowledge-base/') } })
      : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/enquiries' && req.method === 'POST') return json(res, 201, { message: 'Thanks', data: { id: 1 } });
  if (p === '/redirects/lookup') {
    const from = url.searchParams.get('path');
    if (from === '/solutions/old-networking') return json(res, 200, { data: { to: '/solutions/networking', status: 301 } });
    return json(res, 404, { data: null });
  }

  if (!auth) return json(res, 401, { message: 'Unauthenticated.' });

  if (p === '/auth/me') return json(res, 200, { data: customer });
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

  return json(res, 404, { message: 'Not found.' });
}).listen(8899, () => console.log('mock api on 8899'));
