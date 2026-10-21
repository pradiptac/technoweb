<?php

namespace App\Support\Analytics;

use App\Models\User;
use Illuminate\Http\Request;
use Throwable;

/** Search terms and conversions, recorded where they happen (C3). Never throws. */
final class Conversions
{
    /** @param array<string, ?string>|null $page a PageContext array, when the request carried one */
    public static function record(string $kind, ?array $page, ?int $valuePaise = null, ?string $reference = null): void
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
            ]);
        } catch (Throwable) {
            // Collector already logs; nothing reaches the caller.
        }
    }

    public static function search(Request $request, string $scope, string $term, int $results): void
    {
        $term = mb_strtolower(trim(preg_replace('/\s+/', ' ', $term) ?? ''));
        if ($term === '' || mb_strlen($term) > 100 || self::personal($term)) {
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
