# Content: pages, blog, knowledge base and the site's building blocks

*Who can use this: Content manager and Administrator.*

This chapter covers everything an editor writes or arranges: pages, the blog,
the knowledge base, case studies, FAQs, and the pieces you place on pages —
content blocks, menus, popups, sliders, galleries and forms. It ends with
custom fields and custom content types, for when the built-in records do not
hold everything you need.

The screens are spread over three sidebar sections:

| Sidebar | What is there |
|---|---|
| **Content** | Knowledge base, Case studies, Pages, FAQs, Media, Team, Clients, Certifications, Custom fields, Content types, Custom content (and, for administrators, Media settings) |
| **Blog** | Blog, Blog categories, Comments, Settings |
| **Site** | Menus, Sliders, Galleries, Popups, CTA banners, Stat bars, Pricing, Technology stack, Forms (and, for administrators, Info bar, Themes and Settings) |

Media is covered in chapter 14, Team / Clients / Certifications in chapter 06,
and Themes and the Info bar in chapter 15.

## How every edit form works

All the content forms behave the same way, so it is worth knowing once.

- **Tabs.** Longer forms are split into tabs — usually *Content*, *Media*,
  *Related*, *SEO* and, where it applies, *AEO* and *Fields*. Every tab is
  saved together when you press Save; you do not have to visit a tab for its
  fields to be kept. If a save is refused because of a field on a tab you are
  not looking at, that tab is marked with a count and the form jumps to it.
- **Saving.** The Save button stays pinned to the bottom of the screen on a
  long form. **Ctrl + S** (or **⌘ + S** on a Mac) presses it for you.
- **Leaving with unsaved changes.** If you try to leave a form you have typed
  into, the console asks first. The browser's Back button is the one way out
  it cannot catch.
- **Drafts in your browser.** While you type, the form keeps a copy in your
  own browser every few seconds. If the tab closes or the computer restarts,
  opening the same form again offers **Restore** or **Discard**. This copy
  never reaches the server and is cleared when you save. A repeater row you
  added but never saved (a new FAQ line, say) cannot be restored.
- **Status.** Most records are *Draft*, *Published* or *Archived*. Only
  published records appear on the public site. Publishing without a date
  sets the date to now.
- **Addresses (slugs).** The slug is the last part of a record's web address.
  You can change it: the old address automatically redirects to the new one,
  so links from Google and elsewhere keep working. Still, change slugs rarely
  — see chapter 13 for redirects.
- **When the public site changes.** A save from the console reaches the
  public site straight away. A change made any other way (for example
  directly in the database, or by a script) can take up to ten minutes to
  appear.

## How every list works

Every list in the console — pages, tickets, orders, leads and the rest —
shares the same controls.

- **Filters** sit above the list; press **Apply** after changing them.
- **Per page** (bottom right) sets how many rows a page of the list shows.
- On some lists a **column heading** is a link that sorts by that column.
- **Table view** — the sliders button in the top bar — changes how lists are
  drawn *for you*:
  - **Row spacing**: *Comfortable* or *Compact*, for every list in the
    console. Compact fits more rows on the screen.
  - **Columns on this screen**: untick a column to put it away. The first
    column and the row's actions always stay.

  Both choices are kept in your browser. They do not affect your colleagues,
  and they do not follow you to another computer. On a phone a list is shown
  as cards, with every detail, whatever you chose.
- On a desktop screen the list's header row stays in view as you scroll,
  when the whole table fits across the screen.

### Doing something to several rows at once

Blog posts, knowledge-base articles, case studies, solutions, services,
pages, catalogue products, shop products, events, vacancies, downloads, custom
content entries and landing pages have a **tick box on every row**. The tick
box in the header row ticks every row on the page you are looking at.

As soon as one row is ticked, a bar appears above the list saying how many are
selected. Its buttons:

- **Publish** puts the ticked rows on the site.
- **Move to draft** takes them off the site and keeps them as drafts.
- **Archive** takes them off the site and files them away.
- **Delete** removes them for good. It asks you to confirm and tells you how
  many; press **Cancel** to change your mind.
- **Select none** clears the ticks.

Industries, brands, product categories, shop categories and service categories
have no draft or published state, so their bar only has **Delete**.

Each row is handled on its own, exactly as if you had opened it and pressed
Save. If one cannot be moved — a landing page that does not yet meet the
publishing checks, a download with no file, an online event with no join link,
an event that already has people registered (archive it instead of deleting
it) — it is left as it was, and the bar lists it with the reason until you
close the list. The others still go through. A message at the corner says how
many were done.

The ticks clear after every action, and when you move to another page or change
a filter. You can act on up to 100 rows at a time. Deleting several rows at once
is recorded in the activity log with the number deleted.

## The editor

Body text on pages, posts, articles and similar records is written in a
familiar word-processor style editor: headings, bold, italic, underline,
lists, links, tables, colours, alignment, pictures, video and a code view.

- There is **no "Heading 1"** button. The record's title is already the page's
  main heading; start your own headings at Heading 2.
- **Pictures** go into the media library, never into the text itself. Use the
  toolbar's picture button to upload one, or **Library** to insert one that is
  already there. The picture's alt text comes from the media library (chapter
  14).
- **Video** can be embedded from YouTube or Vimeo only. Other sites are
  removed when you save.
- **Layout** inserts one of eight picture-and-text arrangements, with a
  placeholder picture and sample words for you to replace. On a phone the
  two columns stack.
