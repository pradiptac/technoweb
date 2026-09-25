"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { IconCheck, IconChevronDown, IconSliders } from "@/components/icons-ui";
import { Stars, StarGlyph } from "@/components/store/stars";
import { ReviewDialog } from "@/components/store/reviews/review-dialog";
import { formatDate } from "@/lib/dates";
import type { MyReviewState, ProductReview, ReviewPage, ReviewSort, StoreRating } from "@/types/api";

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest Ratings" },
  { value: "lowest", label: "Lowest Ratings" },
];

/*
 * `?review=1` — the link in the "How was it?" email and on the portal's
 * order page — opens the reviews and the dialog. Read with
 * `useSyncExternalStore`, whose server snapshot is false, because the page is
 * served whole from the ISR cache and never sees the query string: the
 * server draws the disclosure closed, the client opens it after hydration.
 */
const subscribeNothing = () => () => {};
const wantsReviewNow = () => new URLSearchParams(window.location.search).get("review") === "1";
const wantsReviewOnServer = () => false;

/**
 * The reviews on a store product page, from the client's reference: a
 * disclosure reading "Reviews 4.8/5 — Based on 9 customer reviews"; inside,
 * five large stars with a "9 Reviews" breakdown, "Write a review", a sort
 * menu, a grid of review cards and "Show more reviews".
 *
 * **The first page arrives with the product**, rendered on the server from
 * the ISR cache, so the reviews are in the HTML. Sorting and showing more
 * ask `/api/store/reviews` (an allowlisted, cacheable route handler); who is
 * writing is asked of `/api/store/reviews/mine` only when the dialog opens.
 * Nothing here reads a cookie during render — the rule that lets the
 * product page be cached at all.
 *
 * A `<details>` rather than a button and a panel: the content is in the
 * document either way, the open state is the browser's own, and the
 * chevron turns on `group-open/rv` with `rotate` (never `transform` — the
 * Tailwind v4 trap). The group is named so the FAQ's `details.group`
 * animation, whose `overflow: clip` would cut the two popovers, does not
 * reach it.
 */
