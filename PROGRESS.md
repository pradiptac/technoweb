# Technoware — progress checklist

Living tracker, updated as work lands. See `CLAUDE.md` for architecture and
conventions; this file is just "what's done vs. not."

## Phase 1 — Foundation

- [x] Design-token layer (Tailwind v4, `web/src/app/globals.css`)
- [x] Public homepage, static-rendered
- [x] Typed API client (`web/src/lib/api.ts`) with ISR + error handling
- [x] Customer auth — Sanctum token in httpOnly cookie
- [x] Full database schema — 30 tables, FKs, indexes
- [x] Support tickets end to end (customer side): create, converse, attach,
      close, reopen, internal notes, SLA clock, audit trail
- [x] Staff ticket queue API (filtering, assignment, status transitions) —
      built, not yet reachable from a browser until Phase 3's admin login
- [x] RBAC across four staff roles (`Role` enum, `role:` middleware)
- [x] SEO layer — metadata, JSON-LD, `robots.txt`, `sitemap.xml`, 301s

## Phase 2 — Inner marketing pages + resources

- [x] `/solutions`, `/services`, `/industries` — index + detail
- [x] `/products`, `/products/[slug]` — category/product resolver
- [x] `/contact` — enquiry form
- [x] `/resources`, `/blog`, `/case-studies`, `/knowledge-base`, `/about`
- [x] Redirect middleware, sitemap generated from the API
- [x] Ticket-deflection loop (KB ↔ new-ticket form)

## Phase 3 — Admin CMS

**Shell, dashboard, ticket queue, ticket detail — done:**

- [x] Staff authentication (`/admin/login`, separate `tw_admin_session`
      cookie, separate Sanctum guard flow from the customer portal)
- [x] Admin shell — sidebar nav, header, sign-out (`/admin/(app)/layout.tsx`)
- [x] Dashboard — ticket counts, recent tickets, high-priority list, status
      breakdown (`/admin`)
- [x] Ticket queue — filters (status, priority, assignee, unassigned,
      overdue, search), inline status transitions, inline reassignment,
      pagination (`/admin/tickets`)
- [x] Ticket detail/reply (`/admin/tickets/[reference]`) — full conversation
      thread with a distinct internal-note treatment, reply form (customer-visible
      or internal, with attachments), inline status/assignee controls reused
      from the queue. Fixed two real bugs found while building this: staff
      replies weren't persisting attachments, and staff couldn't download any
      ticket attachment at all (wrong authorization route).
- [x] Staff listing endpoint for the assignment dropdown
- [x] Every form on the site (contact, portal login/reply/new-ticket/profile,
      admin login/reply) converted to floating labels — shared `Field`
      primitive in `web/src/components/ui/input.tsx`
- [x] Main container widened to 90% / max 1920px (`components/ui/container.tsx`)
- [x] AOS-style scroll reveals across the marketing site —
      `components/ui/reveal.tsx` (IntersectionObserver, no dependency) plus
      the `data-aos` CSS in `globals.css`. Author with `data-aos="fade-up"`,
      stagger with `data-aos-delay` (see `STAGGER` in `lib/utils.ts`).
      Deliberately excluded: the portal and admin (dense utility UI), and
      above-the-fold headings (animating the LCP element delays it).
- [x] Verified against the mock API and against real Laravel + MySQL with a
      real admin account

- [x] Closed the customer/staff authorization gap. Every portal endpoint
      authorised by comparing the caller's id against a ticket's
      `customer_id` — ids drawn from two different tables, which collide
      whenever the numbers match (as they did for the seeded admin and
      customer, both id 1). A staff token could therefore read a customer's
      tickets, profile and attachments. Fixed at the routing layer with an
      `EnsureUserIsCustomer` middleware (`customer` alias) mirroring the
      staff-side `role:` middleware, rather than patching each call site;
      it also revokes access for a customer deactivated after sign-in.

**Not started:**

- [ ] CMS CRUD (all behind `role:content_manager`, routes are stubbed):
  - [ ] Products, brands, product categories
  - [ ] Solutions, services, industries
  - [ ] Pages
  - [ ] Blog posts
  - [ ] Case studies
  - [ ] Knowledge base articles
  - [ ] Media library
  - [ ] FAQs
- [ ] Redirects manager (behind `role:seo_manager`)
- [ ] SEO manager — per-record metadata overrides UI (behind `role:seo_manager`)
- [ ] Staff/user management screen (create/deactivate staff, assign roles) —
      no `role:admin`-only routes exist yet either

## Phase 4 — Not started

- [ ] Email notifications for tickets (hooks marked `TODO(phase 4)` in the code)

## Known placeholders that must not ship

See CLAUDE.md's "Known risks and placeholders" — invented phone number,
"since 2009", stats, case studies, testimonial, and the text-only logo.
