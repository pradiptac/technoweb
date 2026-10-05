<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AiModel;
use App\Enums\ContentBlockType;
use App\Enums\ImageQuality;
use App\Enums\MailTransport;
use App\Enums\MessageChannel;
use App\Enums\PaymentGateway;
use App\Http\Controllers\Controller;
use App\Models\ContentBlock;
use App\Models\Coupon;
use App\Models\Setting;
use App\Support\Announcement;
use App\Support\Backups\BackupSettings;
use App\Support\Chat\ChatSettings;
use App\Support\HtmlSanitiser;
use App\Support\InboundMail\InboundMail;
use App\Support\Meetings\MeetingSettings;
use App\Support\Messaging\ProviderOption;
use App\Support\Messaging\Providers\Fcm;
use App\Support\Messaging\Providers\GoogleRbm;
use App\Support\Net\PublicHost;
use App\Support\Seo\GoogleServiceAccount;
use App\Support\Store\CartReminders;
use App\Support\ThemeOptions;
use App\Support\UploadLimits;
use App\Support\Visits\VisitSettings;
use App\Support\YouTube;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
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
                'value' => $s->is_secret ? null : ($s->key === 'site_theme_options' ? ThemeOptions::withUrls($s->value) : $s->value),
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
            // Keyed by gateway: each has its own URL and its own event names,
            // and the panel shows the pair for the one chosen.
            'webhooks' => [
                'razorpay' => ['url' => route('api.v1.payments.webhook', ['gateway' => 'razorpay']), 'events' => ['payment.captured', 'payment.failed']],
                'cashfree' => ['url' => route('api.v1.payments.webhook', ['gateway' => 'cashfree']), 'events' => ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK']],
            ],
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
    /** The homepage figures' size; the frontend maps each to a pixel size (`lib/stat-look.ts`). */
    public const STAT_SIZES = [
        ['value' => 'small', 'label' => 'Small', 'description' => 'Quiet figures, a little larger than the body text.'],
        ['value' => 'medium', 'label' => 'Medium', 'description' => 'The size the homepage shipped at; the default.'],
        ['value' => 'large', 'label' => 'Large', 'description' => 'Display-sized figures that carry the row.'],
    ];

    /** Which setting chooses which kind of homepage block. */
    public const HOME_BLOCKS = [
        'home_stats_block' => ContentBlockType::Stats,
        'home_pricing_block' => ContentBlockType::Pricing,
        'home_stack_block' => ContentBlockType::Stack,
    ];

    /**
     * A homepage block setting's choices: none, then every published block of
     * that kind by name. A picker, not a slug typed by hand — a typo would
     * save, report saved and draw nothing.
     *
     * @return list<array{value: string, label: string, description: string}>
     */
    private static function blockOptions(ContentBlockType $type): array
    {
        return [
            ['value' => '', 'label' => 'None', 'description' => 'No section on the homepage.'],
            ...ContentBlock::query()->published()->where('type', $type)->orderBy('name')->get(['slug', 'name', 'layout'])
                ->map(fn (ContentBlock $b) => ['value' => $b->slug, 'label' => $b->name, 'description' => '['.$type->value.' slug="'.$b->slug.'"]'])
                ->all(),
        ];
    }

    /**
     * How the footer's social links are drawn (the client, 2026-09-24). The
     * frontend's `SocialLinks` reads the value and falls back to `flip`.
     */
    public const SOCIAL_STYLES = [
        ['value' => 'flip', 'label' => 'Flip tiles', 'description' => 'A letter on each tile, spelling the word below; pointing at the row flips them one after another to the icons. Phones show the icons.'],
        ['value' => 'dock', 'label' => 'Magnifying dock', 'description' => 'The icons in bordered tiles that grow under the pointer, each taking its brand colour.'],
    ];

    /**
     * The corners and the breathing room of the public site and the portal
     * (2026-10-05, docs/look-and-feel.md). The first of each is what the site
     * drew before the setting existed, so an install that never opens the
     * control renders byte for byte as it did. The frontend's `lib/look.ts`
     * resolves them and falls back to the first.
     */
    public const RADII = [
        ['value' => 'soft', 'label' => 'Soft', 'description' => 'Gently rounded corners — the site as it has always been.'],
        ['value' => 'sharp', 'label' => 'Sharp', 'description' => 'Nearly square corners. Engineered, precise, corporate.'],
        ['value' => 'round', 'label' => 'Round', 'description' => 'Generous curves on cards, buttons and pictures. Friendly, modern.'],
    ];

    public const DENSITIES = [
        ['value' => 'comfortable', 'label' => 'Comfortable', 'description' => 'The spacing between sections the site has always had.'],
        ['value' => 'compact', 'label' => 'Compact', 'description' => 'Sections closer together — more on each screen.'],
        ['value' => 'airy', 'label' => 'Airy', 'description' => 'More room around every section. Calm and premium.'],
    ];

    /**
     * How a statistic's figure arrives the first time it scrolls into view.
     * Drawn by the frontend's `StatValue`; the list is here because the
     * console builds its select from `options`, the rule `stats_size` and
     * `schema_type_options` follow.
     */
    public const STAT_ANIMATIONS = [
        ['value' => 'none', 'label' => 'None', 'description' => 'The figures are simply there.'],
        ['value' => 'count', 'label' => 'Count up', 'description' => 'Each number counts up from zero over a second and a half, keeping its sign, unit and decimal places. The default, and what every other figure on the site does.'],
        ['value' => 'rise', 'label' => 'Rise', 'description' => 'Each figure rises into place as it fades in, one after another along the row.'],
        ['value' => 'flip', 'label' => 'Flip', 'description' => 'Each character turns in like a split-flap board, one after another.'],
    ];

    private static function optionsFor(string $key): ?array
    {
        return match ($key) {
            'image_quality' => ImageQuality::options(),
            // Two words rather than "1 or 0" in a text box: this one decides
            // whether customers are emailed, which is not a thing to typo.
            'store_cart_reminders_enabled' => [
                ['value' => '0', 'label' => 'Off', 'description' => 'Nobody is emailed about a basket they left.'],
                ['value' => '1', 'label' => 'On', 'description' => 'Up to two reminders, inside the promotional hours, never to the do-not-mail list.'],
            ],
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
            'chatbot_icon' => ChatSettings::ICONS,
            'chatbot_font_size' => ChatSettings::FONT_SIZES,
            'chatbot_animation' => ChatSettings::ANIMATIONS,
            'stats_size' => self::STAT_SIZES,
            'social_style' => self::SOCIAL_STYLES,
            'theme_radius' => self::RADII,
            'theme_density' => self::DENSITIES,
            'home_stats_block' => self::blockOptions(ContentBlockType::Stats),
            'home_pricing_block' => self::blockOptions(ContentBlockType::Pricing),
            'home_stack_block' => self::blockOptions(ContentBlockType::Stack),
            'stats_animation' => self::STAT_ANIMATIONS,
            'chatbot_model' => AiModel::options(
                (string) Setting::query()->where('key', 'chatbot_model')->value('value'),
            ),
            'messaging_whatsapp_provider' => self::messagingOptions(MessageChannel::WhatsApp),
            'messaging_rcs_provider' => self::messagingOptions(MessageChannel::Rcs),
            'messaging_push_provider' => self::messagingOptions(MessageChannel::Push),
            // The support mailbox's choices: provider, what to do with a
            // processed message, unknown senders, priority, encryption.
            // Online meetings' switches and the slot step (docs/meetings.md).
            default => InboundMail::options()[$key] ?? BackupSettings::OPTIONS[$key] ?? MeetingSettings::OPTIONS[$key] ?? null,
        };
    }

    /**
     * A channel's providers as a select: off, then each provider the enum
     * lists — the mail transports' rule, one list on one side of the wire.
     *
     * @return list<array{value: string, label: string, description: string}>
     */
    private static function messagingOptions(MessageChannel $channel): array
    {
        return [
            ['value' => '', 'label' => 'Off', 'description' => "Nothing is sent on {$channel->label()} and no opt-in is offered for it."],
            ...array_map(fn (ProviderOption $p) => [
                'value' => $p->id(),
                'label' => $p->label(),
                'description' => $p->isAvailable() ? $p->blurb() : 'Needs the OpenSSL extension, which the PHP on this server does not have.',
            ], $channel->providers()),
        ];
    }

    /**
     * Every setting that is a colour, so one regexp and one lower-casing
     * cover them — the theme's six and the announcement bar's two.
     */
    private const COLOUR_KEYS = [
        'theme_primary', 'theme_secondary', 'theme_accent', 'theme_background', 'theme_text', 'theme_topbar',
        'announcement_colour', 'announcement_colour_2',
    ];

    /**
     * The settings that hold HTML, and the purifier profile each goes through.
     *
     * Sanitised on write, the rule every rich-text column follows — and it
     * had not been followed here: `activation_procedure` went straight to the
     * database and out to the order page. The announcement bar's message is
     * rendered on every public page, so it uses the narrower `inline`
     * profile (emphasis and links, no style), for the reason
     * `config/purifier.php` gives beside it.
     */
    private const RICH_TEXT = [
        'activation_procedure' => HtmlSanitiser::PROFILE,
        'announcement_message' => HtmlSanitiser::INLINE,
        // The sign-in panel's message: headings and lists are the point of
        // it, so the full `cms` profile rather than `inline`.
        'login_message' => HtmlSanitiser::PROFILE,
    ];

    public function update(Request $request): JsonResponse
    {
        // query()->get(), not Setting::get() — the model overrides that
        // static to read a single value by key.
        $existing = Setting::query()->get()->keyBy('key');

        // Before validation, so `max:4000` measures the clean markup and the
        // raw markup never reaches the write loop below.
        $this->sanitiseRichText($request);
        // Also before validation, and for the same reason: the cleaned JSON is
        // what `$validated` carries into the write loop below.
        $this->validateThemeOptions($request);
        // Same again: it lower-cases the colour, and the write loop reads `$validated`.
        $this->validateChatbotAppearance($request);

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
        $this->validateProfilesAndTagIds($request);
        $this->validateMailServers($request, $existing);
        $this->validateBlogVideo($request);
        $this->validateAppearance($request);
        $this->validateMotion($request);
        $this->validateSiteTheme($request);
        $this->validateAnnouncement($request, $existing);
        $this->validateMessaging($request, $existing);
        $this->validateVisits($request);
        BackupSettings::validate((array) $request->input('settings', []), $existing);

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
            // Cashfree's environment is one of two words; sandbox keys against
            // production answer 401 at the moment somebody presses Pay.
            if ($row['key'] === 'cashfree_environment' && filled($row['value'])
                && ! in_array($row['value'], ['sandbox', 'production'], true)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'The Cashfree environment is sandbox or production.',
                ]);
            }

            // A GA4 property id is the number under Admin → Property details.
            // The measurement id (G-XXXX) is what people paste by mistake, and
            // it addresses nothing on the Data API.
            if ($row['key'] === 'ga4_property_id' && filled($row['value']) && ! preg_match('/^\d{1,20}$/', $row['value'])) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'The GA4 property id is the number shown under Admin → Property details, such as 123456789 — not the G- measurement id.',
                ]);
            }

            /*
             * The basket reminders' delays, refused outside their range
             * rather than clamped: the second has to land before the prune
             * deletes the basket at thirty days, and a number the console
             * accepted and the command then quietly ignored is a setting
             * that lies about what it does.
             */
            $delays = [
                'store_cart_reminder_1_hours' => [CartReminders::MAX_FIRST_HOURS, 'The first reminder goes between 1 and '.CartReminders::MAX_FIRST_HOURS.' hours after the basket goes quiet.'],
                'store_cart_reminder_2_days' => [CartReminders::MAX_SECOND_DAYS, 'The second reminder goes between 1 and '.CartReminders::MAX_SECOND_DAYS.' days after — an untouched basket is deleted at 30.'],
            ];

            if ($row['key'] === 'store_cart_reminders_enabled' && ! in_array((string) $row['value'], ['0', '1'], true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Basket reminders are on (1) or off (0).']);
            }

            if (isset($delays[$row['key']]) && filled($row['value'])) {
                [$max, $message] = $delays[$row['key']];

                if (! ctype_digit((string) $row['value']) || (int) $row['value'] < 1 || (int) $row['value'] > $max) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => $message]);
                }
            }

            // A reminder coupon has to be a code the shop has, or the second
            // reminder would offer a discount the checkout refuses.
            if ($row['key'] === 'store_cart_reminder_coupon' && filled($row['value'])
                && ! Coupon::where('code', Coupon::normalise($row['value']))->exists()) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'There is no discount code called '.Coupon::normalise($row['value']).'. Make it under Store → Discount codes first.',
                ]);
            }

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

            // The wishlist price-drop threshold: a whole percentage, refused
            // outside 1–90 rather than read as five without saying so.
            if ($row['key'] === 'store_price_drop_min_percent' && filled($row['value'])
                && (! ctype_digit((string) $row['value']) || (int) $row['value'] < 1 || (int) $row['value'] > 90)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Give a whole percentage between 1 and 90.',
                ]);
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
                if (in_array($row['key'], self::COLOUR_KEYS, true) && filled($value)) {
                    $value = strtolower((string) $value);
                }

                // A coupon is matched on its normalised code; store it that way.
                if ($row['key'] === 'store_cart_reminder_coupon' && filled($value)) {
                    $value = Coupon::normalise((string) $value);
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
     * The six theme colours are `#rrggbb` and the two fonts are ids.
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
        $colours = self::COLOUR_KEYS;
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
        // The sign-in screen's three ids ride on the same rule: same shape,
        // same list-on-the-frontend reasoning (login-backdrop-choices.ts).
        $ids = ['motion_reveal', 'motion_buttons', 'motion_page', 'motion_loader', 'motion_hero', 'login_backdrop', 'login_intensity', 'login_speed'];

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

    /**
     * The site theme id is checked for shape only, the motion rule for the
     * motion reason: the themes are folders on the frontend, listed in
     * `themes/manifests.ts`, and an id the frontend does not know renders
     * `classic` — so a value refused here would be one the site could
     * already survive, and a list copied here would be the drift.
     */
    private function validateSiteTheme(Request $request): void
    {
        foreach ($request->input('settings', []) as $i => $row) {
            if (($row['key'] ?? '') !== 'site_theme') {
                continue;
            }

            $value = $row['value'] ?? null;

            if (filled($value) && ! preg_match('/^[a-z][a-z0-9-]{1,31}$/', (string) $value)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Choose a theme from the list.',
                ]);
            }
        }
    }

    /**
     * The theme options row is one JSON document holding every theme's
     * choices; `ThemeOptions::clean()` checks its shape and normalises it,
     * and the cleaned document is what gets stored — never the request's
     * bytes. Refused with the class's own sentence, keyed to the row. Runs
     * before `validate()`, like the rich-text cleaner, because the write
     * loop reads the validated copy and a merge after it changes nothing.
     */
    private function validateThemeOptions(Request $request): void
    {
        $rows = $request->input('settings', []);

        foreach ($rows as $i => $row) {
            if (($row['key'] ?? '') !== 'site_theme_options' || blank($row['value'] ?? null)) {
                continue;
            }

            try {
                $rows[$i]['value'] = ThemeOptions::clean((string) $row['value']);
            } catch (\InvalidArgumentException $e) {
                throw ValidationException::withMessages(["settings.{$i}.value" => $e->getMessage()]);
            }
        }

        $request->merge(['settings' => $rows]);
    }

    /**
     * The widget's appearance: a colour that is a hex or blank (blank means
     * the palette's brand), and an icon and a size from the lists the
     * console was drawn from — refused outside them, the rule every select
     * here follows, because the widget cannot draw a glyph it has no drawing
     * for and would fall back in silence.
     */
    private function validateChatbotAppearance(Request $request): void
    {
        $rows = $request->input('settings', []);

        foreach ($rows as $i => $row) {
            $key = $row['key'] ?? '';
            $value = $row['value'] ?? null;

            if (in_array($key, ['chatbot_colour', 'chatbot_background', 'stats_colour'], true) && filled($value)) {
                if (! preg_match('/^#[0-9a-f]{6}$/i', (string) $value)) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'The colour must be a #rrggbb colour, or blank for the brand colour.']);
                }
                $rows[$i]['value'] = strtolower((string) $value);
            }

            if (isset(self::HOME_BLOCKS[$key]) && filled($value)
                && ! ContentBlock::query()->published()->where('type', self::HOME_BLOCKS[$key])->where('slug', $value)->exists()) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a published block of this kind, or None.']);
            }
            foreach (['theme_radius' => self::RADII, 'theme_density' => self::DENSITIES] as $lookKey => $choices) {
                if ($key === $lookKey && filled($value) && ! in_array($value, array_column($choices, 'value'), true)) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose one from the list.']);
                }
            }
            if ($key === 'social_style' && filled($value) && ! in_array($value, array_column(self::SOCIAL_STYLES, 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a style from the list.']);
            }
            // One letter per tile, so letters and digits only; stored upper-case
            // because the tiles are capitals whatever was typed.
            if ($key === 'social_flip_word' && filled($value)) {
                if (! preg_match('/^[A-Za-z0-9]{1,7}$/', (string) $value)) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'Letters and digits only, no spaces, at most 7 — one per tile.']);
                }
                $rows[$i]['value'] = strtoupper((string) $value);
            }
            // The installed app's names (2026-10-05). The short name is what a
            // phone prints under the icon, and a launcher cuts it off at about
            // twelve characters — refused rather than truncated by somebody
            // else's ellipsis. Plain text either way: both reach the manifest.
            if ($key === 'pwa_short_name' && filled($value) && mb_strlen(trim((string) $value)) > 12) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'At most 12 characters — a phone cuts a longer name off under the icon.']);
            }
            if ($key === 'pwa_name' && filled($value) && mb_strlen(trim((string) $value)) > 45) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'At most 45 characters.']);
            }
            if ($key === 'stats_size' && filled($value) && ! in_array($value, array_column(self::STAT_SIZES, 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a size from the list.']);
            }
            if ($key === 'stats_animation' && filled($value) && ! in_array($value, array_column(self::STAT_ANIMATIONS, 'value'), true)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'Choose an animation from the list.',
                ]);
            }

            if (filled($value) && isset(InboundMail::options()[$key])
                && ! in_array($value, array_column(InboundMail::options()[$key], 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose one of the options from the list.']);
            }

            if ($key === 'chatbot_icon' && filled($value) && ! in_array($value, array_column(ChatSettings::ICONS, 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose an icon from the list.']);
            }

            if ($key === 'chatbot_font_size' && filled($value) && ! in_array($value, array_column(ChatSettings::FONT_SIZES, 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a size from the list.']);
            }

            if ($key === 'chatbot_animation' && filled($value) && ! in_array($value, array_column(ChatSettings::ANIMATIONS, 'value'), true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose an animation from the list.']);
            }
        }

        $request->merge(['settings' => $rows]);
    }

    /** Clean every rich-text setting in the request through its profile. */
    private function sanitiseRichText(Request $request): void
    {
        $rows = $request->input('settings');

        if (! is_array($rows)) {
            return;
        }

        foreach ($rows as $i => $row) {
            $profile = self::RICH_TEXT[$row['key'] ?? ''] ?? null;

            if ($profile !== null && is_string($row['value'] ?? null)) {
                $rows[$i]['value'] = HtmlSanitiser::clean($row['value'], $profile);
            }
        }

        $request->merge(['settings' => $rows]);
    }

    /**
     * The announcement bar's shape: two allowlisted words, two switches held
     * to `0`/`1`, and a window that is well-formed and the right way round —
     * the end resolved from the request or the stored value, whichever the
     * request does not carry, because a PATCH sending only the end date is
     * the ordinary way to extend one. Every refusal is keyed to its row.
     *
     * @param  Collection<string, Setting>  $existing
     */
    private function validateAnnouncement(Request $request, $existing): void
    {
        $rows = $request->input('settings', []);
        $sent = [];

        foreach ($rows as $i => $row) {
            $key = $row['key'] ?? '';
            $value = $row['value'] ?? null;
            $sent[$key] = ['i' => $i, 'value' => $value];

            if ($key === 'announcement_style' && filled($value) && ! in_array((string) $value, ['solid', 'gradient'], true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'The background is solid or gradient.']);
            }

            if ($key === 'announcement_mode' && filled($value) && ! in_array((string) $value, ['fixed', 'ticker', 'vertical'], true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'The message is fixed, a ticker or one line at a time.']);
            }

            if (in_array($key, ['announcement_enabled', 'announcement_closable'], true) && filled($value)
                && ! in_array((string) $value, ['0', '1'], true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'A switch is 1 for on or 0 for off.']);
            }

            if (in_array($key, ['announcement_starts_at', 'announcement_ends_at'], true) && filled($value)
                && (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', (string) $value) || Announcement::parse((string) $value) === null)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'A date and time, as the picker writes them.']);
            }
        }

        $starts = array_key_exists('announcement_starts_at', $sent)
            ? $sent['announcement_starts_at']['value']
            : $existing->get('announcement_starts_at')?->value;
        $ends = array_key_exists('announcement_ends_at', $sent)
            ? $sent['announcement_ends_at']['value']
            : $existing->get('announcement_ends_at')?->value;

        $from = Announcement::parse($starts);
        $to = Announcement::parse($ends);

        if ($from !== null && $to !== null && $to->lessThan($from)) {
            $i = $sent['announcement_ends_at']['i'] ?? $sent['announcement_starts_at']['i'] ?? 0;

            throw ValidationException::withMessages(["settings.{$i}.value" => 'The end is before the start, so this would never show.']);
        }
    }

    /**
     * The messaging group: a provider from the channel's own enum or blank
     * for off, a quiet-hours window as two HH:MM times the right way round,
     * and a service-account key that is Google's JSON file — refused here
     * rather than at the first send, the mail transports' rule. A replaced
     * key forgets the token cached for the old one.
     *
     * @param  Collection<string, Setting>  $existing
     */
    private function validateMessaging(Request $request, $existing): void
    {
        $sent = [];

        foreach ($request->input('settings', []) as $i => $row) {
            $key = (string) ($row['key'] ?? '');
            $value = $row['value'] ?? null;
            $sent[$key] = ['i' => $i, 'value' => $value];

            foreach (MessageChannel::cases() as $channel) {
                if ($key === $channel->settingKey() && filled($value) && $channel->provider((string) $value) === null) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'Choose a provider from the list, or Off.']);
                }
            }

            if (in_array($key, ['messaging_promo_start', 'messaging_promo_end'], true) && filled($value)
                && ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $value)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'A time on the 24-hour clock, such as 09:00 or 21:00.']);
            }

            if (in_array($key, [GoogleRbm::KEY, Fcm::KEY], true) && filled($value)) {
                $json = json_decode((string) $value, true);

                if (! is_array($json) || empty($json['client_email']) || empty($json['private_key'])) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'Paste the whole JSON key file Google issued for the service account — it holds client_email and private_key.']);
                }

                GoogleServiceAccount::forget($key === Fcm::KEY ? Fcm::SCOPE : GoogleRbm::SCOPE, $key);
            }
        }

        $start = array_key_exists('messaging_promo_start', $sent) ? $sent['messaging_promo_start']['value'] : $existing->get('messaging_promo_start')?->value;
        $end = array_key_exists('messaging_promo_end', $sent) ? $sent['messaging_promo_end']['value'] : $existing->get('messaging_promo_end')?->value;

        if (filled($start) && filled($end) && (string) $end <= (string) $start) {
            $i = $sent['messaging_promo_end']['i'] ?? $sent['messaging_promo_start']['i'] ?? 0;

            throw ValidationException::withMessages(["settings.{$i}.value" => 'The window closes before it opens. Promotional messages go out between the two times on the same day.']);
        }
    }

    /**
     * The social profiles and the three analytics ids, held to their shape.
     *
     * A profile URL becomes an `href` in every page's footer, so it is an
     * http(s) address and nothing else — `javascript:` saved there ran for
     * whoever pressed the icon. The analytics ids are interpolated into
     * inline scripts on every public page; each has a published shape, and
     * anything outside it is a way to write script into the site from the
     * settings screen.
     */
    private function validateProfilesAndTagIds(Request $request): void
    {
        $shapes = [
            'google_analytics_id' => ['/^G-[A-Z0-9]+$/', 'A GA4 measurement id looks like G-XXXXXXXXXX.'],
            'google_tag_manager_id' => ['/^GTM-[A-Z0-9]+$/', 'A Tag Manager container id looks like GTM-XXXXXXX.'],
            'meta_pixel_id' => ['/^\d+$/', 'A Meta Pixel id is digits only.'],
            // The prefix on a ticket, visit or order number (App\Support\References),
            // read back upper-cased: it must stay something the email-to-ticket
            // reader and a person on the telephone can both parse.
            'ticket_reference_prefix' => ['/^[A-Z][A-Z0-9]{1,5}$/i', 'Two to six letters or digits, starting with a letter — for example TK.'],
            'visit_reference_prefix' => ['/^[A-Z][A-Z0-9]{1,5}$/i', 'Two to six letters or digits, starting with a letter — for example SV.'],
            'meeting_reference_prefix' => ['/^[A-Z][A-Z0-9]{1,5}$/i', 'Two to six letters or digits, starting with a letter — for example MT.'],
            'order_number_prefix' => ['/^[A-Z][A-Z0-9]{1,5}$/i', 'Two to six letters or digits, starting with a letter — for example ORD.'],
        ];

        foreach ($request->input('settings', []) as $i => $row) {
            $key = (string) ($row['key'] ?? '');
            $value = $row['value'] ?? null;

            if (blank($value)) {
                continue;
            }

            if (str_starts_with($key, 'social_') && ! in_array($key, ['social_style', 'social_flip_word'], true)
                && ! preg_match('#^https?://[^\s/]+[^\s]*$#i', (string) $value)) {
                throw ValidationException::withMessages([
                    "settings.{$i}.value" => 'A profile is a web address starting https://, or blank to hide the icon.',
                ]);
            }

            if (isset($shapes[$key]) && ! preg_match($shapes[$key][0], (string) $value)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => $shapes[$key][1]]);
            }
        }
    }

    /** Where each stored mail secret is sent, host key => secret key. */
    private const MAIL_SECRETS = [
        'smtp_host' => 'smtp_password',
        'inbound_imap_host' => 'inbound_imap_password',
    ];

    /** The ports each protocol is served on, and nothing else. */
    private const MAIL_PORTS = [
        'smtp_port' => [25, 465, 587, 2525],
        'inbound_imap_port' => [143, 993],
    ];

    /**
     * The servers mail is sent through and read from.
     *
     * Three rules, each closing a way this screen could be turned on the
     * network or on its own secrets:
     *
     *  - **A public host on a mail port.** The server connects from inside
     *    the network, and the connection test reports what answered — any
     *    host and port made it a scanner of the LAN.
     *  - **Mailgun is one of Mailgun's two hosts.** The API key is sent to
     *    `mailgun_endpoint`; left free, an administrator's session could
     *    point it at a server of their own and read the stored key off the
     *    first send, though the console never shows it.
     *  - **A new host needs the password typed again.** The same trick for
     *    SMTP and IMAP: change the host, keep the stored password, press
     *    Test, and the password is delivered to the new host. Requiring it
     *    in the same save means only somebody who knows it can move it.
     *
     * @param  Collection<string, Setting>  $existing
     */
    private function validateMailServers(Request $request, $existing): void
    {
        $rows = collect($request->input('settings', []));
        $sent = $rows->mapWithKeys(fn ($row, $i) => [(string) ($row['key'] ?? '') => ['i' => $i, 'value' => $row['value'] ?? null]]);

        foreach (array_keys(self::MAIL_SECRETS) as $hostKey) {
            $host = trim((string) ($sent[$hostKey]['value'] ?? ''));

            if ($host !== '' && ($refusal = PublicHost::refusal($host))) {
                throw ValidationException::withMessages(["settings.{$sent[$hostKey]['i']}.value" => $refusal.' A mail server has to be a public host.']);
            }
        }

        foreach (self::MAIL_PORTS as $portKey => $ports) {
            $port = $sent[$portKey]['value'] ?? null;

            if (filled($port) && ! in_array((int) $port, $ports, true)) {
                throw ValidationException::withMessages([
                    "settings.{$sent[$portKey]['i']}.value" => 'Use one of the ports this is served on: '.implode(', ', $ports).'.',
                ]);
            }
        }

        $endpoint = $sent['mailgun_endpoint']['value'] ?? null;

        if (filled($endpoint) && ! in_array(strtolower(trim((string) $endpoint)), MailTransport::MAILGUN_ENDPOINTS, true)) {
            throw ValidationException::withMessages([
                "settings.{$sent['mailgun_endpoint']['i']}.value" => 'Mailgun is api.mailgun.net, or api.eu.mailgun.net for an EU account.',
            ]);
        }

        foreach (self::MAIL_SECRETS as $hostKey => $secretKey) {
            if (! isset($sent[$hostKey])) {
                continue;
            }

            $before = strtolower(trim((string) $existing->get($hostKey)?->value));
            $after = strtolower(trim((string) $sent[$hostKey]['value']));
            $stored = filled($existing->get($secretKey)?->value);
            $retyped = filled($sent[$secretKey]['value'] ?? null);

            if ($after !== '' && $after !== $before && $stored && ! $retyped) {
                throw ValidationException::withMessages([
                    "settings.{$sent[$hostKey]['i']}.value" => 'Type the password again with the new server — the stored one is only ever sent to the server it was saved for.',
                ]);
            }
        }
    }

    /**
     * The `visits` group: the lines and numbers `VisitSettings` parses,
     * refused with the reason rather than saved and quietly read as the
     * default (2026-09-26, docs/visits.md).
     */
    private function validateVisits(Request $request): void
    {
        foreach ($request->input('settings', []) as $i => $row) {
            $key = (string) ($row['key'] ?? '');
            // The `meetings` group is read the same way, by `MeetingSettings`
            // (2026-09-29, docs/meetings.md).
            $refusal = VisitSettings::refusalFor($key, $row['value'] ?? null)
                ?? MeetingSettings::refusalFor($key, $row['value'] ?? null);

            if ($refusal !== null) {
                throw ValidationException::withMessages(["settings.{$i}.value" => $refusal]);
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
