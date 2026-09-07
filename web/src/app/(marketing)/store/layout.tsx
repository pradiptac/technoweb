/**
 * The shop segment.
 *
 * The basket strip used to live here, above every page under /store. It moved
 * down to the category and product layouts because the front page renders the
 * basket inside its own filter bar instead — see the note on
 * `BasketIndicator`. This layout stays as the segment's own boundary rather
 * than being deleted, so there is one obvious place to put anything that
 * genuinely belongs to the whole shop.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