export function ReviewsSection({
  slug, productName, rating, initial,
}: {
  slug: string;
  productName: string;
  rating: StoreRating | null;
  initial: ReviewPage | null;
}) {
  const wantsReview = useSyncExternalStore(subscribeNothing, wantsReviewNow, wantsReviewOnServer);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const [dialogChoice, setDialogChoice] = useState<boolean | null>(null);
  const [mine, setMine] = useState<MyReviewState | undefined>(undefined);
  const [sort, setSort] = useState<ReviewSort>(initial?.meta.sort ?? "featured");
  const [reviews, setReviews] = useState<ProductReview[]>(initial?.data ?? []);
  const [page, setPage] = useState(initial?.meta.current_page ?? 1);
  const [lastPage, setLastPage] = useState(initial?.meta.last_page ?? 1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState<"sort" | "breakdown" | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const ids = useId();

  const open = openChoice ?? wantsReview;
  const dialogOpen = dialogChoice ?? wantsReview;

  const count = rating?.count ?? initial?.meta.count ?? 0;
  const average = rating?.average ?? initial?.meta.average ?? null;
  const distribution = initial?.meta.distribution ?? {};

  // Arriving from the email: bring the section into view once it is open.
  useEffect(() => {
    if (wantsReview) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [wantsReview]);

  // Who is writing — asked only once the dialog is open, never during render.
  useEffect(() => {
    if (!dialogOpen || mine !== undefined) return;

    let cancelled = false;

    fetch(`/api/store/reviews/mine?slug=${encodeURIComponent(slug)}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<MyReviewState>) : ({ signedIn: false } as MyReviewState)))
      .then((answer) => { if (!cancelled) setMine(answer); })
      .catch(() => { if (!cancelled) setMine({ signedIn: false }); });

    return () => { cancelled = true; };
  }, [dialogOpen, mine, slug]);

  // A popover closes on Escape and on a press anywhere outside it.
  useEffect(() => {
    if (!menu) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-review-popover-host]")) setMenu(null);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);

  const load = useCallback(async (nextSort: ReviewSort, nextPage: number, append: boolean) => {
    setLoading(true);
    setFailed(false);

    try {
      const res = await fetch(`/api/store/reviews?slug=${encodeURIComponent(slug)}&sort=${nextSort}&page=${nextPage}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ReviewPage;
      setReviews((current) => (append ? [...current, ...body.data.filter((r) => !current.some((c) => c.id === r.id))] : body.data));
      setPage(body.meta.current_page);
      setLastPage(body.meta.last_page);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const chooseSort = (value: ReviewSort) => {
    setMenu(null);
    if (value === sort) return;
    setSort(value);
    void load(value, 1, false);
  };

  const openDialog = () => { setMenu(null); setDialogChoice(true); };
  const closeDialog = useCallback(() => setDialogChoice(false), []);
  // A review just went in: ask again next time, so the dialog opens on it.
  const onSubmitted = useCallback(() => setMine(undefined), []);

  const averageText = average !== null ? average.toFixed(1) : null;
  const writeLabel = mine && mine.signedIn && mine.data ? "Edit your review" : "Write a review";

  return (
    <section ref={sectionRef} id="reviews" aria-labelledby={`${ids}-heading`} className="mt-14 scroll-mt-[calc(var(--h-site-header)+var(--h-store-bar)+1rem)]">
      <details
        open={open}
        onToggle={(e) => setOpenChoice(e.currentTarget.open)}
        className="group/rv rounded-xl border border-line-strong bg-card"
      >
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.47L12 17.46l-5.8 3.06 1.1-6.47-4.7-4.6 6.5-.95z" />
          </svg>
          <span className="min-w-0 flex-1">
            <h2 id={`${ids}-heading`} className="text-17 font-semibold leading-tight">
              Reviews{" "}
              {averageText !== null && (
                <span className="tabular-nums">
                  <b>{averageText}</b><span className="font-normal text-muted">/5</span>
                </span>
              )}
            </h2>
            <span className="mt-0.5 block text-13 text-muted">
              {count > 0 ? `Based on ${count} customer review${count === 1 ? "" : "s"}` : "No reviews yet"}
            </span>
          </span>
          <IconChevronDown className="size-5 shrink-0 text-muted transition-[rotate] duration-(--duration-base) ease-brand group-open/rv:rotate-180" />
        </summary>

        <div className="border-t border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex flex-wrap items-center gap-3" data-review-popover-host>
              {average !== null && <Stars value={average} count={count} size="size-6 sm:size-7" />}
              {count > 0 ? (
                <button
                  type="button"
                  aria-expanded={menu === "breakdown"}
                  aria-controls={`${ids}-breakdown`}
                  onClick={() => setMenu(menu === "breakdown" ? null : "breakdown")}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-14 font-semibold hover:bg-surface-2"
                >
                  {count} Review{count === 1 ? "" : "s"}
                  <IconChevronDown className={`size-4 transition-[rotate] duration-(--duration-fast) ease-brand ${menu === "breakdown" ? "rotate-180" : ""}`} />
                </button>
              ) : (
                <p className="text-14 text-muted">Be the first to review this.</p>
              )}

              <div
                id={`${ids}-breakdown`}
                className={`popover-motion absolute left-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] origin-top-left rounded-lg border border-line-strong bg-card p-4 shadow-3 ${menu === "breakdown" ? "" : "hidden"}`}
              >
                <p className="mb-2 text-13 font-semibold">How people rated it</p>
                <ul className="grid gap-1.5">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const n = Number(distribution[String(stars)] ?? 0);
                    const share = count > 0 ? n / count : 0;
                    return (
                      <li key={stars} className="flex items-center gap-2 text-12-5">
                        <span className="w-3 tabular-nums">{stars}</span>
                        <StarGlyph className="size-3.5" />
                        <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-(--color-rating)" style={{ width: `${Math.round(share * 100)}%` }} />
                        </span>
                        <span className="w-6 text-right tabular-nums text-muted">
                          {n}<span className="sr-only"> {n === 1 ? "review" : "reviews"} with {stars} star{stars === 1 ? "" : "s"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="relative flex items-center gap-2" data-review-popover-host>
              <Button type="button" variant="secondary" size="sm" onClick={openDialog}>{writeLabel}</Button>
              {count > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Sort reviews"
                    aria-haspopup="true"
                    aria-expanded={menu === "sort"}
                    aria-controls={`${ids}-sort`}
                    onClick={() => setMenu(menu === "sort" ? null : "sort")}
                    className="grid size-11 place-items-center rounded border border-line-strong bg-card text-ink transition-colors duration-(--duration-fast) hover:border-faint"
                  >
                    <IconSliders className="size-5" />
                  </button>
                  <div
                    id={`${ids}-sort`}
                    className={`popover-motion absolute right-0 top-full z-20 mt-2 w-56 max-w-[calc(100vw-3rem)] origin-top-right rounded-lg border border-line-strong bg-card p-2 shadow-3 ${menu === "sort" ? "" : "hidden"}`}
                  >
                    <p className="px-2 pb-1.5 pt-1 text-13 font-semibold">Sort by</p>
                    <ul>
                      {SORTS.map((o) => (
                        <li key={o.value}>
                          <button
                            type="button"
                            aria-pressed={sort === o.value}
                            onClick={() => chooseSort(o.value)}
                            className="flex min-h-10 w-full items-center justify-between gap-2 rounded px-2 text-left text-14 hover:bg-surface-2"
                          >
                            {o.label}
                            {sort === o.value && <IconCheck className="size-4 text-brand-ink" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>

          {reviews.length > 0 ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={loading || undefined}>
              {reviews.map((r) => <li key={r.id} className="min-w-0"><ReviewCard review={r} /></li>)}
            </ul>
          ) : (
            <p className="mt-5 text-14 text-muted">
              No reviews yet. If you bought this, tell the next person what it is like.
            </p>
          )}

          {failed && <p role="alert" className="mt-4 text-13 text-err">We could not load more reviews. Try again.</p>}

          {page < lastPage && (
            <div className="mt-6 flex justify-center">
              <Button type="button" variant="secondary" pending={loading} onClick={() => void load(sort, page + 1, true)}>
                Show more reviews
              </Button>
            </div>
          )}
        </div>
      </details>

      <ReviewDialog
        open={dialogOpen}
        onClose={closeDialog}
        slug={slug}
        productName={productName}
        mine={mine}
        onSubmitted={onSubmitted}
      />
    </section>
  );
}

/**
 * One review, as the reference draws it: the name in bold, Verified with its
 * check, the date, five small stars, the words, and "Item type" with the
 * variant bought. The body is plain text rendered escaped — nothing a
 * reviewer types becomes markup.
 */
function ReviewCard({ review }: { review: ProductReview }) {
  return (
    <article data-card className="flex h-full flex-col gap-2.5 rounded-xl border border-line bg-card p-5 shadow-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <p className="text-14-5 font-semibold">{review.display_name}</p>
        {review.verified && (
          <span className="inline-flex items-center gap-1 text-12-5 font-medium text-ok">
            <span className="grid size-4 place-items-center rounded-full bg-ok-fill text-white" aria-hidden="true">
              <IconCheck className="size-3" strokeWidth={3} />
            </span>
            Verified
          </span>
        )}
        {review.published_at && (
          <time dateTime={review.published_at} className="ml-auto text-12-5 tabular-nums text-muted">
            {/* The API's own calendar date (IST), so the server and the browser print the same day whatever their clocks. */}
            {formatDate(review.published_at.slice(0, 10), "numeric")}
          </time>
        )}
      </div>
      <Stars value={review.rating} size="size-4" />
      {review.title && <p className="text-14 font-semibold">{review.title}</p>}
      <p className="whitespace-pre-line text-14 leading-[1.6] text-ink-2 [overflow-wrap:anywhere]">{review.body}</p>
      {review.variant_label && (
        <p className="mt-auto pt-1 text-12-5">
          <span className="block text-muted">Item type:</span>
          <span className="font-medium">{review.variant_label}</span>
        </p>
      )}
    </article>
  );
}
