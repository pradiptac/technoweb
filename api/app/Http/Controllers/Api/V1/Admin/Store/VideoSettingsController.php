<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Store\VideoShelf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * "Shop the videos" (0.140.0): where the shelf shows, how it looks and whether
 * it plays by itself — edited from Store → Product videos by a store manager.
 *
 * The promo band's shape, for the promo band's reason: settings as a whole are
 * `role:admin` and stay that way, a shelf on the shop front is a store
 * manager's job, so this is a narrow door onto the eleven `store_videos_*`
 * rows. Any other key is refused by name rather than ignored (an ignored key
 * is a save that reports success and did nothing), and the answer is in the
 * shape `GET /admin/settings` uses so the console draws the same controls.
 *
 * The checks are by *suffix* where a family shares one, and by key where one
 * does not: a switch is `0` or `1`, the shape and the order are held to their
 * lists (`VideoShelf::SHAPES` / `ORDERS` — the API sends them as `options`,
 * TypeScript lists neither), the count is 4–24, the heading 80 characters and
 * the line under it 200. A blank heading or line is allowed and means none.
 *
 * `meta.products_with_video` is the count the screen says the shelf will
 * draw from — a switch on with nothing to show is the question this answers.
 */
class VideoSettingsController extends Controller
{
    /** The whole of what this endpoint may touch. The allowlist is the door. */
    public const KEYS = [
        'store_videos_shop_enabled',
        'store_videos_product_enabled',
        'store_videos_product_others',
        'store_videos_home_enabled',
        'store_videos_heading',
        'store_videos_lede',
        'store_videos_autoplay',
        'store_videos_shape',
        'store_videos_limit',
        'store_videos_order',
        'store_videos_show_sku',
    ];

    private const SHAPE_LABELS = [
        'portrait' => ['Portrait (9:16)', 'Tall, like a phone video or a YouTube Short. About five to a row.'],
        'square' => ['Square (1:1)', 'Even all round.'],
        'landscape' => ['Landscape (16:9)', 'Wide, like a normal YouTube video. About three to a row.'],
    ];

    private const ORDER_LABELS = [
        'newest' => ['Newest products first', 'The most recently added product with a video leads.'],
        'featured' => ['Featured first', 'Products ticked as featured lead, then the shop\'s own order.'],
    ];

    public function index(): JsonResponse
    {
        return $this->answer();
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', self::KEYS)],
            'settings.*.value' => ['nullable', 'string', 'max:4000'],
        ]);

        foreach ($validated['settings'] as $i => $row) {
            $message = $this->refusal($row['key'], $row['value'] ?? null);

            if ($message !== null) {
                throw ValidationException::withMessages(["settings.{$i}.value" => $message]);
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

                $setting->setPlainValue(filled($row['value'] ?? null) ? trim((string) $row['value']) : null);
                $setting->save();
            }
        });

        Setting::flushCache();

        return $this->answer('Product videos saved.');
    }

    /** The sentence a person can act on, or null when the value is fine. */
    private function refusal(string $key, ?string $value): ?string
    {
        $value = $value === null ? '' : trim($value);

        // The two free-text rows may be blank: nothing, or the default.
        if (in_array($key, ['store_videos_heading', 'store_videos_lede'], true)) {
            $max = $key === 'store_videos_heading' ? 80 : 200;

            return mb_strlen($value) > $max ? "Keep this to {$max} characters." : null;
        }

        if (str_ends_with($key, '_enabled') || in_array($key, ['store_videos_autoplay', 'store_videos_show_sku', 'store_videos_product_others'], true)) {
            return in_array($value, ['0', '1'], true) ? null : 'The switch is 1 for on or 0 for off.';
        }

        return match ($key) {
            'store_videos_shape' => in_array($value, VideoShelf::SHAPES, true) ? null : 'Choose one of the shapes from the list.',
            'store_videos_order' => in_array($value, VideoShelf::ORDERS, true) ? null : 'Choose one of the orders from the list.',
            'store_videos_limit' => ctype_digit($value) && (int) $value >= VideoShelf::MIN_LIMIT && (int) $value <= VideoShelf::MAX_LIMIT
                ? null
                : 'A whole number from '.VideoShelf::MIN_LIMIT.' to '.VideoShelf::MAX_LIMIT.'.',
            default => null,
        };
    }

    private function answer(?string $message = null): JsonResponse
    {
        $body = [
            'data' => $this->rows(),
            'meta' => ['products_with_video' => StoreProduct::query()->published()->withVideos()->count()],
        ];

        if ($message !== null) {
            $body['message'] = $message;
        }

        return response()->json($body);
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
                'url' => null,
                'options' => $this->optionsFor($s->key),
            ])
            ->all();
    }

    /** @return list<array{value: string, label: string, description: string}>|null */
    private function optionsFor(string $key): ?array
    {
        $labels = match ($key) {
            'store_videos_shape' => self::SHAPE_LABELS,
            'store_videos_order' => self::ORDER_LABELS,
            default => null,
        };

        if ($labels === null) {
            return null;
        }

        $out = [];

        foreach ($labels as $value => [$label, $description]) {
            $out[] = ['value' => $value, 'label' => $label, 'description' => $description];
        }

        return $out;
    }
}
