<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Site settings. Behind role:admin rather than role:content_manager — the
 * Role enum puts "settings" under the administrator's remit, and these values
 * are site-wide rather than per-record content.
 *
 * Only keys that already exist can be written. Settings are read by name all
 * over the codebase, so letting the UI invent new ones would fill the table
 * with keys nothing reads.
 *
 * Secrets — the SMTP password, the API key — are never sent to the browser,
 * not even to the administrator who set them. The response says whether one
 * is configured and nothing more. Anything else would put a live credential
 * in the page source of an admin screen, in browser history, and in the
 * response body of a request that might be logged.
 */
class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get();

        return response()->json([
            'data' => $settings->groupBy('group')->map(fn ($rows) => $rows->map(fn (Setting $s) => [
                'key' => $s->key,
                // Null for a secret, always — see the class docblock.
                'value' => $s->is_secret ? null : $s->value,
                'type' => $s->type,
                'is_secret' => $s->is_secret,
                // So the UI can say "configured" rather than showing a blank
                // box that looks like nothing was ever saved.
                'is_set' => filled($s->value),
                // A resolved URL for the settings that hold a media path, so
                // the picker can show a preview without the frontend having to
                // know how storage paths map to URLs.
                'url' => str_ends_with($s->key, '_path') && filled($s->value)
                    ? asset('storage/'.$s->value)
                    : null,
            ])->values()),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        // query()->get(), not Setting::get() — the model overrides that
        // static to read a single value by key.
        $existing = Setting::query()->get()->keyBy('key');

        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'max:255'],
            // Longer than the old 2000: an SMTP password is short, but a map
            // embed URL and the homepage lede are not.
            'settings.*.value' => ['nullable', 'string', 'max:4000'],
        ]);

        // A map embed becomes an iframe src on the contact page. Restricting
        // it to Google's embed host is what stops an administrator account —
        // or anyone who takes one over — framing an arbitrary page inside the
        // site's own origin.
        $this->validateMapEmbed($request);

        DB::transaction(function () use ($validated, $existing) {
            foreach ($validated['settings'] as $row) {
                $setting = $existing->get($row['key']);

                if (! $setting) {
                    continue;
                }

                $value = $row['value'];

                // A blank secret means "leave it alone", not "clear it".
                // The form cannot show the current value, so it submits blank
                // every time; treating that as a delete would wipe the SMTP
                // password on every unrelated save. Clearing one is a separate,
                // deliberate action — see clearSecret().
                if ($setting->is_secret && blank($value)) {
                    continue;
                }

                // A URL field left blank means "hide it", not "store an empty
                // string that later renders as a link to nowhere".
                $setting->setPlainValue($value);
                $setting->save();
            }
        });

        cache()->forget('settings.all');

        return response()->json(['message' => 'Settings saved.']);
    }

    /** Removing a credential, which a blank save deliberately cannot do. */
    public function clearSecret(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', Rule::exists('settings', 'key')],
        ]);

        $setting = Setting::where('key', $data['key'])->firstOrFail();

        abort_unless($setting->is_secret, 422, 'That setting is not a credential.');

        $setting->forceFill(['value' => null])->save();

        return response()->json(['message' => 'Credential cleared.']);
    }

    private function validateMapEmbed(Request $request): void
    {
        foreach ($request->input('settings', []) as $i => $row) {
            if (($row['key'] ?? '') !== 'map_embed_url' || blank($row['value'] ?? null)) {
                continue;
            }

            if (! str_starts_with($row['value'], 'https://www.google.com/maps/embed')) {
                // Keyed to the row so the message lands on the field the
                // editor was typing in, not on the form as a whole.
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Use a Google Maps embed URL: Share, then "Embed a map", then paste the src from the iframe.',
                ]);
            }
        }
    }
}
