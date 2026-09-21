# AEO + GEO — sample responses (2026-09-21)

Three responses from the real API against the development database (2026-09-21, the seeded "networking" solution given two published blocks and one draft), verbatim except the product lists, so the
mock API (`web/mock-api.mjs`) and the console's types can mirror the shape
without guessing. The contract is `docs/aeo-geo-contract.md`; where the
implementation had to choose a shape the contract left open, the choice is
noted under each sample.

## 1. Admin detail — `PATCH /api/v1/admin/solutions/{id}` with two answer blocks

The same shape as `GET /admin/solutions/{id}`. `answer_blocks` is every
block, drafts included, with `id`, `sort_order` and `status`; `faqs` is the
`{question, answer}` pair the repeater posts back.

```json
{
  "data": {
    "id": 1,
    "title": "Enterprise networking",
    "slug": "networking",
    "summary": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
    "problem_statement": "Most office networks were never designed — they accreted. A switch here, an access point there, and eventually nobody can say which VLAN a device is on or why a cable run terminates where it does.",
    "overview": "<p>We start with a survey of what is physically installed, then produce an addressing plan, a switching topology and a cable schedule before touching anything.</p><h2>How the work runs</h2><p>Cutover happens out of hours, in stages, with a documented rollback at every step.</p><ul><li>Core and access switching</li><li>VLAN segmentation</li><li>Inter-VLAN routing and ACLs</li></ul>",
    "benefits": [
      "A network diagram that matches reality",
      "Labelled patching, both ends",
      "Segmented traffic so one bad device cannot flood the network",
      "Capacity headroom for three to five years"
    ],
    "technologies": [
      "Cisco Catalyst",
      "HPE Aruba CX",
      "Ubiquiti UniFi",
      "802.1X",
      "LACP",
      "RSTP"
    ],
    "icon": "network",
    "hero_image_path": "media/2026/09/PNQcdKrC52xelsIt295AKCquCOa5JwLndAuQjVA1.jpg",
    "hero_image": "http://127.0.0.1:8000/storage/media/2026/09/PNQcdKrC52xelsIt295AKCquCOa5JwLndAuQjVA1.jpg",
    "status": "published",
    "status_label": "Published",
    "sort_order": 0,
    "show_in_menu": true,
    "faqs": [
      {
        "question": "Can you work around our production hours?",
        "answer": "Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage."
      },
      {
        "question": "Do we have to replace everything at once?",
        "answer": "Almost never. We stage the work so the oldest and riskiest equipment goes first, and the rest follows as budget allows."
      }
    ],
    "answer_blocks": [
      {
        "id": 1,
        "kind": "definition",
        "question": null,
        "answer": "Enterprise Wi-Fi is a surveyed, centrally managed wireless network sized for a campus rather than an office.",
        "detail": "<p>Access points are placed from a heat-map survey and managed from one console.</p>",
        "sort_order": 0,
        "status": "published"
      },
      {
        "id": 2,
        "kind": "question",
        "question": "Is the network monitored after installation?",
        "answer": "Yes. Every access point reports to the NOC, and an outage raises a ticket before anybody rings.",
        "detail": null,
        "sort_order": 1,
        "status": "published"
      },
      {
        "id": 3,
        "kind": "step",
        "question": null,
        "answer": "Survey the site and produce a heat map.",
        "detail": null,
        "sort_order": 2,
        "status": "draft"
      }
    ],
    "seo": {
      "title": null,
      "description": null,
      "canonical_url": null,
      "robots": null,
      "focus_keyword": null,
      "secondary_keywords": [],
      "og_title": null,
      "og_description": null,
      "og_image_path": null,
      "og_image": null,
      "schema_type": null,
      "sitemap_include": true
    },
    "seo_defaults": {
      "title": "Enterprise networking",
      "description": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
      "canonical_url": "https://www.technoware.in/solutions/networking",
      "robots": "index, follow",
      "focus_keyword": null,
      "secondary_keywords": [],
      "og_title": "Enterprise networking",
      "og_description": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
      "og_image": "http://127.0.0.1:8000/storage/media/2026/09/PNQcdKrC52xelsIt295AKCquCOa5JwLndAuQjVA1.jpg",
      "schema_type": "Service",
      "schema_type_options": [
        "Service",
        "ProfessionalService"
      ],
      "sitemap_include": true
    },
    "created_at": "2026-08-23T00:24:24+05:30",
    "updated_at": "2026-09-12T22:39:52+05:30",
    "products": "[…5 products, unchanged…]"
  }
}
```

