# IMPLEMENT AEO + GEO

The existing CMS is approximately 95% complete.

SEO functionality is already implemented.

The website also contains an online store with products, categories, brands and product detail pages.

## IMPORTANT

Do NOT rebuild or replace the existing CMS or SEO system.

Do NOT introduce a second SEO system.

Extend the existing architecture and reuse existing:
- CMS
- SEO metadata
- Products
- Categories
- Brands
- Services
- Blog/articles
- FAQs
- Existing API
- Existing Next.js rendering
- Existing Laravel backend
- Existing MySQL database
- Existing admin UI/components

First inspect the current implementation and understand how SEO/content/product data is currently stored and rendered.

The objective is to add:

1. AEO — Answer Engine Optimization
2. GEO — Generative Engine Optimization

SEO remains the existing foundation.

---

# 1. AEO — ANSWER ENGINE OPTIMIZATION

Build an AEO layer that makes website content easy for AI/search answer engines to understand and extract accurately.

AEO must work for:

- Website pages
- Products
- Product categories
- Brands
- Services
- Solutions
- Blog/articles
- FAQs
- Knowledge-base content

## AEO data

Where appropriate, support:

- Question
- Direct answer
- Supporting explanation
- FAQ
- Key facts
- Definitions
- Features
- Specifications
- Benefits
- Use cases
- Comparisons
- Step-by-step information
- Related questions

Do not create unnecessary duplicate content.

---

# 2. Answer Blocks

Allow admins to define structured "answer blocks" for important pages.

Example:

Question:
What is a managed network switch?

Direct Answer:
A managed network switch allows administrators to configure and monitor network traffic using features such as VLANs, QoS and SNMP.

Supporting content:
...

These blocks should be rendered as normal useful page content where appropriate.

Do NOT create hidden text specifically for search engines.

---

# 3. FAQ SYSTEM

Reuse the existing FAQ functionality if available.

Allow FAQs to be associated with:

- Pages
- Products
- Categories
- Services
- Solutions
- Articles

Support:

Question
Answer
Display order
Published status

Generate appropriate FAQ structured data where valid.

Do not generate FAQ schema automatically for every page without checking whether the content qualifies.

---

# 4. PRODUCT AEO

This is particularly important because the website has an online store.

For every product, make structured information available to search/answer engines.

Use existing product data:

- Product name
- Brand
- Model
- SKU
- Category
- Description
- Features
- Specifications
- Applications
- Compatibility
- Availability
- Price
- Currency
- Images
- Warranty information where available

Do NOT invent specifications.

AI may suggest missing content, but product facts must come from the actual product database or verified admin input.

---

# 5. PRODUCT QUESTIONS

Allow AEO questions such as:

- What is [product]?
- Who should use [product]?
- What are the main features?
- What is [product] used for?
- Is [product] suitable for [use case]?
- What is the difference between X and Y?
- What are the specifications?
- Is the product available?

Only generate answers from verified product information.

---

# 6. ENTITY / KNOWLEDGE GRAPH STRUCTURE

Create strong relationships between entities.

Example:

Brand
 ↓
Product
 ↓
Category
 ↓
Solution
 ↓
Service
 ↓
Industry
 ↓
Article
 ↓
FAQ

Example:

Cisco
 ↓
CBS350
 ↓
Managed Switch
 ↓
Enterprise Networking
 ↓
Network Installation
 ↓
Healthcare
 ↓
Related Articles
 ↓
FAQs

Use existing database relationships wherever possible.

Do not create a complicated graph database.

MySQL relational relationships are sufficient.

---

# 7. GEO — GENERATIVE ENGINE OPTIMIZATION

Implement GEO as a content and entity layer designed to improve the accuracy and usefulness of information presented by generative AI/search systems.

Focus on:

- Clear factual content
- Strong entity relationships
- Authoritative company information
- Consistent business information
- Product facts
- Service descriptions
- Expertise signals
- Supporting references
- FAQs
- Definitions
- Comparisons
- Use cases
- First-hand/company information

Do NOT attempt to manipulate or "guarantee" AI search rankings.

The goal is to make the website's information easy for AI systems to understand, verify and cite.

---

# 8. COMPANY ENTITY

Create/extend the Organization/Business entity data.

Maintain consistent:

- Company name
- Legal/company description where appropriate
- Website
- Logo
- Address
- Phone
- Email
- Social profiles
- Areas served
- Services
- Industries
- Business categories

Use existing company settings if available.

Do not duplicate company information across multiple tables unnecessarily.

---

# 9. SERVICE ENTITY

For services such as:

- Network solutions
- Firewall
- Wi-Fi
- Server
- Storage
- Backup
- Cybersecurity
- Web hosting
- Business email
- Domain
- VPS
- AMC
- IT support

Create structured service information:

- Service name
- Description
- Service category
- Benefits
- Use cases
- Industries
- Areas served
- Related products
- Related articles
- FAQs

---

# 10. GEO CONTENT SIGNALS

For important pages, support sections such as:

## What is it?
Clear definition.

## Who is it for?
Target customer/use case.

## Why is it needed?
Business/technical context.

## Key features
Verified facts.

## Use cases
Real applications.

## Frequently Asked Questions
Relevant questions and answers.

## Related solutions
Links to related services/products.

## Related products
Actual products from the store.

## Related resources
Existing articles/guides.

Do not generate filler content simply to increase page length.

---

# 11. AI ASSISTANT

Use the existing OpenAI integration.

AI must remain optional and admin-triggered.

