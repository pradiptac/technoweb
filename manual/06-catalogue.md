# The catalogue and the company profile

*Who can use this: Content manager and Administrator. Landing pages and places: SEO manager and Administrator.*

The catalogue is what your website **advertises**: the solutions and services
you offer, the industries you work in, and the hardware you supply. It has no
prices and no basket — every product ends in a "Request information" button.
Things you actually **sell online**, with prices, live in the separate shop
(chapter 07). The two lists are kept apart on purpose: a product can be in
one, the other, or both, and editing one never changes the other.

| Sidebar | Screens |
|---|---|
| **Catalogue** | Products, Categories, Brands, Solutions, Services, Service categories, Industries |
| **Content** | Team, Clients, Certifications (the company profile) |
| **SEO** | Landing pages, Places |

## What the forms have in common

Every catalogue form works the way chapter 05 describes: tabs (*Content*,
*Media*, *Related*, *SEO* and *AEO*, as each form needs), a pinned Save button,
Ctrl + S, a draft kept in your browser, and a redirect written automatically
when you change a slug.

**Show in the main menu.** Solutions, services, industries and product
categories each have a *Show in the main menu* tick. Being published and being in the header's mega
menu are separate decisions: untick it to keep a record on the site but out of
the navigation. New records are ticked by default.

**Icons.** Solutions, services, industries and categories carry an icon,
chosen from a picker of the site's own icon set. Icons are coloured
automatically.

**FAQs and answer blocks.** Most catalogue records take their own questions
and answers and "answer blocks" (short, direct answers that search engines
and AI assistants can quote). See chapter 13 for answer blocks.

## Solutions

**Catalogue → Solutions** — what you solve for customers ("Networking",
"Firewall & UTM", "AMC"). A solution has:

- a problem statement and an overview;
- a list of benefits and a list of technologies;
- an icon and a hero picture;
- **related hardware** and **industries**, ticked on the *Related* tab;
- FAQs (on *Related*) and answer blocks (on *AEO*);
- a sort order, which decides its place in lists.

## Services

**Catalogue → Services** — what you do ("Network installation",
"Structured cabling"). Each service can be filed under a **category**, given
a **picture** (the Media tab), and given up to six **Highlights** — a few
words each, such as ".com" or "Microsoft 365", shown as small tags on the
service's card. Each service page carries an enquiry form. A service can
also be linked to the **places** it is offered in (see Places, below). Shop
products name the services that install or support them on their own form
(chapter 07).

### Service categories

**Catalogue → Service categories** groups your services — the install
starts with *Web services*, *Hardware services* and *Installation services*.
The Services section on your homepage and the Services page show **one tab
per category**, in the order you set, whichever theme you use. A category
with no published service is not shown, and services in no category appear
last under *Other services*. With only one group there are no tabs.

- **Active** — off hides the whole category without touching its services.
- **Show service pictures as card backgrounds** — each service card becomes
  its picture, with the name and summary over a dark fade at its foot. A
  service with no picture keeps an ordinary card.

Categories have no page of their own. Deleting one keeps its services; they
move to *Other services*.

## Industries

**Catalogue → Industries** — the sectors you serve. An industry has a name,
an icon, a description and the solutions you lead with there. Industries have
**no draft status**: they are reference information the rest of the catalogue
points at, and every one is shown.

## Product categories

**Catalogue → Categories** — the hardware catalogue's tree ("Switches",
"Firewalls", with sub-categories under them).

- Choose a **parent** to nest a category. A category cannot be placed under
  itself or under one of its own sub-categories.
- A category can have a picture and an icon.
- A category's page automatically suggests the solutions its products belong
  to.
- **Deleting** a category moves its sub-categories up one level and leaves
  its products in the catalogue without a category.

## Products

**Catalogue → Products** — the hardware you supply.

1. Press **New product** and enter the name, SKU, brand and category.
2. On *Content*, write the short description and description, the **features** list and
   the **specifications** (label and value pairs — "Ports | 24 × 1G"). The
   specifications appear in exactly the order you set.
3. On *Media*, add pictures (the first is the main one) and, optionally, a
   **Datasheet (PDF)** from the media library — the product page then offers
   a *Download datasheet* button.
4. On *Related*, tick the solutions it belongs to and any **related
   products**.
5. Set **Featured** to *Yes* to list it first and give its card a highlight.
6. Publish and save.

Things to know about products:

- **Related products are one-way.** Linking an accessory to a switch does not
  list the switch on the accessory's page. Edit both if you want both.
