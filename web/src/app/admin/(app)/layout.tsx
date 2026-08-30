import { Suspense } from "react";
import Link from "next/link";
import { CreditLine } from "@/components/layout/credit-line";
import { SchemeToggle } from "@/components/ui/scheme-toggle";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ToastProvider } from "@/components/ui/toast";
import { ToastFromParams } from "@/components/ui/toast-from-params";
import { Logo } from "@/components/layout/logo";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/settings";
import { APP_VERSION, VERSION_LABEL } from "@/lib/version";
import { ScrollTop } from "@/components/ui/scroll-top";
import { cn } from "@/lib/utils";
import { logoutAction } from "./actions";
import { AdminNav } from "./admin-nav";

/**
 * Every route under this layout requires a staff session. The login page
 * sits outside the (app) group deliberately — guarding it too would redirect
 * to itself forever. Mirrors portal/(app)/layout.tsx.
 *
 * The bar is deliberately thin. It used to be an 89px banner carrying an
 * <h1> that said "Admin console" on all 46 screens — a heading that described
 * the furniture rather than the page, and 125px of the viewport gone before
 * any content. The page's own <h1> now lives in the content area, which is
 * both denser and the right way round semantically.
 */
/**
 * The console runs wider than the public site.
 *
 * `Container` is 90% because that is right for marketing pages, where a
 * measure and a rhythm matter more than the last few percent of the glass.
 * The console is a tool worked at a desk: its tables carry `min-w-[NNNpx]`
 * floors that are released between `md` and `xl` precisely because the room
 * runs out, so width here buys columns rather than air.
 *
 * One constant and not three literals — the header, the content grid and the
 * footer have to agree, and three copies of a number is three chances for the
 * header to stop lining up with what is under it.
 */
const CONSOLE_WIDTH = "w-[95%]";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [staff, settings] = await Promise.all([getCurrentStaff(), getSiteSettings()]);

  if (!staff) redirect("/admin/login");

  const roles = staff.roles.map((r) => r.label).join(", ");

  /*
    The toast region wraps the whole area rather than sitting inside <main>.

    It is chrome about what just happened, not part of what the page says —
    the same argument that puts ScrollTop outside the landmark. Inside <main>
    it would also be one more thing between the skip link and the content.
  */
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-surface">
        <div className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur-[10px]">
          <Container className={`${CONSOLE_WIDTH} flex h-13 items-center gap-3`}>
            <Link href="/admin" className="group/logo flex shrink-0 items-center gap-2.5">
              <Logo
                className="text-[17px]"
                logoUrl={settings.logo_url}
                logoWidth={settings.logo_width}
                logoHeight={settings.logo_height}
                companyName={settings.company_name}
              />
              {/*
                A chip rather than loose text beside the wordmark, so "Console"
                reads as a badge on the product name instead of a second thing
                the logo is called. It stays inside the logo's link — the whole
                cluster goes to the dashboard, which is the only thing it could
                usefully do — and is styled, not made into a <button>: a button
                inside an anchor is invalid, and one that navigates is a link
                wearing the wrong element.

                The version sits in its own pill against the chip's ground so
                the two read as label and value rather than one long string. It
                keeps its `title`, because "v0.9.0" at 9.5px is decoration to
                anyone who cannot read 9.5px.
              */}
              <span
                title={`Console · version ${APP_VERSION}`}
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border border-line-strong bg-surface-2",
                  "py-[3px] pr-[5px] pl-2.5 text-[10.5px] font-semibold tracking-[.09em] text-muted uppercase",
                  "transition-colors group-hover/logo:border-brand-600 group-hover/logo:text-brand-ink sm:inline-flex",
                )}
              >
                Console
                <span className="rounded-full bg-card px-1.5 py-px text-[9.5px] font-medium tracking-normal text-faint">
                  {VERSION_LABEL}
                </span>
              </span>
            </Link>

            <div className="ml-auto flex min-w-0 items-center gap-1">
              {/* The console is where staff spend hours, which is where a dark
                  scheme earns its keep. */}
              <SchemeToggle area="console" className="mr-1.5" />

              <Link
                href="/"
                className="hidden rounded px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:block"
              >
                View site
              </Link>

              {/* Their own name reaches their own account — every role can,
                  unlike the Staff screen. The roles sit in the title so they are
                  available without spending a line on them. */}
              <Link
                href="/admin/profile"
                title={roles ? `${staff.name} · ${roles}` : staff.name}
                /*
                  Hidden below `sm`, and in the nav instead — "Your account".

                  Two things were wrong at 320px. `min-w-0` is what lets a
                  `truncate` actually shrink, since a flex item's automatic
                  minimum size is its min-content width and for a single word
                  like "Administrator" that is the whole word: without it this
                  refused to shrink and pushed Sign out 5px off the screen.
                  With it, the link shrank to 20px — an ellipsis and nothing
                  else, which is not a control anyone can use — and the row
                  still did not fit. So it goes, the way "View site" already
                  does, and the destination moves somewhere it can be read.
                */
                className="hidden min-w-0 max-w-[22ch] truncate rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2 sm:block"
              >
                {staff.name}
              </Link>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded border border-line-strong bg-card px-2.5 py-1.5 text-[13px] font-semibold transition-colors hover:border-faint"
                >
                  Sign out
                </button>
              </form>
            </div>
          </Container>
        </div>

        {/*
          The sidebar column is 20px wider than the tree needs, and the extra is
          padding inside the rule below — so the line has air on both sides
          rather than sitting flush against the labels. The tree itself is the
          same 176px it always was.
        */}
        <Container className={`${CONSOLE_WIDTH} grid flex-1 gap-6 py-5 lg:grid-cols-[196px_1fr] lg:gap-7`}>
          <AdminNav roles={staff.roles.map((r) => r.slug)} />
          {/* The <main> landmark lives here, not around the nav: the root
              layout no longer supplies one, and the skip link targets it. */}
          <main id="main" className="min-w-0">{children}</main>
        </Container>

        {/*
          One line, and the same two facts the public footer carries — the
          company name comes from Settings, so renaming the company changes both
          rather than one of them.

          `mt-auto` on the flex column rather than `fixed`: a console screen is
          often shorter than the viewport, and a pinned bar would sit over the
          content on the ones that are not.
        */}
        {/*
          Outside <main>: it is a way of moving around the page rather than part
          of what the page says, and inside the landmark it would be one more
          thing to skip past on every screen.
        */}
        <ScrollTop />

        <footer className="mt-auto border-t border-line py-3.5">
          <Container className={CONSOLE_WIDTH}>
            <CreditLine
              companyName={settings.company_name ?? "Technoware"}
              className="text-center text-[12.5px] text-faint"
              linkClassName="font-medium text-muted hover:text-ink hover:underline"
            />
          </Container>
        </footer>
      </div>

      {/* Suspense: useSearchParams needs one, and this renders nothing. */}
      <Suspense fallback={null}><ToastFromParams /></Suspense>
    </ToastProvider>
  );
}
