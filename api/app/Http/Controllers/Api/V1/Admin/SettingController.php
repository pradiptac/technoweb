<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AiModel;
use App\Enums\ImageQuality;
use App\Enums\PaymentGateway;
use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\UploadLimits;
use App\Support\YouTube;
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
                /*
                 * The choices, for a setting that has a fixed set of them.
                 *
                 * Sent by the API rather than listed in TypeScript, which is
                 * the same rule `schema_type_options` follows: two
                 * hand-written copies of one list of strings is exactly the
                 * drift nothing type-checks across the wire. The console
                 * builds the control from this, and `update()` validates
                 * against the same enum.
                 */
                'options' => self::optionsFor($s->key),
            ])->values()),
            /*
             * Facts about the server, alongside the values it stores.
             *
             * `meta` rather than a settings group because none of it is
             * editable: php.ini is not something this console can write, and
             * rendering it as a disabled input would invite people to try. It
             * is here at all because a size limit above what PHP accepts is
             * invisible from the console otherwise — the screen says 20MB, the
             * server refuses at 2MB, and neither mentions the other.
             */
            'meta' => [
                'uploads' => UploadLimits::describe(),
                'payments' => self::payments(),
            ],
        ]);
    }

    /**
     * What the payments panel needs, including the URL to paste into Razorpay.
     *
     * **The webhook URL is generated from the route table, not written down.**
     * A URL typed into a template is a URL that keeps pointing at the old path
     * after somebody moves the route, and the failure is silent for weeks: the
     * gateway posts into a 404, every order stays unpaid, and the console looks
     * fine. `route()` cannot drift, and it resolves against this server's own
     * `APP_URL` — so a development machine shows its own address rather than
     * the production one, which is the mistake `frontend_url` already caused
     * on the SEO overview.
     *
     * The events are listed for the same reason. Subscribing to everything
     * Razorpay offers is not harmful, but subscribing to neither of these is
     * an install where payment silently never completes, and "which events"
     * is not a question the dashboard answers for you.
     *
     * @return array<string, mixed>
     */
    private static function payments(): array
    {
        return [
            'gateways' => PaymentGateway::options(),
            'active' => PaymentGateway::active()?->value,
            'webhook_url' => route('api.v1.payments.webhook', ['gateway' => 'razorpay']),
            'webhook_events' => ['payment.captured', 'payment.failed'],
        ];
    }

    /**
     * Settings whose value is a choice rather than a string.
     *
     * A short map rather than a column on the row: it is one key today, and a
     * schema change to describe a control is a lot of table for a list that
     * lives perfectly well in the enum that already owns it.
     *
     * @return array<int, array{value:string,label:string,description:string}>|null
     */
    private static function optionsFor(string $key): ?array
    {
        return match ($key) {
            'image_quality' => ImageQuality::options(),
            // The gateway list comes from the enum, which also knows which of
            // them this server can actually use. One list, as with the mail
            // transports.
            'payment_gateway' => array_map(
                fn (array $g) => [
                    'value' => $g['value'],
                    'label' => $g['label'],
                    'description' => $g['reason'] ?? 'Ready to take payments.',
                ],
                PaymentGateway::options(),
            ),
            /*
             * Which step a sign-in form opens on. A dropdown rather than a text
             * box for the reason `schema_type` had to become one: free text
             * invites a guess, and a value nothing recognises would silently
             * fall back while looking like it was saved.
             *
             * The descriptions say what the *other* route still does, because
             * the question people actually have here is whether choosing one
             * takes the other away. It does not.
             */
            'default_login_method' => [
                [
                    'value' => 'otp',
                    'label' => 'A code by email',
                    'description' => 'The sign-in form asks for an address and emails a six-digit code. A password is one link away, if passwords are switched on.',
                ],
                [
                    'value' => 'password',
                    'label' => 'A password',
                    'description' => 'The sign-in form asks for an address and a password. Signing in with a code is one link away, if codes are switched on.',
                ],
            ],
            /*
             * Which model the AI features call.
             *
             * A picker for the reason `schema_type` and `default_login_method`
             * both became one — free text accepts a typo, saves it, reports it
             * saved, and fails at *send* time with the provider's error.
             *
             * `AiModel::options($stored)` is passed the current value so a
             * model set outside the list survives being looked at: a select
             * whose current value is absent silently reassigns itself to the
             * first option the moment the form is submitted, which here would
             * change what somebody is billed for without anybody choosing it.
             */
            'seo_ai_model' => AiModel::options(
                (string) Setting::query()->where('key', 'seo_ai_model')->value('value'),
            ),
            'chatbot_model' => AiModel::options(
                (string) Setting::query()->where('key', 'chatbot_model')->value('value'),
            ),
            default => null,
        };
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
        $this->validateBlogVideo($request);
        $this->validateAppearance($request);
        $this->validateMotion($request);

        /*
         * A setting with a fixed set of choices is checked against that set.
         *
         * The console builds its control from `options`, so it cannot send
         * anything else — but the endpoint is the boundary, and a value that
         * outlives the list which accepted it is exactly what
         * `ImageQuality::current()` falls back for. Refusing on write means
         * that fallback stays a safety net rather than routine behaviour.
         */
        foreach ($validated['settings'] as $i => $row) {
            if ($row['key'] === 'image_quality' && filled($row['value'])
                && ImageQuality::tryFrom($row['value']) === null) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'That is not one of the image quality presets.',
                ]);
            }

            /*
             * A model is checked against the list **or against what is already
             * stored**, which is the one place this endpoint deliberately
             * accepts something outside an allowlist.
             *
             * The alternative refuses to save an unrelated setting on an
             * install whose model was set directly in the database, or before
             * this list existed — and the fix for that would be to silently
             * rewrite their model, which is the thing `AiModel` exists to
             * prevent. Offering a closed list and accepting an open one sounds
             * inconsistent and is not: the list is what the console *offers*,
             * and this is what the API *tolerates* so the console cannot lose
             * somebody's deliberate choice by rendering it.
             */
            if (in_array($row['key'], ['seo_ai_model', 'chatbot_model'], true) && filled($row['value'])) {
                $stored = (string) ($existing[$row['key']]->value ?? '');

                if (AiModel::tryFrom($row['value']) === null && $row['value'] !== $stored) {
                    throw ValidationException::withMessages([
                        "settings.{$i}.value" => 'That is not one of the models offered. Set it directly if you mean it.',
                    ]);
                }
            }

            /*
             * A size limit is refused rather than silently clamped.
             *
             * `UploadLimits::maxKb()` clamps at read time so the *enforced*
             * limit is always one PHP can honour — but storing a number the
             * server will never reach means the console displays a promise it
             * cannot keep. Refusing here, with php.ini's own figure in the
             * message, is what makes the ceiling discoverable at the moment
             * somebody runs into it.
             */
            if (in_array($row['key'], ['media_max_kb', 'media_max_video_kb'], true) && filled($row['value'])) {
                $kb = (int) $row['value'];
                $ceiling = UploadLimits::phpCeilingKb();

                if ($kb < 1) {
                    throw ValidationException::withMessages([
                        "settings.{$i}.value" => 'Give a size in kilobytes, greater than zero.',
                    ]);
                }

                if ($kb > $ceiling) {
                    throw ValidationException::withMessages([
                        "settings.{$i}.value" => 'This server accepts at most '
                            .round($ceiling / 1024).' MB per upload — raising it further needs '
                            .'upload_max_filesize and post_max_size changed in php.ini.',
                    ]);
                }
            }
        }

        DB::transaction(function () use ($validated, $existing) {
            foreach ($validated['settings'] as $row) {
                $setting = $existing->get($row['key']);

                if (! $setting) {
                    continue;
                }

                $value = $row['value'];

                // One spelling of a colour. Validated as a hex already; stored
                // lower-case so `#2563EB` and `#2563eb` are one value.
                if (str_starts_with($row['key'], 'theme_') && ! str_starts_with($row['key'], 'theme_font') && filled($value)) {
                    $value = strtolower((string) $value);
                }

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

    /**
     * The blog's sidebar video, checked against YouTube's own hosts.
     *
     * It becomes an iframe `src`, and an unchecked one is somebody else's page
     * rendered inside this origin — the same reasoning the map embed above
     * follows and the slider's video field already follows. `App\Support\YouTube`
     * compares the host **exactly**, so `youtube.com.attacker.test` cannot pass.
     */
    private function validateBlogVideo(Request $request): void
    {
        foreach ($request->input('settings', []) as $i => $row) {
            if (($row['key'] ?? '') !== 'blog_video_url' || blank($row['value'] ?? null)) {
                continue;
            }

            if (YouTube::id($row['value']) === null) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Paste a YouTube link — a watch, share, embed or shorts URL.',
                ]);
            }
        }
    }

    /**
     * The five theme colours are `#rrggbb` and the two fonts are ids.
     *
     * A colour that is not a hex would not break the site — the frontend
     * falls back per field — but it would silently paint the house colour
     * where somebody typed their brand's, which is worse than a refusal that
     * names the box. Lower-cased where it is written, so two spellings of one
     * colour are one value.
     *
     * The font ids are checked for shape only. The list of faces lives on
     * the frontend, where the files are, and an id it does not know falls
     * back to the default face; keeping a second copy of that list here to
     * refuse against is the `admin_path` drift with nothing to catch it.
     */
    private function validateAppearance(Request $request): void
    {
        $colours = ['theme_primary', 'theme_secondary', 'theme_accent', 'theme_background', 'theme_text'];
        $fonts = ['theme_font_display', 'theme_font_body'];

        foreach ($request->input('settings', []) as $i => $row) {
            $key = $row['key'] ?? '';
            $value = $row['value'] ?? null;

            if (in_array($key, $colours, true) && filled($value)) {
                if (! preg_match('/^#[0-9a-fA-F]{6}$/', (string) $value)) {
                    throw ValidationException::withMessages([
                        "settings.{$i}.value" => 'A colour is six hex digits after a #, such as #2563eb.',
                    ]);
                }
            }

            if (in_array($key, $fonts, true) && filled($value)
                && ! preg_match('/^[a-z][a-z0-9-]{1,31}$/', (string) $value)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Choose a font from the list.',
                ]);
            }
        }
    }

    /**
     * The motion ids are checked for shape only, for the reason the fonts
     * are: the list of styles lives on the frontend in motion-choices.ts,
     * an id it does not know falls back to the default, and a second copy
     * of the list here would be the `admin_path` drift. The one boolean is
     * held to `0` or `1`, because "2" would read as on to a truthiness check
     * and off to a strict one.
     */
    private function validateMotion(Request $request): void
    {
        $ids = ['motion_reveal', 'motion_buttons', 'motion_page', 'motion_loader', 'motion_hero'];

        foreach ($request->input('settings', []) as $i => $row) {
            $key = $row['key'] ?? '';
            $value = $row['value'] ?? null;

            if (in_array($key, $ids, true) && filled($value)
                && ! preg_match('/^[a-z][a-z0-9-]{1,31}$/', (string) $value)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Choose a style from the list.',
                ]);
            }

            if ($key === 'motion_splash' && filled($value) && ! in_array((string) $value, ['0', '1'], true)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'The splash is 1 to show it or 0 to leave it off.',
                ]);
            }
        }
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
