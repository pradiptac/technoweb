import type { Metadata } from "next";

/**
 * The layout for anything meant to be framed by another website.
 *
 * Deliberately outside `(marketing)`, which is where the header, the mega
 * menu, the footer, the cookie banner, the popups and the website assistant
 * are mounted. Every one of those would be wrong inside somebody else's page:
 * a second site's navigation appearing in the middle of a partner's contact
 * page is not an embed, it is an intrusion, and a cookie banner shown inside a
 * 600px frame is one nobody can read or dismiss.
 *
 * So this supplies its own `<main>`. The root layout stopped providing one
 * when the marketing chrome moved out of it, and the skip link targets
 * `#main` — which is chrome a framed page has no use for either, so the id is
 * here and the link is not.
 */
export const metadata: Metadata = {
  /*
   * Never indexed, and this matters more than it looks.
   *
   * The same form already lives on a real page of this site with its own
   * heading, breadcrumbs and copy. A bare, chrome-less duplicate of it
   * competing in the index is the thin-page problem the whole landing-page
   * module exists to prevent, arrived at from the other direction — and a
   * search result landing somebody on a form floating on a white page, with no
   * way to reach anything else, is a worse answer than the page it came from.
   */
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="p-4">
      {children}
    </main>
  );
}
