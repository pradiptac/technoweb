<?php

namespace App\Support;

use App\Enums\PaymentGateway;
use App\Models\Media;
use App\Models\Setting;
use App\Support\Chat\ChatSettings;
use Illuminate\Support\Str;

/**
 * The public `/settings` map — what the site needs to paint itself before
 * anybody is signed in, and nothing else.
 *
 * Extracted from `ContentController::settings()`, which had grown to 170
 * lines of whitelist, two named exceptions, a derived bit and the
 * path-to-URL map, on the most-read endpoint on the site. The rules are
 * unchanged and each still says why it is here; what changed is that they
 * can be read, and unit-tested, without a controller around them.
 */
class PublicSettings
{
    /**
     * The groups a visitor may read. Everything else — `mail`, `integrations`,
     * `payments`, `newsletter`, `chatbot`, `seo`, `media`, `security` — stays
     * server-side unless a key below names it deliberately.
     */
    public const GROUPS = ['general', 'contact', 'social', 'homepage', 'analytics', 'consent', 'appearance', 'motion', 'banners', 'announcement', 'themes', 'portal', 'auth', 'store', 'blog'];

    /** @return array<string, string> */
    public static function build(): array
    {
        // mail and integrations are deliberately absent: they hold the SMTP
        // credentials and the API key, and this endpoint has no authentication
        // in front of it.
        // `auth` says which sign-in methods are offered, never anything about
        // a credential. Both login screens are unauthenticated, so they cannot
        // render the right first step without it.
        // `store` holds one key and it says whether the shop is open. The
        // *payment* keys are in `payments`, which is private like `mail`.
        // `banners` is nine media paths and a switch — the picture behind each
        // section's page heading. It has to be public for the same reason
        // `appearance` is: the heading is painted before anybody signs in.
        $public = self::GROUPS;

        /*
         * Read from the cached rows rather than the table. This endpoint is
         * fetched by the frontend on every layout render and revalidation,
         * and it ran three `settings` queries per call while a cached copy
         * of the whole table already sat in the request. `rows_cached()`
         * holds only non-secret rows and raw string values — the two things
         * this endpoint needs and `all_cached()` does not provide.
         */
        $rows = collect(Setting::rows_cached());

        $values = $rows
            ->filter(fn (array $row) => in_array($row['group'], $public, true))
            ->map(fn (array $row) => $row['value'])
            ->filter(fn ($v) => $v !== null && $v !== '');

        /*
         * One key from a private group, named explicitly.
         *
         * The whitelist is by *group*, which is the right default — a setting
         * added later is private until somebody deliberately publishes it. But
         * the `newsletter` group also holds the from-address and the batch
         * sizes, and the site needs exactly one fact from it: whether to draw
         * the signup form at all. A form that renders and then answers 403 is
         * worse than no form.
         *
         * Named rather than grouped, so this stays one considered exception
         * instead of a second whitelist that grows.
         */
        $signup = $rows['newsletter_signup_enabled']['value'] ?? null;

        if ($signup !== null) {
            $values['newsletter_signup_enabled'] = $signup;
        }

        /*
         * Four of the chatbot's settings, named for the same reason.
         *
         * That group also holds the model, the spend ceiling and the context
         * window, none of which is a visitor's business. The site needs
         * exactly what it takes to draw the thing before anybody speaks:
         * whether it exists, what it opens saying, what the chips offer, and
         * what it says when it cannot help. See `ChatSettings::PUBLIC_KEYS`.
         */
        foreach (ChatSettings::PUBLIC_KEYS as $key) {
            $value = $rows[$key]['value'] ?? null;

            if ($value !== null && $value !== '') {
                $values[$key] = $value;
            }
        }

        /*
         * Whether the shop can actually take money, which is not a setting.
         *
         * It is derived: a gateway is chosen *and* this server has its keys.
         * The storefront needs it before anybody authenticates, so it cannot
         * ask an admin endpoint — and it must not be a stored flag, which would
         * be a second answer free to disagree with the keys themselves.
         *
         * Nothing about the keys is published. This is one bit: yes or no.
         */
        $values['store_payments_ready'] = PaymentGateway::active() !== null ? '1' : '0';

        /*
         * Whether the announcement bar shows, decided here for the reason
         * `Announcement` gives: the switch, the window and the message are
         * three settings, and the frontend must not be the one combining
         * them against a visitor's clock. One bit, like the one above.
         */
        $values['announcement_live'] = Announcement::isLive($values->all()) ? '1' : '0';

        /*
         * Every public setting whose key ends in `_path`, mapped to the
         * prefix its URL is published under: `logo_path` => `logo`, and so
         * `logo_url`.
         *
         * **Derived rather than listed, and that is the point of it.** This
         * was a hand-written map, and a hand-written list of keys on one side
         * of the wire is the drift this codebase keeps being bitten by — the
         * SEO overview's `admin_path` spelled with the API's resource names,
         * `schema_type_options` written out twice. A `_path` setting added to
         * the seeder and forgotten here is a picture the frontend can never
         * resolve, with nothing failing and nothing saying so. There are nine
         * banner paths; listing them would have been nine chances to miss one.
         *
         * The convention it relies on is already universal: every one of the
         * four keys this replaced was its own prefix plus `_path`.
         */
        $images = $values->keys()
            ->filter(fn (string $key) => str_ends_with($key, '_path'))
            ->mapWithKeys(fn (string $key) => [$key => Str::beforeLast($key, '_path')])
            ->all();

        /*
         * The natural dimensions travel with the URL, in one query for all
         * of them.
         *
         * Without them the frontend has to guess an aspect ratio in order to
         * reserve space, and a guess is wrong by definition: the file is
         * whatever the client uploaded. The header guessed 180x40 for a mark
         * that is 600x81, so the box was 126px until the image arrived and
         * 207px afterwards — and the navigation beside it visibly jumped
         * right on every cold load.
         *
         * `withTrashed`, because deleting a media row fills the bin and
         * **keeps the bytes**: the path still serves, so the image still
         * renders and its dimensions are still the truth about it.
         *
         * A path with no media row behind it — typed by hand, or uploaded
         * before the library recorded dimensions — simply carries no numbers,
         * and the frontend falls back. That is a smaller layout shift than
         * a wrong ratio, not a correct reservation.
         */
        $dimensions = Media::withTrashed()
            ->whereIn('path', collect($images)->keys()
                ->filter(fn ($k) => $values->has($k))
                ->map(fn ($k) => $values[$k])
                ->all())
            ->get(['path', 'width', 'height'])
            ->keyBy('path');

        // Stored as paths, served as URLs — the same split the media library
        // and every cover image use. The path stays in the response so the
        // admin can round-trip it.
        foreach ($images as $path => $prefix) {
            if (! $values->has($path)) {
                continue;
            }

            $values[$prefix.'_url'] = asset('storage/'.$values[$path]);

            $file = $dimensions->get($values[$path]);

            if ($file?->width && $file?->height) {
                // Strings, like every other value in this map — it is a flat
                // key/value response and a caller reading one number as a
                // number and its neighbour as a string is a trap.
                $values[$prefix.'_width'] = (string) $file->width;
                $values[$prefix.'_height'] = (string) $file->height;
            }
        }

        return $values->all();
    }
}