- Anything the site cannot display safely — scripts, forms, unusual styles —
  is stripped out when you save. If formatting you pasted from elsewhere
  disappears, that is why.

### Shortcodes

You can drop a slider, gallery, form or content block into any body by typing
a shortcode on its own line:

```
[slider slug="homepage-hero"]
[gallery slug="recent-work"]
[form slug="contact"]
[cta slug="site-audit"]
[stats slug="our-numbers"]
[pricing slug="amc-plans"]
[stack slug="our-partners"]
```

Each list — Sliders, Galleries, Forms and the four block screens — shows the
ready-made shortcode in its **Shortcode** column. A shortcode naming something
that is a draft, deleted or misspelt shows nothing on the page. If the
shortcode itself is mistyped, the page shows the text exactly as you typed it
— a quick way to spot the mistake.

## Pages

**Content → Pages** holds the free-standing pages of the site: About-style
pages, policy pages (Privacy, Terms, Returns, Shipping) and any page you
add. (Files for visitors to download have their own screen — chapter 26.) Each page lives at your website address followed by its slug,
for example `/privacy`.

A page has a **template**:

- **Default** — a readable column of text. Right for policies and articles.
- **Wide** — no width limit, for a page built around a slider or gallery.
- **Builder** — the page is made of sections instead of a single body (see
  below).

To add a page:

1. Open **Content → Pages** and press **New page**.
2. Type a title. The slug is filled in from it; edit it if you want a shorter
   address.
3. Write the body, choose a template, and set the status to *Published* when
   it is ready.
4. Fill in the SEO tab if you want a title or description different from the
   automatic ones (chapter 13).
5. Save.

### The section page builder

Choose **Builder** as the template and a **Builder** tab appears. A builder
page is a stack of ready-made sections, one under the other. You cannot drag
things anywhere on a canvas — which is deliberate: every section is laid out
properly on every screen size and in every theme.

The section types are:

| Section | What it shows |
|---|---|
| Hero | The opening band: heading, line of text, picture, up to two buttons |
| Text | A heading and a body from the editor |
| Picture or video with text | Media on one side, words and buttons on the other |
| Features | Up to twelve short points with icons, in two to four columns |
| Cards from the catalogue | A live list — solutions, services, industries, case studies, posts, articles, products, product or shop categories, open vacancies, events, or one of your own content types — that updates itself as you publish |
| Content block | A published CTA banner, stat bar, pricing table or technology stack |
| Slider / Gallery / Form | A published one, by name |
| Questions | Questions that open when pressed, written here or taken from the page's own FAQs |
| Logo strip | Client logos or the brands you carry |
| Testimonial | One quotation, who said it, and a photo |
| Video | A YouTube video (loaded only when pressed) or a video from the media library |
| Divider | Space between sections, with or without a line |
| In-page menu | A strip of links to the sections of this page, which stays at the top of the screen as the visitor scrolls |

To build a page:

1. On the Builder tab, press **Add a section** and pick a section type. While
   the page is empty you can instead choose, under **Start from**, *Landing
   page*, *Service page* or *About page* — a ready set of sections with
   placeholder words to replace — or press **Choose a template** to start from
   one of your page templates (see "Page templates" below).
2. Fill in the section's fields. Each section can be collapsed, moved up or
   down, duplicated, hidden or removed. A removal can be undone from the
   notice that appears, while it is on screen.
3. Optionally give a section a **Background** (the same choices as the
   Background on the Themes screen) and an **Appear** style —
   how it arrives as the visitor scrolls.
4. Press **Preview** to see the unsaved page drawn exactly as the public
   site will draw it, in your current theme. Nothing is saved by previewing.
   **Preview the saved page** shows the version last saved.
5. Save.

Things worth knowing about the builder:

- If the first section is a **Hero**, it becomes the page's heading and the
  usual page banner is not drawn. Otherwise the normal page heading appears
  above your sections.
- A section that points at something (a slider, a form, a content block) only
  offers **published** items. If the item is later unpublished or deleted,
  that section simply disappears from the page rather than showing a gap.
- A **hidden** section stays with the page but is not shown on the site —
  useful for preparing something in advance.
- Switching a builder page back to *Default* keeps the sections; they are
  just not shown until you switch back.
- The page's usual closing call-to-action band is left out if your last
  section is already a CTA banner.

#### Page templates

A **page template** is a whole stack of sections kept so you can start a page
from it again. Five come with the product, written in bracketed placeholder
words such as *[Your headline]* — a landing page, an about page, a services
page, a contact page and an event page — and you can add your own.

- **Save as template** (above the sections) keeps the page you are building.
  Give it a name, a short description and a **Category** — landing page, about,
  services, product, contact, event or other — so it is easy to find.
- **Apply a template** (also above the sections, and **Choose a template** on
  an empty page) opens the list. Pick a category to narrow it. Each template
  shows how many sections it holds, and **Preview** draws it the way the site
  would, in your current theme, without touching your page.
- On a page that already has sections you choose **Add at the end**, which puts
  the template's sections after yours, or **Replace all sections**, which first
  asks you to confirm and tells you how many of yours would go.
- Either way the template's sections are *copied* into the page, so changing the
  page never changes the template. **Nothing is saved until you press Save**,
  and **Undo** takes the whole template out again in one step.
- Templates are managed under **Content → Section library**: filter them by
  category, preview, rename, change the category or delete one. The five
  starters can be edited or deleted like any other; deleting one does not
  bring it back.

