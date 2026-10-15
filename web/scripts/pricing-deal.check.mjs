// node --experimental-strip-types scripts/pricing-deal.check.mjs
// Pins the banded pricing layout's derived figures (0.180.0): what a yearly
// price is per month, what it saves against twelve months, and the share off.
import { yearlyDeal } from "../src/lib/pricing-deal.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

const d = yearlyDeal(1000, 9600);
ok(d?.perMonth === 800 && d.was === 1000 && d.billed === 9600, "₹10 a month, ₹96 a year → ₹8 a month, ₹10 struck through");
ok(d?.save === 2400 && d.percent === 20, "saves ₹24, 20% off");
ok(yearlyDeal(3500, 33600)?.save === 8400, "₹35 / ₹336 saves ₹84");
ok(yearlyDeal(1000, 12000) === null, "no saving, no deal");
ok(yearlyDeal(1000, 13000) === null, "a dearer year claims nothing");
ok(yearlyDeal(null, 9600) === null && yearlyDeal(1000, null) === null, "one price alone is no deal");
ok(yearlyDeal(0, 0) === null, "a free monthly price divides nothing");
ok(yearlyDeal(999, 9999)?.perMonth === 833, "a year that does not divide by twelve rounds to the paisa");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
