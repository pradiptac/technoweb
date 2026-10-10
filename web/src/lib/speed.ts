import "server-only";
import type { CdnInFront } from "@/lib/cdn";
import type { SpeedCheck, SpeedImpact, SpeedReport } from "@/types/system";

/**
 * The two speed checks only the Next server can answer, merged into the
 * API's list for System → Status (`App\Support\System\SpeedChecks` is the
 * rest). Same shape as the API's rows, so the card draws them alike.
 *
 * - `next_build`: whether this is a production build. The development server
 *   compiles every page as it is asked for and answers many times slower; a
 *   test run is not a deployment, so it is a fact, not a fault.
 * - `cdn_in_front`: read from the headers of the very request that loaded the
 *   screen (`lib/cdn.ts`) — optional, so its absence is information.
 *
 * `env` is a parameter so the wording of each branch can be checked without
 * starting a server in that mode.
 */
export function websiteSpeedChecks(cdn: CdnInFront | null, env: Record<string, string | undefined> = process.env): SpeedCheck[] {
  const mode = env.NODE_ENV;

  const build: SpeedCheck = mode === "production"
    ? {
        key: "next_build", group: "server", impact: "high", state: "good",
        label: "The website is a production build",
        detail: "The public site is running its production build, with every page prepared ahead of time.",
        fix: "", snippet: null,
      }
    : {
        key: "next_build", group: "server", impact: "high",
        state: mode === "development" ? "attention" : "info",
        label: "The website is a production build",
        detail: mode === "development"
          ? "This is the development server, which prepares each page only when it is first asked for. A production build answers many times faster."
          : "The website is not running in production mode, so it is not at its fastest.",
        fix: "On the live site, build the website once and start it from the build. In Plesk, set the Node.js application to run the start command.",
        snippet: "npm run build\nnpm run start",
      };

  const edge: SpeedCheck = cdn
    ? {
        key: "cdn_in_front", group: "content", impact: "medium", state: "good",
        label: "A CDN is in front of the website",
        detail: `This request reached the website through ${cdn.name}, which keeps copies of pages and pictures close to each visitor.`,
        fix: "", snippet: null,
      }
    : {
        key: "cdn_in_front", group: "content", impact: "medium", state: "info",
        label: "A CDN is in front of the website",
        detail: "Visitors reach the website directly. A CDN in front of the whole site is optional, and helps most when visitors are far from this server.",
        fix: "The manual’s chapter on using a CDN explains how, and what to set afterwards.",
        snippet: null,
      };

  return [build, edge];
}

/** The API's report with the website's own checks added and the summary counted again. */
export function withWebsiteChecks(report: SpeedReport, extra: SpeedCheck[]): SpeedReport {
  const checks = [...report.checks, ...extra];
  const summary = { good: 0, attention: 0, unknown: 0 };

  for (const c of checks) {
    if (c.state === "good" || c.state === "attention" || c.state === "unknown") summary[c.state] += 1;
  }

  return { ...report, checks, summary };
}

const IMPACT_ORDER: Record<SpeedImpact, number> = { high: 0, medium: 1, low: 2 };

/** High impact first; checks of one impact keep the order the API listed them in. */
export function byImpact(checks: SpeedCheck[]): SpeedCheck[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => IMPACT_ORDER[a.c.impact] - IMPACT_ORDER[b.c.impact] || a.i - b.i)
    .map(({ c }) => c);
}

/** "9 of 14 checks are good — 3 need attention", counting only checks with a verdict. */
export function speedSummaryLine(summary: SpeedReport["summary"]): string {
  const total = summary.good + summary.attention + summary.unknown;
  const parts = [`${summary.good} of ${total} checks are good`];

  if (summary.attention > 0) parts.push(`${summary.attention} ${summary.attention === 1 ? "needs" : "need"} attention`);
  if (summary.unknown > 0) parts.push(`${summary.unknown} could not be checked`);

  return parts.join(" — ");
}