#### Shaped edges, moving backgrounds and the in-page menu

- **Shaped edges.** In a section's **Style**, **Top edge** and **Bottom
  edge** change the straight line where the section meets its neighbour into
  a wave, a slant, a curve or a peak. The section needs a **Background** of
  its own — a colour, a gradient or a picture — because the shape is cut
  out of that background; on a section with the default background nothing
  changes. The first section of a page has no top edge.
- **A moving background.** Under **Background**, choose **Animation** and
  pick one. It is drawn slowly in your palette's colours over a dark band,
  with light text on it. Visitors get a small pause button, and it stays
  still for anyone whose device asks for less motion. One or two on a page
  is plenty.
- **An in-page menu.** Add the **In-page menu** section — usually straight
  after the hero — and it lists the sections of the page as links, staying
  at the top of the screen as the page scrolls. It lists only sections you
  have named: open a section, go to **Style** and type an **Anchor** (a
  short word such as `pricing`). The link's wording is that section's
  heading. The menu appears once at least two sections have an anchor, and
  a hidden section is left out of it.

#### Different on a phone, a tablet and a computer

Open a section's **Style** to set a **Minimum height** (the section is at
least that tall, with its content in the middle; **Full screen** fills the
visible window below the site header) and a **Heading colour** (Brand,
Secondary or Accent — a readable shade of your theme colour, matched to the
section's background; a hero, a call to action and your theme's own sections
keep their colours). Below them, **Different on phone / tablet / computer**
lets one screen differ: choose the screen, then change the padding, the space
above or below, the alignment or the height there. **Same as other screens**
means "do what the settings above say". *Normal* is the section's usual
spacing — use it when you want one screen to go back to normal while another
is changed. The live preview shows each screen when you switch it. A section
with a shaped edge does not offer *None* or *S* for the space on that side,
because the edge needs the room.

#### Space around a section, a border and a shadow

In **Style**, **Padding above / below** is the room *inside* a section, on its
background. **Space above** and **Space below** are the room *outside* it,
between it and its neighbours; they never touch the sides. Each is a step —
None, S, Normal, L or XL — and each can differ on phone, tablet and computer in
the same **Different on phone / tablet / computer** panel. **Border** draws a
thin line along the top and foot of the section (Light, Strong or in your brand
colour), and **Shadow** lifts it off the page (Soft, Medium or Large). A shadow
is not drawn on a section with a shaped edge. None of these changes a text
colour, so the page stays readable.

#### A custom layout

When none of the ready-made sections is the shape you want, add **Custom
layout**. It is a section made of **rows**; each row has one to four
**columns**; each column holds **widgets** you add one at a time:

- **Heading**, **Text** (the same editor as a page body, with shortcodes),
  **Button**, **Picture** (from the media library), **Space**, **Rule**,
  **Icon box**, **Questions that open** and **List**.
- **Video** — a YouTube link or a video file from the media library, with an
  optional cover picture, a shape and a caption. Nothing is loaded from YouTube
  until a visitor presses play.
- **Box**, **Tabs**, **Panels that open** and **Columns inside** — widgets that
  hold other widgets. A box is a card around a few widgets; tabs show one set
  of widgets at a time (two to six tabs); panels open and close like the
  questions list (each can start open); columns inside split a column into
  two to four side by side. Each tab, panel or column has its own **+ Heading**,
  **+ Text** and so on. They go one level deep: a tab cannot hold tabs, and a
  form, slider or gallery stays in a column of its own.
- **Form**, **Slider** and **Gallery** — pick one of your published ones from
  the list. A layout section holds one slider and one gallery (each has its own
  Pause button); a form can be used more than once. If you unpublish or delete
  the one a widget uses, the widget leaves the page by itself.

How to use it:

1. Add the section and give it a heading if you like. Open **Row 1**.
2. Choose how many **Columns** the row has. With two, **Split** makes one
   wider than the other. **Stack below** decides where the columns fall one
   above the other on a smaller screen; on a phone they always do, and
   **Second column first when stacked** puts a picture above its words rather
   than below.
3. In each column press **+ Heading**, **+ Text** and so on. Open a widget to
   fill it in. The arrows move a widget up and down, the copy button
   duplicates it, and **Move to** sends it to any other column in the section —
  or into a tab, panel or column of a container. On a computer you can also
  **drag** a row or a widget by the dotted grip (⠿) at its left: drop it where
  the line shows — in another column, into a tab or box, or above another
  row. A box, tabs, panels or columns cannot be dragged into one another, and
  a video, form, slider or gallery stays out of them; where a drop is not
  allowed no line appears. One drop is one step for **Undo**.
   Changing a row to fewer columns moves the widgets of the dropped columns
   into the last column that is left.
4. A column's **Box** can be a **Card** or a **Raised card** (the site's own
   card, in your theme's style) with **Space inside**; **Align text** and
   **Content sits** place what is in it.
5. Every widget has **Show on** — untick Phone to leave a decorative picture
   off a small screen.

Good to know:

- A layout holds up to 8 rows, 4 columns in a row, 8 widgets in a column or in
  a tab, and 40 widgets in all — the widgets inside tabs and boxes count. For more, add a second layout section.
- Heading widgets are given the right heading level for you; the size you
  choose is only how big they look.
- The questions in a layout are not added to the page's FAQ listing for search
  engines — use a **Questions** section for that.
