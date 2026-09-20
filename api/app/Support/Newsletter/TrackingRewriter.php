<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterCampaign;
use App\Models\NewsletterLink;
use App\Models\Setting;

/**
 * Rewriting a campaign's links and adding the open pixel.
 *
 * Done **once**, when the campaign is prepared, rather than per recipient. The
 * expensive part is parsing the HTML and reconciling every distinct URL
 * against the `newsletter_links` table; the per-recipient part is one string
 * replacement of a token. Doing it the other way round means that work happens
 * fifty thousand times for a result that is identical every time.
 *
 * So the prepared HTML carries `{{token}}` where the recipient's identifier
 * goes, and `EmailRenderer::personalise()` fills it in alongside the first
 * name and the unsubscribe URL.
 */
class TrackingRewriter
{
    /**
     * Prepare a campaign's HTML for sending.
     *
     * @return string the HTML with tracked links and, if enabled, a pixel
     */
    /** Stands in for the per-recipient token while a URL is generated. */
    private const TOKEN = '__TW_TOKEN__';

    public static function prepare(NewsletterCampaign $campaign, string $html): string
    {
        if (! self::enabled()) {
            return $html;
        }

        $html = preg_replace_callback(
            '/<a\b([^>]*?)href=(["\'])(.*?)\2/i',
            function (array $m) use ($campaign) {
                $url = html_entity_decode($m[3], ENT_QUOTES, 'UTF-8');

                /*
                 * Three things are never rewritten.
                 *
                 * The unsubscribe placeholder, because routing an opt-out
                 * through a click tracker means a redirect between somebody
                 * asking to leave and leaving — one more thing that can fail
                 * at the moment it must not. `mailto:`/`tel:`, because there
                 * is nothing to redirect to. And anything already pointing at
                 * the tracker, so preparing twice is idempotent.
                 */
                if (str_contains($url, '{{') || ! preg_match('#^https?://#i', $url) || str_contains($url, '/newsletter/click/')) {
                    return $m[0];
                }

                $link = self::link($campaign, $url);

                return '<a'.$m[1].'href='.$m[2].self::url('api.v1.newsletter.click', ['link' => $link->id]).$m[2];
            },
            $html,
        ) ?? $html;

        /*
         * The pixel goes last, immediately before `</body>`.
         *
         * At the top it is fetched before the message renders, which some
         * clients do while merely *previewing* — inflating opens for people
         * who never opened anything. At the bottom it is at least in the part
         * a reader has scrolled to. It stays an estimate either way, which is
         * why the report says so.
         */
        $pixel = '<img src="'.self::url('api.v1.newsletter.open').'" width="1" height="1" alt="" '
            .'style="display:block;width:1px;height:1px;border:0;" />';

        return str_contains($html, '</body>')
            ? str_replace('</body>', $pixel.'</body>', $html)
            : $html.$pixel;
    }

    /**
     * A tracking URL, generated from the route table.
     *
     * **On the API's own origin, not the site's.** Both of these are API
     * endpoints — one returns a GIF, the other a redirect — and neither
     * exists on the frontend, so building them from `frontend_url` produced a
     * pixel and a set of links that answered 404 on every campaign ever sent.
     * Opens could never be recorded, which is how it was found; the worse half
     * is that **every tracked link in a delivered message was a 404 for the
     * reader**. Measured rather than reasoned about: the frontend answers 404
     * for `/newsletter/open/…` and the API answers 200.
     *
     * `route()` rather than a concatenated path, because the prefix is
     * `/api/v1` and a hand-built string is one refactor away from the same
     * class of bug. The names carry the group's own `api.v1.` prefix, and a
     * rename would throw here rather than silently emit a broken URL — the
     * test below fetches what this generates, so it fails in CI instead. The token is a per-recipient placeholder filled at send
     * time, so it goes through as a sentinel and is swapped back afterwards —
     * `route()` would percent-encode the braces.
     */
    private static function url(string $name, array $parameters = []): string
    {
        return str_replace(
            self::TOKEN,
            '{{token}}',
            route($name, ['token' => self::TOKEN, ...$parameters]),
        );
    }

    /**
     * The link row for a URL, created once per campaign.
     *
     * Hashed because the column is 2048 characters and MySQL cannot index
     * that, and because two identical links in one campaign are one link —
     * otherwise a "read more" appearing in both the header and the footer
     * reports as two links with half the clicks each.
     */
    private static function link(NewsletterCampaign $campaign, string $url): NewsletterLink
    {
        return NewsletterLink::firstOrCreate(
            ['newsletter_campaign_id' => $campaign->id, 'hash' => sha1($url)],
            ['url' => mb_substr($url, 0, 2040), 'label' => self::label($url)],
        );
    }

    /** A readable name for the report, derived from the path. */
    private static function label(string $url): string
    {
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');

        if ($path === '') {
            return (string) parse_url($url, PHP_URL_HOST);
        }

        return mb_substr(ucfirst(str_replace('-', ' ', basename($path))), 0, 190);
    }

    /**
     * Tracking can be switched off wholesale.
     *
     * Not a nicety: a pixel and rewritten links are personal-data collection,
     * and a client who decides against it needs a switch rather than a
     * developer. With it off the links stay as written and no pixel is added,
     * so opens and clicks are simply absent from the report rather than zero —
     * a zero would read as "nobody opened it".
     */
    public static function enabled(): bool
    {
        return Setting::get('newsletter_tracking_enabled') !== '0';
    }
}