Create an AEO/GEO assistant with actions such as:

[Analyze AEO]

[Generate Questions]

[Generate Answer Blocks]

[Improve Answer]

[Suggest FAQs]

[Analyze GEO]

[Suggest Entity Relationships]

[Suggest Internal Links]

[Generate Product Q&A]

AI output must always be reviewed by an administrator before publishing.

Never automatically publish AI-generated content.

---

# 12. AI CONTEXT

When generating AEO/GEO content, provide the AI with relevant existing data.

For a product:

- Product data
- Brand
- Category
- Specifications
- Existing description
- Related products
- Related services
- Existing FAQs

For a service:

- Service information
- Related products
- Industries
- Existing content
- Existing FAQs
- Existing articles

Never ask AI to invent missing technical specifications.

If information is unavailable, AI should explicitly identify it as missing rather than fabricate it.

---

# 13. INTERNAL LINKING

Add intelligent internal-link suggestions.

Example:

Product:
Fortinet Firewall

Suggested links:
- Firewall Solutions
- Network Security
- Fortinet Brand
- Firewall Installation
- Cybersecurity Services
- Related Fortinet products
- Related articles
- Related FAQs

Only suggest URLs/pages that actually exist.

Admin must approve suggested links.

---

# 14. STRUCTURED DATA

Extend the existing structured-data system rather than creating a separate implementation.

Where applicable support:

- Organization
- WebSite
- WebPage
- BreadcrumbList
- Product
- Offer
- Brand
- Article
- FAQPage
- Service
- LocalBusiness where appropriate

Structured data must contain only information visible on the page and/or legitimately represented by the website.

Do not generate misleading schema.

Validate JSON-LD before rendering.

---

# 15. AI-READABLE CONTENT API

Where useful, expose clean structured API responses for internal rendering and future integrations.

The API should return structured entities rather than forcing consumers to parse HTML.

Example:

Product:

{
  name,
  brand,
  model,
  sku,
  category,
  description,
  specifications,
  features,
  availability,
  price,
  currency,
  faqs,
  relatedProducts,
  relatedServices
}

Do not expose private/admin/customer information.

---

# 16. STORE-SPECIFIC REQUIREMENTS

The online store must be treated as a major part of AEO/GEO.

Product pages should have:

- Clear product identity
- Brand
- Model
- SKU
- Specifications
- Features
- Use cases
- Availability
- Price
- Images
- FAQs
- Related products
- Related services
- Breadcrumbs
- Product structured data

Do not let AI modify commercial/product facts automatically.

---

# 17. ADMIN UI

Add AEO/GEO controls to the existing SEO/content editor instead of creating a completely separate CMS section.

Suggested UI:

SEO
────────────
Existing SEO controls

AEO
────────────
AEO Status
Answer Blocks
Questions
FAQs
Product Q&A

[ Analyze AEO ]
[ Generate Questions ]
[ Generate Answers ]

GEO
────────────
Entity completeness
Content clarity
Entity relationships
Internal links
Authority signals

[ Analyze GEO ]
[ Suggestions ]

AI suggestions must have:

[Apply]
[Edit]
[Reject]

---

# 18. AEO/GEO SCORE

Create separate internal indicators:

SEO Score
AEO Readiness
GEO Readiness

These are internal content-quality indicators only.

Do NOT claim:

"Google score"
"ChatGPT ranking"
"AI ranking"
"Guaranteed AI visibility"

Scores should be based on transparent checks.

Example:

AEO:
82/100

✓ Direct answer
✓ Questions
✓ FAQ
✓ Structured information
✓ Internal links
⚠ Missing comparison
⚠ Missing use cases

GEO:
78/100

✓ Organization entity
✓ Product relationships
✓ Service relationships
✓ Authoritative content
⚠ Missing supporting article
⚠ Entity information incomplete

---

# 19. CRITICAL RULES

1. Do not rebuild the existing CMS.
2. Do not replace the existing SEO implementation.
3. Do not create duplicate tables unnecessarily.
4. Do not create duplicate APIs.
5. Do not change existing product/store functionality.
6. Do not make OpenAI mandatory for public pages.
7. Never expose OpenAI API keys.
8. Never generate fake product specifications.
9. Never generate fake company claims.
10. Never create hidden SEO/AEO/GEO text.
11. Never automatically publish AI-generated content.
12. Do not promise search-engine or AI-engine rankings.
13. Reuse existing Next.js SSR/SSG/ISR.
14. Reuse existing Laravel APIs and authentication.
15. Reuse existing MySQL relationships.
16. Maintain backward compatibility.

---

# 20. DEVELOPMENT PROCESS

Before writing code:

1. Inspect the existing CMS.
2. Inspect the existing SEO implementation.
3. Inspect product/store models.
4. Inspect existing FAQ/content models.
5. Inspect existing structured-data implementation.
6. Inspect existing OpenAI integration.
7. Identify reusable components.
8. Produce a short implementation plan.
9. Only then modify the code.

After implementation:

- Run backend tests.
- Run frontend tests/build.
- Test AI disabled.
- Test AI enabled.
- Test product pages.
- Test service pages.
- Test blog pages.
- Test structured data.
- Test sitemap.
- Test metadata.
- Verify no API keys reach the browser.
- Verify existing store functionality is unaffected.

At completion, report:

- Files changed
- Migrations created
- APIs added/modified
- Admin UI changes
- AEO features
- GEO features
- AI features
- Structured-data changes
- Tests performed
- Any manual configuration required