- There is no assistant on this section yet, and the live preview lets you
  edit its heading in place but not the words inside widgets.

### Custom code

For a booking tool, a calculator, a chat or any other snippet a supplier gives
you to paste, add a **Custom code** section.

1. Give it a **name** (what the code is — you will see this in the editor and
   in the previews), and paste the code into the box exactly as you were given
   it. It can hold HTML, CSS and script, up to 50,000 characters.
2. Choose a **starting height**. The code sits in a frame that measures itself
   once it has loaded, so this is only the height it has until then.
3. Save. The code **runs only on the published page**. In the editor and in
   every preview you see a grey note with the name in its place.

How it is kept safe: the code runs inside a frame that cannot read the rest of
the page, your visitors' cookies, or the site's own data, and cannot send the
visitor to another page by itself. Because of that, a few things behave
differently from a script pasted straight into a page: the site's fonts and
colours do not reach into it, and a form in it can only post to this site.

**On the page itself** is a separate choice, offered to administrators only. It
puts the code into the page rather than into a frame, for a widget that has to
see the real page. It can then do anything the signed-in visitor can, so it is
for code you trust completely. If an administrator has chosen it for a section
you can still edit the page and leave the section as it is, or change it to a
frame; you cannot turn it back on. Every save that adds or changes custom code
is written to the activity log.

### Drafting a page with AI

On **Content → Pages**, **Draft with AI** writes a first version of a builder
page for you.

1. Press **Draft with AI**.
2. In **What is the page for?**, describe the page in a sentence or two — who
   it is for, what it should cover, what you want the reader to do.
3. Choose a **Length** (short, standard or long) and whether it may use
   pictures from your media library. Only pictures that have alt text are
   offered to it.
4. Press **Draft the page**. It can take up to a minute. The new page opens in
   the builder.

What to expect:

- The page is saved as a **draft**. Nothing is published until you publish it.
- Anything the assistant cannot know — a figure, a price, a model number, a
  date, a client's name — is written as **[CHECK: …]**. Search the page for
  "CHECK" and replace each one before publishing.
- It never writes testimonials, statistics or prices.
- Its buttons link only to pages your site really has.
- If a message says some sections "did not pass the page's rules and were
  left out", the rest of the page is still complete — add what is missing by
  hand.

It needs the AI assistant switched on and an OpenRouter key saved (see
*Settings*), and each draft counts towards the assistant's daily limit. If it
cannot run, the button opens a note saying why.

### The assistant on a section

Inside the builder, most sections have an **Assistant** line at the top of
their card. Open it to have the wording of that one section written or
changed:

- **Write** — type a line or two about what the section should say, and it
  writes the heading, the text and (for lists such as Features, Steps or
  Questions) the items.
- **Reword** — says the same thing more clearly, at about the same length.
- **Shorten** — makes the running text about half as long. Headings stay.
- **Expand** — makes the running text about twice as long.

For Reword, Shorten and Expand you can add a note, such as "plainer words"
or "more formal".

What to expect:

- It changes **words only**. The picture, the layout, where the buttons go,
  the background and the number of rows in a list all stay as they are.
- Nothing is saved until you save the page. **Undo** — in the assistant, or
  at the top of the builder — puts the old wording back.
- Read the result through. Anything it could not know is marked
  **[CHECK: …]**, and it is told to keep your figures and names exactly, but
  it can still get a detail wrong.
- Bold and italics in a text are not kept. A text that contains a list, a
  link, a picture or a table cannot be reworded this way — the assistant
  says so and leaves it alone.
- Sections that are somebody's words or your own figures — Testimonials,
  Figures, Comparison table — have no assistant.

It uses the same AI assistant as the page draft: it must be switched on with
an OpenRouter key saved, and each use counts towards the daily limit.

### Editing on the page

On a wide screen (1400 pixels or more) the builder shows the page beside its
sections — the **live preview** — and redraws it as you work. **Hide live
preview** above the sections puts it away; **Desktop**, **Tablet** and
**Phone** show the page at each width.

You can change wording directly in that preview:

- Press a **heading**, a **line of text** or a **button's wording** — in a custom layout too: a heading, a button, an icon box's title, a list point or a picture's caption, also inside a box, a tab or a panel. A
  dashed outline under the pointer shows what can be edited. Type; **Enter**
  finishes, **Escape** puts back what was there.
- The section's own fields on the left change as you type, and **Undo**
  takes an edit back. As always, nothing is saved until you save the page.
- The preview redraws when you finish, not while you type.
- Longer formatted text, pictures, links, lists' rows and layout choices are
  still changed in the section's card — pressing anywhere else in a section
  opens it. So are a few words the page draws specially: tab names,
  questions that open and close, links with an arrow, and counting figures.
  In a custom layout the same goes for the names of tabs and panels, and for
  its text widgets, which keep their editor.
- Each field keeps its usual length; typing stops when it is full.

### Sections on other records

The same sections can lay out the **body** of a solution, a service, an
industry, a case study, a blog post, a knowledge article, a product, a shop
product, an event, a vacancy or an entry of your own content types. Open
one, go to its **Sections** tab and set **The
page's body shows** to **Sections**. The builder appears; add and arrange
sections exactly as on a page, then save.

- **Only the body changes.** The page keeps its heading, its related lists,
  its FAQs and the closing band. The sections stand where the written text
  stood, as full-width bands.