The index (`GET /admin/solutions`) carries no `answer_blocks` or `faqs` on a
row and adds `meta.answer_block_kinds`:

```json
{
  "meta": {
    "answer_block_kinds": [
      {
        "value": "definition",
        "label": "Definition — what is it?",
        "heading": "What is it?",
        "asks_question": false
      },
      {
        "value": "who_for",
        "label": "Who is it for?",
        "heading": "Who is it for?",
        "asks_question": false
      },
      {
        "value": "why",
        "label": "Why is it needed?",
        "heading": "Why is it needed?",
        "asks_question": false
      },
      {
        "value": "key_fact",
        "label": "Key fact",
        "heading": "Key facts",
        "asks_question": false
      },
      {
        "value": "feature",
        "label": "Feature",
        "heading": "Key features",
        "asks_question": false
      },
      {
        "value": "use_case",
        "label": "Use case",
        "heading": "Use cases",
        "asks_question": false
      },
      {
        "value": "comparison",
        "label": "Comparison",
        "heading": "Comparisons",
        "asks_question": true
      },
      {
        "value": "step",
        "label": "Step",
        "heading": "How it works",
        "asks_question": false
      },
      {
        "value": "question",
        "label": "Question and answer",
        "heading": "Questions people ask",
        "asks_question": true
      }
    ]
  }
}
```

## 2. Public detail — `GET /api/v1/solutions/{slug}`

Published blocks only, in order, each with the `heading` the page draws it
under (no `id`, no `status`). `entity` is the record's relationships as
`{name, path}` lists; `faq_schema` is the `FAQPage` over the FAQs and the
`question` blocks, **absent under two entries** (here: one FAQ plus one
question block, so it is present). `schema` gains `about` and `mentions`.

```json
{
  "data": {
    "id": 1,
    "title": "Enterprise networking",
    "slug": "networking",
    "updated_at": "2026-09-12T22:39:52+05:30",
    "summary": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
    "icon": "network",
    "hero_image": "http://127.0.0.1:8000/storage/media/2026/09/PNQcdKrC52xelsIt295AKCquCOa5JwLndAuQjVA1.jpg",
    "hero_image_alt": "A network switch with ethernet cables plugged into every port",
    "hero_image_focus": null,
    "problem_statement": "Most office networks were never designed — they accreted. A switch here, an access point there, and eventually nobody can say which VLAN a device is on or why a cable run terminates where it does.",
    "overview": "<p>We start with a survey of what is physically installed, then produce an addressing plan, a switching topology and a cable schedule before touching anything.</p><h2>How the work runs</h2><p>Cutover happens out of hours, in stages, with a documented rollback at every step.</p><ul><li>Core and access switching</li><li>VLAN segmentation</li><li>Inter-VLAN routing and ACLs</li></ul>",
    "benefits": [
      "A network diagram that matches reality",
      "Labelled patching, both ends",
      "Segmented traffic so one bad device cannot flood the network",
      "Capacity headroom for three to five years"
    ],
    "technologies": [
      "Cisco Catalyst",
      "HPE Aruba CX",
      "Ubiquiti UniFi",
      "802.1X",
      "LACP",
      "RSTP"
    ],
    "status": "published",
    "industries": [],
    "faqs": [
      {
        "id": 32,
        "question": "Can you work around our production hours?",
        "answer": "Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage."
      },
      {
        "id": 33,
        "question": "Do we have to replace everything at once?",
        "answer": "Almost never. We stage the work so the oldest and riskiest equipment goes first, and the rest follows as budget allows."
      }
    ],
    "answer_blocks": [
      {
        "kind": "definition",
        "question": null,
        "answer": "Enterprise Wi-Fi is a surveyed, centrally managed wireless network sized for a campus rather than an office.",
        "detail": "<p>Access points are placed from a heat-map survey and managed from one console.</p>",
        "heading": "What is it?"
      },
      {
        "kind": "question",
        "question": "Is the network monitored after installation?",
        "answer": "Yes. Every access point reports to the NOC, and an outage raises a ticket before anybody rings.",
        "detail": null,
        "heading": "Questions people ask"
      }
    ],
    "entity": {
      "solutions": [],
      "services": [],
      "industries": [],
      "articles": [],
      "faq_count": 2
    },
    "faq_schema": {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can you work around our production hours?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage."
          }
        },
        {
          "@type": "Question",
          "name": "Do we have to replace everything at once?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Almost never. We stage the work so the oldest and riskiest equipment goes first, and the rest follows as budget allows."
          }
        },
        {
          "@type": "Question",
          "name": "Is the network monitored after installation?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Every access point reports to the NOC, and an outage raises a ticket before anybody rings."
          }
        }
      ]
    },
    "seo": {
      "title": "Enterprise networking",
      "description": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
      "canonical_url": "https://www.technoware.in/solutions/networking",
      "robots": "index, follow",
      "focus_keyword": null,
      "og_title": "Enterprise networking",
      "og_description": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
      "og_image": "http://127.0.0.1:8000/storage/media/2026/09/PNQcdKrC52xelsIt295AKCquCOa5JwLndAuQjVA1.jpg",
      "schema_type": "Service",
      "sitemap_include": true
    },
    "schema": {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": "Enterprise networking",
      "description": "Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.",
      "url": "https://www.technoware.in/solutions/networking",
      "provider": {
        "@type": "Organization",
        "@id": "https://www.technoware.in/#organization",
        "name": "Technoware",
        "url": "https://www.technoware.in"
      },
      "serviceType": "Enterprise networking",
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": [
          "h1",
          ".lede"
        ]
      }
    },
    "products": "[…5 products, unchanged…]"
  }
}
```

