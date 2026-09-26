<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\Setting;
use App\Support\LinkPattern;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The shop front's promo band and the two tiles above it, edited from the
 * Store section of the console.
 *
 * Settings are `role:admin` as a whole — the SMTP password, the portal
 * switch and the COD ceiling sit in the same table — and that stays. A
 * promotion on the shop front is a store manager's job, though, and asking
 * an administrator to type it in is the queue `customer_approval_required`
 * was moved off. So this is a narrow door onto the same rows: it reads and
 * writes the eight `store_promo_*` keys and the fourteen `store_tile_*` keys,
 * refuses any other key by name rather than ignoring it (an ignored key is
 * a save that reports success and did nothing), and answers in the shape
 * `GET /admin/settings` uses so the console can draw the same controls.
 *
 * The per-key checks are by *suffix* — `_enabled`, `_cta_href`,
 * `_image_path` — so the tiles' rows are held to the band's rules without
 * the three checks being written three times, which is how one of them
 * would be forgotten.
 *
 * `PATCH /admin/settings` still accepts these keys for an administrator;
 * nothing was taken away from that endpoint, only added beside it.
 */
class PromoController extends Controller
{
    /** The whole of what this endpoint may touch. The allowlist is the door. */
    public const KEYS = [
        'store_promo_enabled',
        'store_promo_kicker',
        'store_promo_heading',
        'store_promo_price_text',
        'store_promo_subheading',
        'store_promo_cta_label',
        'store_promo_cta_href',
        'store_promo_image_path',
        'store_tile_1_enabled',
        'store_tile_1_kicker',
        'store_tile_1_heading',
        'store_tile_1_text',
        'store_tile_1_cta_label',
        'store_tile_1_cta_href',
        'store_tile_1_image_path',
        'store_tile_2_enabled',
        'store_tile_2_kicker',
        'store_tile_2_heading',
        'store_tile_2_text',
        'store_tile_2_cta_label',
        'store_tile_2_cta_href',
        'store_tile_2_image_path',
    ];

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->rows()]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', self::KEYS)],
            'settings.*.value' => ['nullable', 'string', 'max:4000'],
        ]);

        foreach ($validated['settings'] as $i => $row) {
            $value = $row['value'] ?? null;

            if (blank($value)) {
                continue;
            }

            if (str_ends_with($row['key'], '_enabled') && ! in_array($value, ['0', '1'], true)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'The switch is 1 for on or 0 for off.',
                ]);
            }

            // The button's href on every visit to the shop front: a path, an
            // http(s) URL, a mailto or a tel — the shape a menu's custom link
            // and a popup's link are held to, and nothing else.
            if (str_ends_with($row['key'], '_cta_href')
                && ! LinkPattern::allows($value)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'The button link is a path such as /store/categories/laptops, or a full http(s) address.',
                ]);
            }

            // A path with no media row behind it is a picture that silently
            // never renders — the rule a campaign's attachment follows.
            if (str_ends_with($row['key'], '_image_path') && ! Media::withTrashed()->where('path', $value)->exists()) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Choose the picture from the media library.',
                ]);
            }
        }

        DB::transaction(function () use ($validated) {
            $existing = Setting::query()->whereIn('key', self::KEYS)->get()->keyBy('key');

            foreach ($validated['settings'] as $row) {
                $setting = $existing->get($row['key']);

                // Seeded rows; absent only on an install that has not run the
                // seeder, where the general endpoint skips them too.
                if (! $setting) {
                    continue;
                }

                $setting->setPlainValue($row['value'] ?? null);
                $setting->save();
            }
        });

        Setting::flushCache();

        return response()->json(['message' => 'Promo banner saved.', 'data' => $this->rows()]);
    }

    /** The rows in the settings screen's own shape, so one set of controls draws both. */
    private function rows(): array
    {
        return Setting::query()
            ->whereIn('key', self::KEYS)
            ->get()
            ->sortBy(fn (Setting $s) => array_search($s->key, self::KEYS, true))
            ->values()
            ->map(fn (Setting $s) => [
                'key' => $s->key,
                'value' => $s->value,
                'type' => $s->type,
                'is_secret' => false,
                'is_set' => filled($s->value),
                'url' => str_ends_with($s->key, '_image_path') && filled($s->value)
                    ? asset('storage/'.$s->value)
                    : null,
                'options' => null,
            ])
            ->all();
    }
}
