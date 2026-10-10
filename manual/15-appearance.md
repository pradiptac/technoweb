# Appearance: themes, colours, motion and the info bar

*Who can use this: Administrator.*

This chapter covers how your website looks and moves: the site theme and its
options, the colour palette and fonts, section backgrounds and how sections
appear, the motion settings, page banners, the info bar above the header, the
sign-in screen's background, and where the chat assistant's look is set.

| What | Where |
|---|---|
| Site theme, menu style, heading style, homepage sections | **Site → Themes** |
| Colour palette, fonts, motion, page banners | **Site → Settings** |
| The info bar | **Site → Info bar** |
| Sign-in screen background | **System → Settings → Sign-in screen** |
| The chat assistant's look | **Assistant → Settings** (chapter 16) |

Every change here reaches the public site on the next page load. Visitors who
have asked their device for reduced motion never see animations, whatever you
choose.

## Site themes

A **theme** is the overall layout and character of the public site: the
header, the homepage, how inner pages open, how cards and lists are drawn, and
the footer. Your content is the same in every theme — switching changes only
how it is presented. The customer portal and the console are not affected.

**Site → Themes** shows every theme with a short description:

| Theme | Character |
|---|---|
| Classic | The site as designed: mega menu, sectioned homepage, banner headings. The default |
| Editorial | Set like a newspaper: a centred nameplate, rules instead of cards, serif headlines |
| Datacenter | An operations floor: dark header and hero on a grid, monospace readouts, racks instead of cards |
| Launch | A product launch: floating pill header, a bento front page of rounded tiles |
| Terminal | A command line: monospace headings, square corners, a status ticker, tables |
| Enterprise | A large IT-services company: corporate white, a navy statement band, services as tabs |
| Summit | A software company: dark centred hero, trust badges, a tabbed catalogue |
| Horizon | A hosting company: full-width rotating banner, service cards, a statistics band |
| Canvas | Warm and editorial: cream background, serif headlines, coral buttons, solid-colour cards |
| Sentinel | A security company: near-black top, one glowing brand line, light display type |
| Vantage | An agency: a see-through pill menu over a full-screen slider, photograph cards |
| Keystone | An enterprise platform: pill navigation, a heavy centred headline, the product in a glowing frame |

To change theme:

1. Press **Preview in a new tab** on a theme to see your own site in it, in a new tab.
   Nothing changes for visitors while you preview.
2. Choose the theme and press **Activate** (the button carries the theme's
   name; with the active theme chosen it reads **Save options**). The site is
   rebuilt on its next request.

If the screen says **the server is overriding this choice**, your hosting
configuration has fixed the theme (an emergency switch your supplier can set
if a theme misbehaves). Your choice is kept and applies once the override is
removed.

### Theme options

Below the gallery, under **Options for …**, are the chosen theme's own
options. The choices are kept per
theme, so trying another theme and coming back loses nothing.

- **Menu style** — how a section's links open under the header: *Simple* (a
  narrow list), *Semi mega* (two compact columns with icons), *Mega* (three
  columns with icons and summaries) or *Big mega* (a panel the width of the
  header).
- **Top bar panel** — how a link in the strip above the header opens when it
  has a menu under it (a *Customer Zone*, say). *Same as the menu* follows the
  menu style above. *Columns* opens a wide panel under a thin brand line, a
  heading over each column of links with its badges and descriptions. Every
  theme draws it in its own idiom.
- **Inner page heading** — how pages open: *Banner* (the section's picture
  behind the heading), *Cover* (taller, words centred), *Split* (words left,
  picture framed on the right) or *Compact* (headline only, no picture).