- **What you wrote is kept.** The text on the Content tab stays stored while
  it is not shown. Set the choice back to **Written body** and it returns;
  your sections are kept too.
- **Start from what is there.** With no sections yet, **Lay it out as
  sections** turns the written text into sections at its headings.
- Until at least one section is added, the page goes on showing the written
  text.
- Two kinds of section are not offered here, because the page already has
  its own heading: **Hero** and **From the theme**. A **Questions** section
  holds questions you type into it; the page's own FAQs are listed under the
  sections as before.
- On a solution, the lists that normally sit beside the text (technologies,
  hardware, industries) move under the sections as a row.
- On a blog post, the sidebar moves under the sections, beside the comments.
  The list of headings beside a post is not shown, because it is made from
  the written text.
- On a shop product, the sections stand where **Details** stood, under the
  buying panel and the specification. Laying them out needs the **Content
  manager** role; a store manager without it sees a note in the tab, and
  saving the product leaves its sections as they are.
- On an event or a vacancy, the registration panel or the Apply button
  follows the sections.
- Categories do not have a Sections tab: their description is a line in the
  heading, not a body.

### Detail templates: laying out every page of one kind

Sections on a record change one record's body. A **detail template** changes
how **every** solution page, service page, industry page, case study, product
page, shop product page or blog post is arranged, in one place. You build it
once and switch it on.

Open **Content → Detail templates**. Each kind of page has its own part of the
list, saying which template its pages use now — or "the layout the page has
today". **New template** asks for the kind and a name, and where to start:

- **Today's layout** puts the parts of the page into the builder in the order
  the page draws them now. Move one, add a section, and you have a new layout.
- **The body alone** starts with only the record's written body.

The builder works as it does on a page, with one addition. Under **Add a
section** there is a group headed with the kind of page — "This service page's
own parts" — holding **the parts of the page itself**: its heading, its body,
its highlights (benefits, key features, results), the specification, the
pictures, the details you added as custom fields, the answers and the
questions, the related links and lists, the enquiry form, the shop's buy panel,
downloads, reviews and comments. Which of them a kind of page has is decided by
the page; a part it does not have is not offered.

- **A part is drawn from each record.** Nothing is typed into it; its card says
  what it draws and offers only what it can use — some take a heading of your
  own, "Related" takes a count.
- **Each part is placed once.** A part already in the template is not offered
  again. The **Record body** is required and cannot be hidden: without it a
  page would have nothing to say.
- **If you leave the heading out**, the page still starts with its own, so
  every page keeps its one title.
- **Your sections stand between the parts.** Text, features, a call to action,
  a content block and the rest are placed anywhere in the stack. A hero, the
  theme's own sections and "this page's FAQs" are not offered, as for a record's
  body.
- **The closing band stays**, unless the template ends on a call to action of
  its own.

**Preview on a …** draws the template as it is typed, unsaved, around any
record of that kind you choose — a draft too — by the site's own pages. Save,
then **Switch on**. From then on every page of that kind follows the template;
**Switch off** gives every page back the layout it had, and **Delete template**
does the same if it was on. Only one template of a kind is on at a time; switching
another on switches the first off.

Content managers lay out the catalogue's and the blog's pages; store managers
lay out the shop's product page. An administrator does all. A blog post laid
out by a template has no sidebar and no list of headings, which belong to the
default layout.

### Going back to an earlier version

A page remembers its last thirty saved versions, and so does each item in the
section library and every blog post, knowledge-base article, case study,
solution, service, product, shop product, event, vacancy, custom content entry
and landing page. Press **History**, at the top of the edit screen beside
**Share preview**, to see them: when each was saved, by whom, and what changed —
the title or name, the address, the written text, the sections or the template.
You see it for the records your role may edit, as with Share preview.

- **Preview** draws that version the way the site would, without touching the
  page. **Back to the list** returns.
- **Restore** puts that version into the form you are looking at. Nothing is
  saved yet: a bar says which version you loaded, and the page stays as it was
  until you press **Save**. Leave without saving, and nothing has changed.
- Whether a page is published, and when, is never changed by a restore.
- If the old version points at something that has since been unpublished or
  deleted — a slider, a form, a picture — Save will say which section needs
  attention. A section you placed from the library shows the library's content
  as it is now.
- Saves by the same person within five minutes count as one version, and a
  page created and edited straight away is one version. The SEO
  details, questions, custom fields, relations (related products, categories,
  industries), prices, stock and everything else on the other tabs are not part
  of a version — only the title or name, the address, the written text and the
  sections. On a shop product, Restore leaves the sections as they are if your
  account cannot edit them.

## Sharing a draft

Someone who has no account on your site — a client, a colleague, the person who
wrote the words — cannot open a page that is not published yet. **Share
preview** gives them a private link that does.

It is on the edit screen of pages, blog posts, knowledge-base articles, case
studies, solutions, services, products, shop products, events, vacancies,
custom content entries and landing pages. You see it only for records your role
may edit: shop products belong to store managers, landing pages to SEO managers,
and everything else to content managers. Administrators see it everywhere.

1. Open the record and press **Share preview** (next to the status).
2. Choose how long the link should last — **1 day, 7 days or 30 days** — and
   press **Create link**.
3. Press **Copy link** and send the address to whoever should look at it.

Whoever opens the link sees the page as it will look once published, in your
current theme, with a banner across the top saying it is a draft and when the
link stops working. They do not need to sign in, and they see the record as it
is saved *now* — save your changes and they only need to reload.

