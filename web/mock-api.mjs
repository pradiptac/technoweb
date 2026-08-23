import { createServer } from 'node:http';

/* Mock of the Laravel API, implementing exactly the /api/v1 contract the
   frontend was written against. Used to verify the portal end-to-end while
   the real backend cannot be booted in this sandbox. */

const TOKEN = 'mock-token-abc123';
const customer = { id: 1, name: 'Neil Basu', email: 'neil@meridianfoods.in', company: 'Meridian Foods', phone: '+91 98200 11223' };

const STAFF_TOKEN = 'mock-admin-token-xyz789';
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
  tickets.forEach((t) => { breakdown[STATUS_LABELS[t.status]] = (breakdown[STATUS_LABELS[t.status]] || 0) + 1; });

  return {
    counts: {
      open_tickets: openTickets.length,
      overdue_tickets: tickets.filter((t) => t.is_overdue).length,
      customers: 1,
      products: products.length,
      blog_posts: posts.length,
      new_enquiries: 2,
    },
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
].map(s => ({ ...s, hero_image:null, status:'published' }));

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
  { id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null },
  { id:2, name:'Firewalls', slug:'firewalls', description:'NGFW & UTM appliances', icon:'firewall', parent_id:null },
];

const products = [
  { id:1, name:'Catalyst CBS350-24T-4G', slug:'cisco-cbs350-24t-4g', sku:'CBS350-24T-4G',
    short_description:'24-port Gigabit managed switch with 4 SFP uplinks.',
    description:'<p>A managed access switch for wiring closets that need Layer 3 lite, static routing and proper VLAN support without a full enterprise licence.</p>',
    specifications:{ 'Ports':'24 × 10/100/1000', 'Uplinks':'4 × 1G SFP', 'Switching capacity':'56 Gbps', 'Rack units':'1U' },
    features:['Layer 3 lite static routing','802.1X port authentication','Rack-mount, fanless','Limited lifetime warranty'],
    images:[], datasheet_url:null, status:'published',
    brand:{ id:1, name:'Cisco', slug:'cisco', logo:null },
    category:{ id:1, name:'Switches', slug:'switches', description:'Access, core and PoE', icon:'switch', parent_id:null },
    related_products:[], related_solutions:[{ id:1, title:'Enterprise networking', slug:'networking', icon:'network', summary:'', hero_image:null, status:'published' }],
    faqs:[{ id:9, question:'Does this support PoE?', answer:'No — this is the non-PoE variant. Ask us about the CBS350-24P if you need to power access points or phones.' }],
    seo:null },
];


/* ---------------- resources (blog, case studies, KB) ---------------- */

const posts = [
  { id:1, title:'Firewall rules that quietly stop working', slug:'firewall-rules-that-stop-working',
    excerpt:'Five policy patterns that pass review but fail in production, and how to catch them early.',
    body:'<p>A firewall policy is not a static document. It describes a network that keeps changing underneath it.</p><h2>The stale object problem</h2><p>An address object pointing at a host that was decommissioned two years ago still matches nothing — until DHCP hands that address to a printer.</p><ul><li>Audit address objects quarterly</li><li>Prefer FQDN objects where the vendor supports them</li></ul>',
    cover_image:null, published_at:'2026-08-12T09:00:00Z', reading_minutes:7, author:{ name:'S. Rao' }, seo:null },
  { id:2, title:'Sizing a UPS for a small server room', slug:'sizing-a-ups',
    excerpt:'Load calculation, runtime targets and the mistake almost everyone makes with power factor.',
    body:'<p>Most undersized UPS installations come from reading the wrong number off the label.</p>',
    cover_image:null, published_at:'2026-08-04T09:00:00Z', reading_minutes:5, author:{ name:'A. Fernandes' }, seo:null },
];

