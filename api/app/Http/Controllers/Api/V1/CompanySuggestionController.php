<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Company names already on file, so a colleague spells it the same way.
 *
 * The problem this solves is real and mundane: three people from one firm
 * register in three months and the console ends up holding "Meridian Foods",
 * "Meridian foods pvt ltd" and "meridian". Nothing joins those, so the support
 * desk cannot see that they are one account's worth of people, and the
 * newsletter's company column is unusable for the same reason.
 *
 * ## It is a prefix match with a floor, and that is the whole of the guard
 *
 * This is the one endpoint in the product that returns something *about* the
 * customer list to somebody with no account, so it is worth being explicit
 * about the trade rather than leaving it to be discovered:
 *
 * - **A prefix, never a substring.** `%meridian%` would let two characters
 *   sweep the middle of every name on the list; `meridian%` only answers a
 *   question somebody was already most of the way to asking.
 * - **Three characters minimum**, five results maximum, and throttled. That
 *   is not proof against a determined crawl — 26³ prefixes at 20 a minute is
 *   about a day — and it is not meant to be. It bounds the *casual* case.
 * - **Names only.** No count, no id, no address, nothing that says how many
 *   people are behind a name or whether any of them is active. A name on this
 *   list means somebody once typed it into a form, which is a far weaker
 *   statement than "this firm is a customer".
 *
 * The reason this is acceptable here and `/auth/register`'s membership oracle
 * is not: an email address identifies a *person* and is the first half of
 * phishing them, while this business already publishes client names on its own
 * case studies. If that ever stops being true, the fix is one line — move the
 * route inside the admin group — and nothing else changes.
 */
class CompanySuggestionController extends Controller
{
    /** Below this a prefix is not a guess, it is a listing. */
    private const MINIMUM = 3;

    private const LIMIT = 5;

    public function __invoke(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));

        if (mb_strlen($term) < self::MINIMUM) {
            return response()->json(['data' => []]);
        }

        $names = Customer::query()
            ->whereNotNull('company')
            ->where('company', '!=', '')
            // `like` with the wildcard only on the right. The term is escaped
            // for LIKE's own metacharacters as well as bound as a parameter —
            // an unescaped `%` would turn one request into a full listing.
            ->where('company', 'like', $this->escape($term).'%')
            ->distinct()
            ->orderBy('company')
            ->limit(self::LIMIT)
            ->pluck('company')
            ->all();

        return response()->json(['data' => $names]);
    }

    /** `%`, `_` and `\` mean something to LIKE and nothing to the person typing. */
    private function escape(string $term): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term);
    }
}