- A few themes offer an option of their own, shown only for that theme
  (Sentinel's **Category card heading**, for example).
- A theme that does not use an option shows it greyed out.

### Header & footer

**Site → Header & footer** chooses which parts of the header and footer a theme
shows. Pick the theme at the top (it starts on the one the site uses); the list
shows only the parts *that theme* has, because each theme draws its own header
and footer and this does not change how they look.

- **Switch a part off** — the top bar, the phone number, the email address, the
  search field, the top-bar links, the main button, a second button, the
  basket mark beside Store; in the footer the logo, tagline, address, phone
  number, social icons, link columns, newsletter signup, policy links, credit
  line and the light / dark switch. Switching a part off only frees the room; the
  rest of the header stays where the theme puts it.
- **Move a part** — the up and down arrows appear on parts that share a row or a
  block and that the theme can reorder (the search and the phone number in the
  header, say, or the tagline and the address in the footer).
- **The main button** has its own *Words* (up to 30 characters) and *Links to*
  (a page such as `/contact`, a full `https://` address, `mailto:` or `tel:`).
  Leave either blank to keep the theme's own. On a phone a long label is cut short
  with an ellipsis so the header still fits.
- **A light / dark switch in the header** is off until you switch it on, and shows
  from 1600px wide; the footer's switch shows at every width.
- The preview beside the list is the theme's real homepage as last saved, at
  desktop or phone width. **Restore defaults** puts a theme back as it came.

The phone number and the search in the mobile menu are not affected by these
switches.

### Homepage sections

**Homepage sections** lists the parts of the homepage in order: Hero,
Partners, Solutions, Product categories, Why us, Trusted by, Credentials,
Reviews, Industries, Web services, Support band, Case studies, Resources, the
stat bar, technology stack and pricing blocks (if chosen), and the Closing
band.

For each section you can:

- **switch it off** by unticking **Show** (the hero is always shown);
- **move it** up or down with the arrows;
- give it a **Background**:

| Background | Effect |
|---|---|
| Theme's own | Whatever the theme draws |
| None | No band — the page's own background, light in light mode and dark in dark mode |
| Solid colour | One colour |
| Gradient | Two colours at an angle |
| Picture | A wide photograph (1920 px across or more) under a colour overlay, whose strength you set |

  The text colours inside a coloured section are worked out for you so the
  words stay readable on any colour you pick;
- choose how it **Appears** as the visitor scrolls: *Rise*, *Fade*, *Zoom*,
  *Drop*, *Assemble*, *Cascade*, *Focus*, *Unfold* or *None*. A homepage
  section does not move unless you choose a style. The hero never animates,
  and the Closing band has no Appear choice — it rises on its own.

The same **Background** and **Appear** choices are offered on each section of a builder page (chapter
05).

## Colour palette and fonts

**Site → Settings → Colour palette** sets the colours and typefaces used
everywhere — the public site, the customer portal and the console.

- Choose a ready-made palette (the first, **House**, is the default),
  or type your own under **Custom colours**: **Primary**, **Secondary**,
  **Accent**, **Background** and **Text**, plus an optional **Top bar colour**.
  Choosing a ready-made palette copies its colours into these boxes, so you can
  start from one and adjust it.
- Choose a **Headline font** (nineteen offered) and a **Body font** (a few
  of the nineteen are for headlines only, so the body list is shorter).
- A preview below the fields shows the choice in both light and dark.

### Your own fonts

If your company has its own typeface, open **Your own fonts** under the two
font lists.

1. Type the font's **name** as it should appear in the lists.
2. Choose the font file. It must be a **WOFF2** file (ending `.woff2`). If
   you were given a TTF or OTF, convert it first — free online converters do
   this.
   - If the font came as one file that holds every weight (a *variable*
     font), tick **This is a variable font** and upload that one file.
   - Otherwise upload the **regular** weight and, if you have it, the
     **bold** weight. Headings use the bold one.
3. Press **Upload font**.

The font now appears at the end of the **Headline font** and **Body font**
lists, marked *(your font)*. Choose it there and press **Save site
settings** — uploading alone does not change the site.

You can keep two fonts. **Remove** deletes one; if the site was using it, it
goes back to the default font.

Check that your licence for the font allows use on a website. Some themes
set their headings in a typeface of their own and keep it whatever you
choose here.

The colours you type are treated as a direction rather than exact values:
every shade the site needs — for buttons, links, borders, hover states and the
dark mode — is generated from them and adjusted until all text passes
accessibility contrast rules. So an unusual colour may come out slightly
darker or lighter than typed; that is deliberate.

**Light and dark.** Visitors can switch between light, dark and "follow my
device" themselves (the control is in the footer). The console remembers its
own choice separately. You do not need to design a dark version: it is
derived from the same palette.

### Looks, corners, spacing, cards and headings

On the same screen:

- **Looks** — six ready-made combinations (Corporate, Modern, Bold, Calm,
  Editorial, Statement). Pressing one sets the palette, the two fonts and the
  four choices below together; adjust anything afterwards before saving.
- **Corners** — *Soft* (the default), *Sharp* or *Round*, for cards, buttons,
  pictures and fields.
- **Spacing** — *Comfortable* (the default), *Compact* or *Airy*: the room
  between the site's sections.
- **Cards** — how every card sits on the page: *Flat* (the default),
  *Elevated* (a soft shadow), *Outline* (a firmer border), *Soft* (no border,
  a wide shadow) or *Glow* (a halo in your brand colour).
- **Headings** — *Standard* (the default), *Compact* or *Large*: the size of
  every heading, in any theme.

The preview beside the fields is your real site in the look you are
choosing; nothing is saved until you press **Save site settings**. These
apply to the public site and the customer portal, not to the console.

## Motion

**Site → Settings → Motion** sets how the public site and customer portal
move. The console keeps its own quieter motion whatever you choose.

| Setting | What it decides | Choices |
|---|---|---|
| **Sections arriving** | How a section comes into view on scroll | Lift, Float, Fade, Zoom, Focus, Assemble, Cascade, Unfold, None |
| **Buttons** | What a button does under the pointer | Lift, Glow, Scale, Shine, Ripple, Flat |
| **Page transitions** | How the next page arrives | None, Fade, Rise, Zoom |
| **While the next page loads** | What shows while it loads | None, Bar, Pulse |
| **First-visit splash** | A small loader for about a second on the first page of a visit | Off, On |
| **Behind a heading** | The backdrop behind the homepage hero, plain page headings and the closing band | Grid, Aurora, Dots, Plain |

A section's own **Appear** choice (above) overrides **Sections arriving** for
that section.

## Page banners

**Site → Settings → Page banners** sets the picture behind each area's page
heading: Solutions, Products, Web Services, Industries, Store, Support,
Resources and Company, plus a **Default banner** for any area left blank.

- Use wide, landscape pictures — about 2000 × 560. Darker pictures work best;
  every banner is dimmed automatically so the heading stays readable.
- There is no per-page banner: every page in an area shares one, which is what
  makes an area feel like one place.
- Set a focal point on each picture in the media library (chapter 14) so the
  crop keeps the subject.
- **Show page banners** set to 0 hides them all at once without removing the
  pictures.
- The *Banner* and *Cover* heading styles show these pictures; *Compact* never
  does, and some themes draw headings their own way.

## The info bar

**Site → Info bar** puts a thin strip above the header on every public page —
a sale, a new office, a holiday closure.

1. Write the **Message** in the editor lower down the screen. Bold,
   italic, underline and links are kept; headings, pictures, tables and
   colours are removed when you save.
2. Choose a **Background**: *Solid* (one colour) or *Gradient* (two). The text
   colour is chosen automatically to stay readable.
3. Choose how the message moves (the choice headed **Message style**):
   - *Fixed* — centred and still, one line (anything longer is cut);
   - *Ticker* — scrolls across, with a pause button;
   - *One line at a time* — each line rises into view in turn. Press Enter
     in the message for each new line.
4. Switch on **Visitors can close it** if you want a close button. A closed
   bar stays closed for the rest of that browser session; a changed message
   shows again.
5. Optionally set **Show from** and **Show until** — the bar switches itself on
   and off by the server's clock, so it is right whatever time zone the visitor
   is in.
6. Switch on **Show the info bar** and press **Save info bar**. The site
   picks it up immediately.

## Sign-in screen background

**System → Settings → Sign-in screen** sets what sits beside the sign-in,
registration and password forms — for staff and customers alike:

- **Behind the form** — a *Picture* (the *Sign-in image* you upload, or the
  brand gradient if none), or one of the animations: Particles, Waves,
  Circuit, Geometric, Data flow, Gradient, Quantum, Stars, Wave grid, Aurora,
  Fluid morph, Twisting ribbon, Animated rays, Perspective grid, Light lines.
  Animations are drawn in your own palette's colours.
- **Animation intensity** (Medium, the default, Low or High) and **Animation
  speed** (Normal, the default, Slow or Fast).
- **Message in the panel** — a heading and a line or two, shown over the
  background in place of the tagline.

The panel is hidden on phones, where the form takes the whole screen.

## The phone action bar

**Site → Settings → Phone action bar**. Switch it on and a bar stays at the
bottom of the screen on phones, with up to three buttons:

- **Call** — rings the phone number under System → Settings → Contact.
- **WhatsApp** — opens a chat with the number you enter here (with the
  country code, digits only). Left blank, it uses the chat assistant's
  WhatsApp number.
- **A third button** of your own — "Enquire" and `/contact` to start with.
  Change the wording and where it goes; clear the link to hide it.

A button with nothing to use is left out. Nothing changes on a tablet or a
computer.

## The coming-soon page

**Site → Settings → Coming soon**. Switch it on and every visitor sees a
holding page — your heading, message and an optional picture, with your phone
number and email — instead of the website. Use it before launch, or while
you rework the site.

- You still see the real website in any browser where you are signed in to
  the console, and the console shows a reminder that visitors do not.
- The console, the customer portal and the links in emails customers already
  have (orders, visits, meetings) keep working.
- To check the wording before switching it on, open `/coming-soon` on your
  site while signed in.
- Allow up to a minute for the switch to take effect, on and off.
- It keeps visitors and search engines away; it is not a way to protect
  confidential pages.

## The chat assistant's look

The assistant's name, colour, background, icon, text size, launcher animation
and whether its name shows beside the button are set in **Assistant →
Settings** — see chapter 16.

## Things to know

- Preview a theme before switching; your content does not change, but the
  homepage's layout and order may.
- Custom colours are adjusted for readability; exact brand hex values may
  shift a little.
- Section backgrounds and banners use pictures from the media library — set
  focal points so crops behave.
- Reduced-motion visitors see no animation at all, by design.
- An info bar with dates switches itself off; one without dates stays until
  you switch it off.