const caseStudies = [
  { id:1, title:'Six-plant network consolidation', slug:'six-plant-consolidation',
    client_name:'Meridian Foods', summary:'Replaced six independently-built site networks with one standardised design, central firewall policy and site-to-site VPN.',
    body:'<p>Each plant had been wired by whichever local contractor was available at the time.</p><h2>What we changed</h2><p>One switching standard, one addressing plan, one firewall policy pushed from the centre.</p>',
    results:[{value:'-71%',label:'Network tickets'},{value:'6 wks',label:'Cutover'},{value:'6',label:'Sites standardised'},{value:'Zero',label:'Production stoppages'}],
    cover_image:null, industry:{ id:4, name:'Manufacturing', slug:'manufacturing', summary:null, icon:'factory' }, seo:null },
  { id:2, title:'Hospital Wi-Fi & device segmentation', slug:'hospital-wifi',
    client_name:null, summary:'High-density wireless across four floors with clinical devices, staff and guest traffic properly separated.',
    body:'<p>Clinical devices cannot share a broadcast domain with guest phones.</p>',
    results:[{value:'180',label:'Access points'},{value:'Zero',label:'Clinical downtime'}],
    cover_image:null, industry:{ id:2, name:'Healthcare', slug:'healthcare', summary:null, icon:'health' }, seo:null },
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

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace('/api/v1', '');
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const auth = bearer === TOKEN;
  const isStaff = bearer === STAFF_TOKEN;

  if (p === '/auth/login' && req.method === 'POST') return json(res, 200, { token: TOKEN, customer });
  if (p === '/admin/auth/login' && req.method === 'POST') return json(res, 200, { token: STAFF_TOKEN, staff });
  if (p === '/ticket-categories') return json(res, 200, { data: categories });

  // ---- staff / admin ----
  if (p.startsWith('/admin/')) {
    if (!isStaff) return json(res, 401, { message: 'Unauthenticated.' });

    if (p === '/admin/auth/me') return json(res, 200, { data: staff });
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
  if (p === '/solutions') return json(res, 200, { data: solutions });
  if (p === '/solutions/networking') return json(res, 200, { data: solutionDetail });
  if (p.startsWith('/solutions/')) {
    const s2 = solutions.find(x => x.slug === p.split('/')[2]);
    return s2 ? json(res, 200, { data: { ...s2, faqs: [], seo: null } }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/services') return json(res, 200, { data: services });
  if (p.startsWith('/services/')) {
    const s2 = services.find(x => x.slug === p.split('/')[2]);
    return s2 ? json(res, 200, { data: { ...s2, body: '<p>Managed properly, with the migration handled out of hours.</p>', faqs: [], seo: null } })
              : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/industries') return json(res, 200, { data: industries });
  if (p.startsWith('/industries/')) {
    const i2 = industries.find(x => x.slug === p.split('/')[2]);
    return i2 ? json(res, 200, { data: { ...i2, body: '<p>Sector-specific notes.</p>', solutions, seo: null } })
              : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/product-categories') return json(res, 200, { data: productCategories });
  if (p.startsWith('/product-categories/')) {
    const c2 = productCategories.find(x => x.slug === p.split('/')[2]);
    return c2 ? json(res, 200, { data: c2 }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/products') {
    const cat = url.searchParams.get('category');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    let rows = products;
    if (cat) rows = rows.filter(x => x.category?.slug === cat);
    if (q) rows = rows.filter(x => x.name.toLowerCase().includes(q));
    return json(res, 200, paginate(rows));
  }
  if (p.startsWith('/products/')) {
    const pr = products.find(x => x.slug === p.split('/')[2]);
    return pr ? json(res, 200, { data: pr }) : json(res, 404, { message: 'Not found.' });
  }
  if (p === '/blog') return json(res, 200, paginate(posts));
  if (p.startsWith('/blog/')) {
    const b2 = posts.find(x => x.slug === p.split('/')[2]);
    return b2 ? json(res, 200, { data: b2 }) : json(res, 404, { message: 'Not found.' });
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
    return c3 ? json(res, 200, { data: c3 }) : json(res, 404, { message: 'Not found.' });
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
    return k2 ? json(res, 200, { data: k2 }) : json(res, 404, { message: 'Not found.' });
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