- **One link per record.** **Make a new link** stops the old one working at
  once. **Revoke link** stops it without making another.
- The window shows when the link expires and **how many times it has been
  opened**.
- A link that is wrong, expired, revoked or replaced shows the ordinary "page
  not found".
- The link is hidden from search engines, is not counted by your analytics and
  is not kept for offline use. Anyone who has the address can read the page, so
  send it only to the people who should see it — it is meant for a draft you
  would be content to show a client, not for anything confidential.
- The preview does not count as a view of a knowledge-base article, and it
  shows nothing a visitor could not see on the published page (an event's online
  join link is never in it).
- Saving a record does not change its link. Deleting a record leaves its link
  showing "page not found".
- A preview is for reading. Buttons that act on a published record — **Add to
  basket** on a shop product, **Register** on an event, **Apply** on a vacancy —
  are drawn so the page looks right, and answer with an error until the record
  is published.

## The blog

**Blog → Blog** lists your articles. Each post has a title, a slug, an
excerpt, a body, a status, a publish date and an author (or *Unattributed*)
on the Content tab, a cover picture on the Media tab, SEO, and FAQs and answer
blocks on the AEO tab. The reading time is worked out for you.

- **Categories.** The **Categories** picker beside the post files it;
  **Manage categories →** opens **Blog → Blog categories**, which holds the
  categories readers can browse by, with a count of posts in each. Each
  category gets its own colour on the site automatically, and one with
  nothing published in it is hidden rather than shown empty.
- **Featured** (*No* / *Yes*). Featured posts fill the large lead area at the
  top of the blog page; with none featured, the newest posts do.
- **Comments on this post** (*Open* / *Closed*) closes one post to comments.
  It only matters while comments are switched on in **Blog → Settings**.
- A post with a publish date in the future stays hidden until that date.

### Comments

Comments are **off** by default. An administrator switches them on under
**Blog → Settings**, which also sets how many days after publication
comments close (old articles are where spam collects) and the optional
YouTube video shown in the blog's sidebar.

Every comment — even from a signed-in customer — waits in **Blog → Comments**
until somebody approves it. Nothing is ever approved or thrown away
automatically. Each comment carries a rough "likely genuine" score to help
you work through a long queue, but the decision is yours.

- **Publish** puts it on the article. **Spam** hides it and can be undone.
  To remove one for good, type its id under the list and press **Delete for
  good**.
- You can tick several comments and press **Publish**, **Spam** or **Bin** for
  all of them at once.
- Replies are one level deep: a reply to a reply is shown under the original
  comment.
- Staff get at most one email an hour about new comments, however many
  arrive.

## Knowledge base

**Content → Knowledge base** holds support articles, grouped by category and
tagged. The public search matches titles, text and tags, and ignores
punctuation — so "wifi" finds "Wi-Fi". Add the words your customers actually
type as tags.

Each article's page asks "Was this helpful?". The counts are shown on the
article's form for your information; they cannot be edited.

## Case studies

**Content → Case studies** records work you have done: client name, industry,
cover picture, the story, and a set of **results** (a figure and a label in
two boxes, such as "40%" and "faster backups"). A case study is on the site as soon as its
status is Published; there is no separate publication date.

## FAQs

Questions and answers belong to a record — a solution, service, product,
page, product category, brand, blog post, knowledge base article, industry,
shop product or shop category, or a custom content entry — and appear on
that record's page. You can edit them in two places:

- on the record's own form, which is usually easiest; or
- in **Content → FAQs**, which lists every question on the site in one place
  and lets you search them.

A question must be attached to something; an unattached one would never
appear anywhere. Where a page has two or more questions, search engines are
told about them automatically.

## Content blocks

Under **Site** are four kinds of reusable block. You build one once and place
it on any page with its shortcode, in a builder section, or (for three of
them) on the homepage.

| Screen | Layouts |
|---|---|
| **CTA banners** | Full-width band, Split with image, Two paths, Button with reassurance, Inline newsletter, Gated download, Countdown, Webinar strip, Hiring, App download with QR |
| **Stat bars** | Four-figure row, Metric cards with sparklines, Ring gauge trio, Count-up on view, Anomaly pulse strip, Feature cards, Figures as chips |
| **Pricing** | Three-tier with highlight, Comparison table, Single plan focus |
| **Technology stack** | Orbit, Grouped cards, Technology cloud, Globe, Marquee rows, Layers |

Each layout's form asks only for what that layout shows. On a saved block,
**Preview** opens it in a new tab as the site draws it, in your current
theme. On the list, **See them all as the site draws them** shows every
block of that kind side by side, drafts included.

- **The default CTA.** One published CTA banner can be marked as the site
  default (**Use as the site default** on its form). It then replaces the closing band at the foot of every page. With
  none marked, each theme's own band is used.
- **Gated download and webinar banners** collect an email address. Each
  request becomes a lead (chapter 10), and the download link is only revealed
  after the form is sent.
- **Inline newsletter banners** add people to the newsletter list, and are
  hidden while newsletter signup is switched off.
- **On the homepage.** An administrator picks one published stat bar, pricing
  table and technology stack under **Site → Settings → Homepage**; where they
  sit and whether they show is set on **Site → Themes** (chapter 15).
- A block's **kind cannot be changed** once it is saved; its layout can.
- Changing a block's **slug** breaks every shortcode that uses the old one.

## Menus

