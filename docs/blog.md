# The blog

The front's arithmetic, category colours, seeding, comments.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The blog's front is one 4:3 lead beside three 4:3 rows, and the two
columns agree by arithmetic.** Every picture on the blog is 4:3 — the hero,
the rows, the cards, the post page — so the lead's height is a function of
its width and `blog-hero.tsx` sizes the side column to meet it: the thumbnail
is 5/16 of its row, which puts three 4:3 thumbnails and two gaps within a
few pixels of one 4:3 lead from `lg` up (measured at 1024, 1440 and 1920).
The slack is absorbed in both directions — `grid-rows-3` spreads the rows
with each thumbnail centred when the lead is taller, and the lead's picture
is `flex-1` when the list is. Change the thumbnail fraction and re-measure;
the first cut let each row size itself and the column ran a third taller
than the picture beside it.

**The lead's title sits over the photograph on a gradient whose first stop
is held.** White on a plain gradient measured 1.14:1 once; a solid band under
the picture passed and read as a caption. `from-dark from-60%` keeps the
bottom 60% of the overlay opaque and the chips, title and date all sit inside
it — `_blog-hero-probe.mjs` asserts that at five widths — so the audit's
"worst opaque stop" is what a reader actually gets.

**A blog category's colour is a hash of its slug into `--color-tag-1…12`.**
The same twelve identity hues as the icon tiles, walked in `tagsFor()`
against *this* palette's `card` to a 5:1 text floor and emitted with the
theme; `--color-tag-fill-N` is the same hue as a fill under white for the
chip on the lead's dark caption. Both sets are in `npm run themes`. The walk
direction comes from the card's luminance, not the scheme: the gate's
`inverted-base` palette types a near-black background as the light scheme,
and walking darker there reaches black and stops. Nothing to configure and
nothing stored — a new category is coloured the moment it exists, and a
rename does not move it because the slug is what a rename leaves alone.

**`BlogPostSeeder` creates and never overwrites a written post.** Twenty
articles from `database/seeders/data/blog-posts.php`; a post is written only
when it does not exist or when what exists is a stub under a hundred words
— the two original placeholders. The first cut was `updateOrCreate` on the
whole row, which made re-seeding a way of deleting an editor's changes.
Covers are not seeded: they are media-library files, cropped 4:3 on import,
and `DemoContentSeeder` fills a blank path with a generated banner.

**A blog comment is never published by anything but a person, and never filed
as spam by anything at all.** Everything arrives `pending`, including from a
signed-in customer — one exception and the queue stops being trustworthy. The
score is a hint for whoever is reading two hundred rows and decides nothing:
auto-filing eventually hides a real reader whose comment was three words, and
the failure is silent and permanent. The body is **plain text stored plain**,
which removes stored XSS from the feature rather than defending against it —
`HtmlSanitiser` protects a content manager's markup, and pointing it at
anonymous input is a different proposition. One level of replies, enforced on
write, because a parent id is a number in a request body. The IP is hashed with
`APP_KEY` as the salt: an unsalted hash of an IPv4 address is reversible by
trying all four billion. The desk notification is throttled to **one an hour**,
not one per comment — nobody is waiting on a blog comment, and four hundred
emails from one spam run is the notification people build a filter for.