## Shapes the contract left open, and what was chosen

- **`faq_schema` is a sibling of `schema`, not folded into it.** `schema`
  stays the record's own graph (one object, unchanged for every existing
  reader); `faq_schema` is a second object, present only when the gate
  passes. The frontend renders both through `JsonLd`. The frontend's
  `FaqList` currently emits its *own* `FAQPage` for any list; it should stop,
  or the page carries two.
- **`entity` and `faq_schema` are gated on `withSchema()`** — "this resource
  is the page" — so a nested resource (a solution inside an industry) never
  carries them and never lazy-loads. Pages, product categories, industries and
  store categories now call `withSchema()` from their detail reads for that
  reason; they still have no `schema` key of their own.
- **`entity.articles`** is the published posts and knowledge articles whose
  body links to the record's page (`EntityLinks::supportingArticles()`),
  attached as a `supportingArticles` relation by the detail controllers — the
  one relation the contract's "loaded relations only" rule needed inventing.
  Product categories get `solutions` from the same computed `relatedSolutions`
  the public read already set.
- **The `Organization` node is built in `web/src/lib/seo.tsx`**, so
  `knowsAbout` and `areaServed` cannot be added from the API directly. The
  public `/settings` map carries them as two JSON-encoded strings,
  `organization_knows_about` (published solution titles) and
  `organization_area_served` (active location names), absent when empty. The
  frontend decodes them the way it decodes `site_theme_options`.
- **`GET /admin/seo` rows** carry `aeo`/`geo` as `{value, band}` only; the
  single-record read carries `{value, band, passed, checked, failed[]}`.
  `?sort=aeo|geo|score` and `?dir=` order the array (`ListSort::applyToRows`,
  ending on id); `meta.sorts` lists the three; `meta.site_score.aeo` and
  `.geo` are `{value, band, top_issues[], groups}`. Every row also carries the
  `entity` block.
- **Store product `isRelatedTo`** is the six products from the same category
  the storefront page lists beside it (set as a `relatedProducts` relation by
  `StoreController::product()`); `additionalProperty` is one `PropertyValue`
  per spec-sheet row; `offers.warranty` is a `WarrantyPromise` only when
  `warranty` is set; `category` is a `Thing` with `name` and `url`.
- **Brands** have no public detail endpoint. `BrandResource` carries `faqs`,
  `answer_blocks`, `entity` and `faq_schema` when the relations are loaded and
  `withSchema()` is called, which nothing public does yet; the landing page at
  `/brands/{slug}` is where a brand page would load them.