**Site → Menus** controls the site's navigation in four places:

| Location | Where it appears | Levels shown |
|---|---|---|
| Top bar | The dark strip above the header | One (items with children open a panel) |
| Main navigation | The header | Up to three |
| Footer | The footer's columns | Up to three |
| Footer bottom bar | The bottom row beside the copyright | One |

If no menu is assigned to a location, the site shows its own built-in
navigation there — so an install that never touches this screen still has
working menus.

A menu item can be:

- **a record** — a page, solution, service, industry, product category,
  product, blog post, case study, article, landing page, custom content
  entry, or a custom content type's list page. The link follows the record, so renaming its slug never breaks the
  menu. If the record is deleted, the item quietly disappears.
- **a site section** — one of the site's own index pages (Blog, Products,
  Support and so on).
- **a live list** — all published solutions, services, industries or product
  categories, filled in automatically as you publish more. Nothing can be
  nested under a live list.
- **a custom link** — any web address, email (`mailto:`) or phone (`tel:`).
  A custom item with no address becomes a **heading** for the items under it.

To change a menu:

1. Open **Site → Menus** and choose the menu for the location.
2. Add items, indent them to nest them, and reorder them with the arrows.
3. Tick **Open in a new tab** only for links that leave your site.
4. Save. The site updates straight away.

**Rebuild to default** replaces a location's menu with the site's built-in navigation.
It is the way back from a menu that has become a mess, and it discards what
was there. Links to pages that have nothing published on them yet (Team,
Clients, Careers and so on) are hidden until the first item is published.

The top bar's telephone number, email and search box, and the bottom bar's
copyright line, are part of the site itself — a menu cannot remove them.

**Badges.** Open an item on **Site → Menus** and type a short word — *Live*,
*Beta*, *Soon*, *New* — into **Badge** (twelve characters at most), then choose
its **Badge colour**. It appears as a small outlined label beside the item in
the top bar's panel, the header's dropdown and the phone menu. Leave it blank
for none. The colours follow your theme and stay readable on whatever colour
the top bar is.

**A customer zone in columns.** On the top bar, build a link such as *Customer
Zone* with a few **headings** under it (a custom item with no address — *Compute*,
*Network*, *Support*), and under each heading the links, each with an optional
**Description**. Then choose **Site → Themes → Top bar panel → Columns**
(chapter 15): the panel opens wide, with each heading in small capitals over its
own column, everything visible at once. A link placed directly under *Customer
Zone* (not under a heading) shows in a first column with no heading. Up to four
columns sit side by side; more wrap to a second row, and on a phone the panel
narrows to the screen.

## Popups

**Site → Popups** shows a message, a picture, or both, in a box over the page.

1. Press **New popup** and give it a name (for your own reference).
2. Add a picture, a message, or both. A link makes the whole popup clickable.
3. Choose **where** it shows: tick site sections (the whole of Store, say) or
   list individual page addresses.
4. Choose **when**: *After a delay*, or *When the pointer leaves the page*
   (exit intent — phones fall back to the delay).
5. Choose **how often**: once per visit, once a day, or every page load (use
   sparingly).
6. Choose a size, and optionally dates it should show between.
7. Publish and save.

- **Only one popup ever shows on a page.** If two match, the one higher in
  the list wins. Use each popup's **Order** field to decide.
- A visitor whose browser blocks site data will not see "once per visit"
  popups at all, rather than seeing them on every page.
- Deleting a popup leaves its picture in the media library.

## Sliders and galleries

**Site → Sliders** builds carousels of slides. Each slide has a picture, a
video file (MP4 or WebM) or a YouTube video, plus a heading, a caption and a
button.

- **Layouts:** Full width, Split (words beside the picture), Stacked cards,
  Fanned photos, Cylinder carousel, and Ripple. Stacked cards, Fanned photos
  and Ripple need at least two slides, and Cylinder carousel five; with too
  few, the slider shows as a plain banner.
- **Transition** (Slide, Fade, Zoom, None) is how one slide gives way to the
  next — used by Full width and Split only, since the other layouts move in
  their own way. **Text animation** (None, Fade in, Rise, Slide in, Zoom) is
  how the words arrive.
- **Advance slides automatically** moves the slides on by themselves;
  visitors always get a Pause button.
- Two sliders are used by the site itself: **homepage-hero** and
  **store-hero**. Deleting either asks you to confirm, because the homepage
  or shop front falls back to its plain design without it.
- A slider with no slides shows nothing.

**Site → Galleries** holds sets of pictures, optionally split into tabs, with
a full-screen viewer when a picture is pressed. Captions are shown under
pictures, never over them. A gallery with no pictures shows nothing.

Place a slider or gallery with its shortcode, a builder section, or (for the
two named sliders above) by editing them directly.

## Forms

**Site → Forms** builds your own forms — a quote request, an event
registration — without a developer.

The form screen has three tabs: **Details**, **Fields** and **Put it on a
page**.

1. Press **New form** and, on **Details**, give it a **Name**, a **Submit
   button label** and a **Message after sending**.
2. On **Fields**, press **Add a field** for each question and choose its
   **Type**. Mark the ones that are required.
3. Set **Notify** to the address that should receive each submission (blank
   uses the **Sales email** from **System → Settings → Contact**).
4. Publish, save, and place it with `[form slug="…"]` or a builder section.

### Field types

