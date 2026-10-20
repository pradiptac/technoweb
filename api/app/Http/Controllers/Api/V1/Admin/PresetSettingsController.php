<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentType;
use App\Models\DownloadCategory;
use App\Models\Setting;
use App\Support\HtmlSanitiser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A preset type's own settings (docs/content-presets.md) — the newsroom's
 * boilerplate, press contact and media kit, the investors page's contact —
 * edited on the type's form by the content manager who owns it.
 *
 * Settings as a whole stay `role:admin`: this door names its keys, per
 * preset, and refuses any other — the store promo's rule
 * (`Store\PromoController`). The boilerplate is rich text and is cleaned
 * through the `cms` profile on the way in.
 */
class PresetSettingsController extends Controller
{
    /** @var array<string, list<string>> */
    public const KEYS = [
        'newsroom_releases' => ['newsroom_boilerplate', 'newsroom_contact_name', 'newsroom_contact_email', 'newsroom_contact_phone', 'newsroom_kit_category_id'],
        'investors' => ['investors_contact_name', 'investors_contact_email', 'investors_contact_phone', 'investors_signup_line'],
    ];

    public function show(ContentType $contentType): JsonResponse
    {
        abort_if(self::keysFor($contentType) === [], 404);

        return response()->json(['data' => $this->rows($contentType), 'meta' => $this->meta($contentType)]);
    }

    public function update(Request $request, ContentType $contentType): JsonResponse
    {
        $keys = self::keysFor($contentType);
        abort_if($keys === [], 404);

        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', $keys)],
            'settings.*.value' => ['nullable', 'string', 'max:5000'],
        ]);

        foreach ($data['settings'] as $i => $row) {
            $value = $row['value'] ?? null;
            if (blank($value)) {
                continue;
            }
            if (str_ends_with($row['key'], '_email') && ! filter_var($value, FILTER_VALIDATE_EMAIL)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'That is not an email address.']);
            }
            if ($row['key'] === 'newsroom_kit_category_id' && ! DownloadCategory::query()->whereKey((int) $value)->exists()) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a downloads category.']);
            }
            if ($row['key'] === 'investors_signup_line' && mb_strlen($value) > 200) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'At most 200 characters.']);
            }
        }

        DB::transaction(function () use ($data, $keys) {
            $existing = Setting::query()->whereIn('key', $keys)->get()->keyBy('key');

            foreach ($data['settings'] as $row) {
                $setting = $existing->get($row['key']);
                // Seeded rows; absent only on an install that has not re-run the seeder.
                if (! $setting) {
                    continue;
                }

                $value = $row['value'] ?? null;
                if ($row['key'] === 'newsroom_boilerplate') {
                    $value = HtmlSanitiser::clean($value);
                }

                $setting->setPlainValue(blank($value) ? null : $value);
                $setting->save();
            }
        });

        Setting::flushCache();

        return response()->json(['message' => 'Saved.', 'data' => $this->rows($contentType), 'meta' => $this->meta($contentType)]);
    }

    /** @return list<string> */
    public static function keysFor(ContentType $type): array
    {
        return self::KEYS[(string) $type->preset] ?? [];
    }

    /** @return list<array<string, mixed>> */
    private function rows(ContentType $type): array
    {
        $keys = self::keysFor($type);

        return Setting::query()->whereIn('key', $keys)->get()
            ->sortBy(fn (Setting $s) => array_search($s->key, $keys, true))
            ->values()
            ->map(fn (Setting $s) => ['key' => $s->key, 'value' => $s->value, 'type' => $s->type])
            ->all();
    }

    /** @return array<string, mixed> */
    private function meta(ContentType $type): array
    {
        return $type->preset === 'newsroom_releases'
            ? ['download_categories' => DownloadCategory::query()->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])->toArray()]
            : [];
    }
}
