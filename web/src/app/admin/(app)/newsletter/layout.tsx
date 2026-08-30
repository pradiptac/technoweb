import type { ReactNode } from "react";
import { NewsletterNav } from "./newsletter-nav";

/**
 * One place to put the section navigation, rather than on six screens that
 * then have to agree about it.
 */
export default function NewsletterLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NewsletterNav />
      {children}
    </>
  );
}