- Visitors can tick up to **four** products and compare them side by side.
  Specifications with the same label line up, so use consistent labels.
- A product and a category share the same kind of web address
  (`/products/…`). Do not give a product the same slug as a category — the
  category wins.
- Deleting a product frees its slug for re-use.

## Brands

**Catalogue → Brands** — the manufacturers you carry. A brand has a logo,
a sort order, a *Featured* choice, and an optional **partner tier** (for example
"Gold Partner").

- A brand appears in the public brand filter only once it has at least one
  published product. The partners list shows every brand with a partner tier,
  products or not.
- Real manufacturer logos come with the install. Replacing a logo updates
  every page straight away.
- Logos are drawn in white on the dark colour scheme, so any logo works on
  either background.
- Partner tiers are **claims about another company**. The seeded tiers are
  placeholders — confirm or remove them before launch.

## The company profile

Under **Content** are three lists that make up your "who we are" pages. None
of them has its own page per entry; each is shown as a list, on the About page
and on its own page (`/team`, `/clients`, `/certifications`). A menu link to
one of those pages only appears once something is published there.

### Team

**Content → Team** — your people: name, designation, department, photo, a
short bio, email and LinkedIn. Each person can carry their own certifications
(name, issuer, credential ID, issue and expiry dates).

- There is deliberately **no phone number** field.
- A personal certification past its expiry date comes off the public site
  by itself.
- Credential IDs are never shown publicly.

### Clients

**Content → Clients** — organisations you have worked for: name, logo,
website, industry and a note. Tick *Featured* to bring a client forward.

### Certifications

**Content → Certifications** — the company's own certifications: name,
issuer, certificate number, a picture of the certificate (drawn upright), an
optional PDF, and issue and expiry (*Valid until*) dates. An expired
certification drops off the public site automatically and is marked
*Expired* in the console.

The seeded team members, clients and certificate numbers are invented. Replace
them — and once replaced they are yours; re-running the setup does not bring
the samples back.

## Landing pages

**SEO → Landing pages** manages pages built from combinations the catalogue
already supports:

| Kind | Example address |
|---|---|
| Brand | `/brands/cisco` |
| Brand × category or solution | `/brands/cisco/switches` |
| Place | `/locations/kolkata` |
| Place × service or solution | `/locations/kolkata/firewall-installation` |

These pages can attract search traffic, but thousands of thin, near-identical
pages will get a whole website penalised by Google. So the console will
**refuse to publish** a landing page that has not earned it, and says why.
A page is refused unless:

1. **There is real substance behind it** — at least three published products
   in that exact combination, or, for a place, an office address, a response
   time or a written summary for that place.
2. **An introduction has been written** — at least 40 words.
3. **The introduction is not a near-copy** of another landing page's. Swapping
   the city name is caught ("This reads as 80% the same as …").
4. **It has its own title and description**, of sensible lengths.
5. **The number of live landing pages is under the ceiling** — 40 by default,
   set by an administrator under **SEO → Settings** (*Published landing pages,
   at most*).

You can always save a page as a **draft**. A refused publish saves nothing, so
copy your text somewhere safe before trying again if you are unsure.

**Opportunities** lists the combinations your catalogue supports that no page
covers yet — usually a handful, not hundreds. Create a draft from one, write
the introduction yourself, then publish.

## Places

**SEO → Places** records where you actually work. Places form a tree —
country, state, city, area (for example India → West Bengal → Kolkata →
Salt Lake). Levels can be skipped.

For each place you can record an office address (*Where we work from*), a
response time (*Attendance*) and a summary (*What we do here*), and tick the
**services** and **solutions** offered there (*Work offered here*). That list
does three jobs: it decides which "service in place" pages may be published,
what Opportunities suggests, and which places your service pages tell search
engines you serve.

- Nothing is seeded here. **Add only places where you genuinely send
  engineers** — a page claiming a service in a city you do not cover is a
  false statement to your customers.
- Facts are never borrowed between levels: Kolkata having a response time
  does not let West Bengal publish.
- A place that landing pages point at cannot be deleted. Untick *We work
  here* instead.
- A place cannot be moved inside one of its own sub-places.

## Things to know

- The catalogue has no prices; the shop (chapter 07) is a separate list.
- A save in the console reaches the site straight away; other changes can take
  up to ten minutes.
- Unticking *Show in the main menu* hides a record from the navigation only, not from
  the site.
- Landing pages are the SEO manager's, not the content manager's, because a
  wrong one harms the whole domain.
- The seeded products, case studies, team, clients, certificate numbers and
  partner tiers are placeholders and must be replaced before launch.