| Type | What the visitor sees |
|---|---|
| Short text, Paragraph | One line, or several |
| Email, Phone, Web address, Number | A box that checks what is typed. A Number can have a smallest and a largest value |
| Date | A date picker. You can set an earliest and a latest day, or "Today" |
| Dropdown, Single choice | One answer from your list — in a menu, or with every option visible |
| Multiple choice | Any number of answers from your list |
| Tick box | One box, such as a consent |
| Rating | Five stars |
| File upload | One file. You choose what is accepted — images, PDF, office documents — and the largest size |
| Hidden value | Nothing. A fixed value you set (a campaign name, say) is saved with every submission |

Two more rows lay the form out and collect nothing: **Add a heading** puts a
title and an optional paragraph between fields, and **Add a step break**
starts a new step.

- Rows fold. Press a row's title to open it; use the arrows to reorder.
- A field's **Key** is the name its answer is stored under. It is made from
  the label when you add the field; changing it later separates the field
  from answers already collected.
- Once an option of a Dropdown, Single choice or Multiple choice has been
  saved you can reword its label freely — earlier answers still match.

### Showing a field only when it is needed

Open a field and press **Show this field only when…**, then choose an earlier
field, a comparison and an answer — for example *"What kind of site is it?"
is "Data centre"*. The field then appears only for visitors who answer that
way. A field that stays hidden is never required and nothing is saved for it.

A condition can only read a field **above** it, and cannot read a File upload
or a Hidden value. If you move or remove the field it reads, the row shows a
warning until you choose another or press **Always show**.

### Forms in steps

Add a **step break** wherever a new step should start and give it a title.
The visitor sees one step at a time with **Back** and **Next** and a
"Step 2 of 3" bar; required fields are checked before moving on. Everything
above the first break is the first step.

### File uploads

A form can have up to three File upload fields. Uploaded files are kept
privately: they are not attached to the notification email and have no public
address. Download them from the form's submissions.

### After sending

By default the visitor sees your **Message after sending**. Fill in **After
sending** (on Details) to send them to a page instead — a path on your
site such as `/thank-you`, or a full `https://` address.

- Every submission also becomes a **lead** (chapter 10), with the page it was
  sent from.
- If the form has an Email field, the sender gets an automatic
  acknowledgement. It does not repeat what they typed.
- **Submissions** are opened from the form's row in the **Submissions**
  column of **Site → Forms**, and are kept even if the form is later deleted.
  Each shows the answers, a download link for any uploaded file and a
  **Delete** (which also deletes its files). **Export CSV** downloads every
  submission of that form as a spreadsheet.
- A required tick box must be ticked — a consent cannot be skipped.
- A field cannot be called `website` — that name is reserved for the
  site's spam trap.

### Putting a form on another website

Tick **Allow this form to be embedded elsewhere**, save, and copy one of the
two snippets shown:

- the **frame** snippet shows the live form and always stays up to date;
- the **HTML** snippet is plain markup the other site can style — but it is a
  copy, so if you add or remove a field later, paste it again. It is not
  offered for a form with a file upload, steps or a conditional field; those
  work only in the frame.

## Custom fields

**Content → Custom fields** adds fields of your own to existing records — a
"Warranty" line on products, a "Duration" on services — without any
development work.

1. Press **New field group**, name it, and under **Attached to** tick which
   kinds of record it applies to.
2. Add fields: Text, Long text, Rich text, Number, Date, Link, Email address,
   Dropdown, Checkboxes, Yes / no, Image, File, Linked record, or List of short
   items.
3. Under **On the public page**, choose **Drawn on the page** (a "Details"
   section after the body, showing each field you mark to show) or **Data
   only** (not drawn, but still available to integrations).
4. Save. Every form for those records now has a **Fields** tab, last in the
   row.

- A field's kind cannot be changed once any record holds a value for it.
- Deleting a field or a group deletes every value stored in it.
- "Data only" means not drawn on the page — **not** private. Never put
  anything confidential in a custom field.

## Custom content types

**Content → Content types** creates a new kind of record with its own pages —
"Partners", "Whitepapers", "Press releases" — each with its own list page and one page
per entry. **Content → Custom content** is where the entries themselves are
written.

1. Press **New content type** and fill in its name, plural name, the
   **Address** it lives at (for example `events`), whether entries have a
   body and a picture, whether it has an archive (list) page, and the
   **Archive order**.
2. Optionally attach a custom field group to it (above).
3. Add entries under **Custom content**. Each entry has a title, summary,
   body, picture, status, FAQs and SEO, like any other record.

- The address you choose must not clash with an existing page or a part of
  the site; the console refuses one that does.
- Renaming the type's address redirects the old addresses automatically.
- A type that still has entries cannot be deleted. Switching the type off
  hides its list page and every entry at once.

## Things to know

- A save from the console shows on the site at once; anything changed by
  other means can take up to ten minutes.
- Only one popup shows per page — the order of the list decides which.
- Content blocks, sliders, galleries and forms must be **published** before
  a shortcode or builder section will show them.
- Changing a slug is safe for pages and records (a redirect is written), but
  **not** for sliders, galleries, forms and content blocks: every shortcode
  using the old slug stops working.
- Pictures belong in the media library; the editor will not keep a pasted
  image inside the text.
- The seeded demo content — sample pages, the sample builder page, sample
  blocks, the "Why" block — is placeholder text and must be replaced before
  launch.
- Blog comments are never approved automatically, and the queue is only
  there once an administrator switches comments on.
