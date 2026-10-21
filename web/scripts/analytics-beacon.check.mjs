// node --experimental-strip-types scripts/analytics-beacon.check.mjs
// Pins the beacon's pure rules (C3, docs/analytics.md).
import { collectable, linkKind, utmFrom } from "../src/lib/analytics-beacon.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const o = "https://www.technoware.in";

ok(collectable("/solutions/networking"), "a public page is counted");
ok(collectable("/administrators"), "a public page that merely starts with /admin is counted");
// Must be the same prefixes as App\Support\Analytics\Collector::EXCLUDED.
for (const p of ["/admin", "/admin/pages/1", "/portal", "/api/collect", "/_next/static/x", "/order/ORD-1", "/preview/abc", "/visit/TV-1", "/meeting/MT-1", "/ticket-survey/x", "/events/registration/x", "/newsletter/unsubscribe/x", "/newsletter/rejoin/x", "/store/notify/cancel/x", "/store/wishlist/stop/x", "/store/basket/restore/x"]) ok(!collectable(p), `${p} is never counted`);
ok(linkKind("https://partner.example.com/x", o) === "outbound", "another host is outbound");
ok(linkKind("/about", o) === null, "an in-site link is nothing");
ok(linkKind("https://www.technoware.in/about", o) === null, "our own absolute link is nothing");
ok(linkKind("/api/downloads/12", o) === "download", "a downloads-centre file is a download");
ok(linkKind("/storage/media/brochure.pdf", o) === "download", "a library PDF is a download");
ok(linkKind("tel:+919876543210", o) === "contact", "a phone link is contact");
ok(linkKind("mailto:sales@technoware.in", o) === "contact", "a mail link is contact");
ok(linkKind("https://wa.me/919876543210", o) === "contact", "WhatsApp is contact, not outbound");
ok(JSON.stringify(utmFrom("?utm_source=newsletter&utm_medium=email&utm_campaign=oct&x=1")) === JSON.stringify({ source: "newsletter", medium: "email", campaign: "oct" }), "UTM tags are read and nothing else");
ok(JSON.stringify(utmFrom("?page=2")) === "{}", "no tags is nothing");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
