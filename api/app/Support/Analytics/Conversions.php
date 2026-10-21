<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsHit;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Throwable;

/** Search terms and conversions, recorded where they happen (C3). Never throws. */
final class Conversions
{
    /**
     * @param  array<string, ?string>|null  $page  a PageContext array, when the request carried one
     * @param  \DateTimeInterface|null  $orderedAt  for order_paid: when the order was placed, to find its own order_placed hit
     */
    public static function record(string $kind, ?array $page, ?int $valuePaise = null, ?string $reference = null, ?\DateTimeInterface $orderedAt = null): void
    {
        try {
            $request = app()->bound('request') ? request() : null;
            if (! $request instanceof Request || app()->runningInConsole() && ! app()->runningUnitTests()) {
                return; // A conversion made by a command or a worker has no visitor to attribute it to.
            }
            // Staff entering a lead or a registration at the desk are not visitors. A payment is the
            // exception: money arrived whoever records it, so order_paid is counted from a staff request too.
            if ($kind !== 'order_paid' && $request->user('sanctum') instanceof User) {
                return;
            }
            Collector::record($request, $kind, [
                'page' => $page,
                'path' => $page['source_path'] ?? null,
                'target' => $reference,
                'value_paise' => $valuePaise,
                'from' => $kind === 'order_paid' ? self::placed($reference, $orderedAt) : null,
            ]);
        } catch (Throwable) {
            // Collector already logs; nothing reaches the caller.
        }
    }

    /** The order's own order_placed hit: by day first (the index), else by number alone. */
    private static function placed(?string $reference, ?\DateTimeInterface $orderedAt): ?AnalyticsHit
    {
        if ($reference === null) {
            return null;
        }
        $hits = fn () => AnalyticsHit::query()->where('kind', 'order_placed')->where('target', $reference)->orderBy('id');
        $day = $orderedAt === null ? null : Carbon::instance($orderedAt)->setTimezone((string) config('app.timezone'))->toDateString();

        return ($day === null ? null : $hits()->where('day', $day)->first()) ?? $hits()->first();
    }

    /** A person searching, not a box suggesting: the caller says so with `record=1`, and the same term counts once per visitor, scope and day. */
    public static function search(Request $request, string $scope, string $term, int $results): void
    {
        $term = mb_strtolower(trim(preg_replace('/\s+/', ' ', $term) ?? ''));
        if (! $request->boolean('record') || $term === '' || mb_strlen($term) > 100 || self::personal($term)) {
            return;
        }
        $tz = (string) config('app.timezone');
        $day = now()->setTimezone($tz)->toDateString();
        if (Visitor::salt($day) === '') {
            return;
        }
        $seen = 'analytics:searched:'.md5(Visitor::hash((string) $request->ip(), (string) Visitor::agent($request), $day).'|'.$scope.'|'.$term);
        if (! Cache::add($seen, 1, now()->setTimezone($tz)->endOfDay())) {
            return;
        }
        Collector::record($request, 'search', ['path' => $scope === 'shop' ? '/store' : '/search', 'target' => $term, 'results' => $results]);
    }

    /** An email address or something with seven or more digits — a phone number, an order number with a person behind it. */
    private static function personal(string $term): bool
    {
        return str_contains($term, '@') || preg_match_all('/\d/', $term) >= 7;
    }
}
