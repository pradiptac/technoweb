import { cn } from "@/lib/utils";

const rows = [
  { name: "Firewall throughput", state: "ok" as const, label: "Healthy", meta: "1.8 Gbps" },
  { name: "Backup — last restore test", state: "ok" as const, label: "Passed", meta: "2 d ago" },
  { name: "AP-04 · warehouse", state: "warn" as const, label: "Degraded", meta: "ticket #4821" },
];

/**
 * Decorative NOC visual for the hero. Purely illustrative — marked
 * aria-hidden so screen readers skip it rather than reading node labels.
 */
export function NocPanel() {
  return (
    <div
      aria-hidden
      className="min-w-0 rounded-xl border border-dark-line bg-dark p-[18px] shadow-3"
    >
      <div className="flex items-center gap-2.5 px-1 pb-3.5">
        <span className="flex gap-1.5">
          <i className="size-2 rounded-full bg-dark-line" />
          <i className="size-2 rounded-full bg-dark-line" />
          <i className="size-2 rounded-full bg-dark-line" />
        </span>
        <span className="font-mono text-[11.5px] text-dark-muted">noc / site-overview</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-brand-300">
          <span className="size-1.5 rounded-full bg-brand-300 motion-safe:animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="min-w-0 rounded-lg border border-dark-line bg-dark-2 p-4">
        <svg viewBox="0 0 400 168" className="h-auto w-full">
          <g stroke="#2a2e20" strokeWidth={1.4}>
            <path d="M200 30v28M200 58 96 96M200 58l104 38M96 96v28M304 96v28M96 124H40M96 124h56M304 124h-56M304 124h56" />
          </g>
          <g stroke="#8fa65e" strokeWidth={1.6} strokeDasharray="4 6" opacity={0.9}>
            <path d="M200 30v28" />
            <path d="M200 58 96 96" />
          </g>
          <g fill="#1b1e14" stroke="#3a4030">
            <rect x="164" y="12" width="72" height="20" rx="5" />
            <rect x="164" y="48" width="72" height="20" rx="5" />
            <rect x="62" y="86" width="68" height="20" rx="5" />
            <rect x="270" y="86" width="68" height="20" rx="5" />
            <rect x="14" y="116" width="52" height="18" rx="5" />
            <rect x="126" y="116" width="52" height="18" rx="5" />
            <rect x="222" y="116" width="52" height="18" rx="5" />
            <rect x="334" y="116" width="52" height="18" rx="5" />
          </g>
          <g fill="#9ba095" fontFamily="ui-monospace, monospace" fontSize="8.5" textAnchor="middle">
            <text x="200" y="25">ISP / WAN</text>
            <text x="200" y="61">FIREWALL</text>
            <text x="96" y="99">CORE-SW-01</text>
            <text x="304" y="99">CORE-SW-02</text>
            <text x="40" y="128">ACCESS</text>
            <text x="152" y="128">WI-FI</text>
            <text x="248" y="128">SERVERS</text>
            <text x="360" y="128">CCTV</text>
          </g>
          <g fill="#a9c273">
            <rect x="167" y="51" width="3" height="14" rx="1.5" />
            <rect x="65" y="89" width="3" height="14" rx="1.5" />
            <rect x="273" y="89" width="3" height="14" rx="1.5" />
          </g>
          <g fill="#dcb066">
            <rect x="17" y="119" width="3" height="12" rx="1.5" />
          </g>
        </svg>
      </div>

      <div className="mt-3 grid min-w-0 gap-2">
        {rows.map((r) => (
          <div key={r.name} className="flex min-w-0 items-center gap-2.5 rounded border border-dark-line bg-dark-2 px-3.5 py-[11px]">
            <span className="min-w-0 truncate text-[13px] font-medium text-dark-ink">{r.name}</span>
            <span className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.05em]",
              r.state === "ok" ? "bg-brand-400/15 text-brand-300" : "bg-[#c9993c]/15 text-[#dcb066]",
            )}>
              {r.label}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11.5px] text-dark-muted">{r.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
