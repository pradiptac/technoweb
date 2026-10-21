/** The wire shapes of native analytics (C3, docs/analytics.md). Every label is the API's. */

export type AnalyticsMetric = { value: number | null; previous: number | null; change: number | null };

export type AnalyticsSummary = {
  data: {
    range: { from: string; to: string; label: string };
    compare: "previous" | "year" | "none";
    views: AnalyticsMetric;
    visits: AnalyticsMetric;
    entries: AnalyticsMetric;
    bounce_share: AnalyticsMetric;
    views_per_visit: AnalyticsMetric;
    conversions: AnalyticsMetric;
    revenue_paise: AnalyticsMetric;
    series: { day: string; label: string; views: number; visitors: number; previous_views: number | null }[];
  };
  meta: { enabled: boolean };
};

export type AnalyticsBreakdownRow = {
  key: string;
  label: string;
  views: number;
  /** Null on the entry dimension, which counts entries and not people. */
  visitors: number | null;
  value_paise: number;
  share: number | null;
};

export type AnalyticsBreakdown = {
  data: AnalyticsBreakdownRow[];
  meta: { dimension: string; kind: string; total: number; enabled: boolean };
};

export type AnalyticsSearch = {
  data: {
    terms: { term: string; searches: number; results: number | null }[];
    nothing: { term: string; searches: number }[];
  };
  meta: { enabled: boolean };
};

export type AnalyticsNow = {
  data: { views: number; pages: { path: string; views: number }[] };
  meta: { enabled: boolean };
};

export type AnalyticsPage = {
  data: {
    path: string;
    series: { day: string; label: string; views: number; visitors: number }[];
    entries: number;
    sources: { key: string; label: string; views: number; visitors: number }[];
    conversions: { kind: string; label: string; count: number; value_paise: number | null }[];
  };
  meta: { enabled: boolean };
};

export type LeadSource = { channel: string; label: string; enquiries: number; orders_paid: number; revenue_paise: number };

/** The window every screen shares, as the query the API takes. */
export type AnalyticsRange = { from?: string; to?: string; compare?: "previous" | "year" | "none" };
