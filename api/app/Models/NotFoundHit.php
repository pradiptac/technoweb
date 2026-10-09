<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * An address a visitor asked for that this site does not have.
 *
 * One row per distinct address, not per request. See the migration for why, and
 * `docs/seo.md` "Missing pages" for what is deliberately never recorded.
 */
class NotFoundHit extends Model
{
    /** Longer than this and the address is cut, not refused. */
    private const MAX = 512;

    /**
     * Areas that are not public pages. A 404 inside any of these is the
     * console, the portal or the API answering for itself, and an address under
     * them is never one an SEO manager could usefully redirect.
     */
    private const PRIVATE_AREAS = ['/admin', '/portal', '/api', '/_next'];

    /**
     * Pages a secret addresses. The path *is* the credential — an order's
     * number, a registration's token, an unsubscribe link — so a 404 on one is
     * a mistyped or expired secret, and storing it would put a working-looking
     * credential into a list read on another screen.
     */
    private const SECRET_PREFIXES = [
        '/order/', '/visit/', '/meeting/', '/events/registration/', '/ticket-survey/',
        '/preview/', '/newsletter/unsubscribe/', '/store/notify/cancel/',
        '/store/wishlist/stop/', '/store/basket/restore/',
    ];

    /**
     * What scanners ask every server for. None of it was ever a page of this
     * site, so listing it would bury the addresses worth a redirect under a
     * hundred guesses at `wp-login.php`.
     */
    private const NOISE = ['.php', '.env', '.git', '/wp-', '/cgi-bin', '.asp', '.jsp'];

    private const STATIC_FILE = '~\.(js|css|map|png|jpe?g|gif|svg|ico|webp|woff2?|txt|xml|json)$~i';

    protected $fillable = [
        'path', 'path_hash', 'hits', 'referrer', 'first_seen_at', 'last_seen_at', 'ignored_at',
    ];

    protected function casts(): array
    {
        return [
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'ignored_at' => 'datetime',
        ];
    }

    /**
     * Still waiting for a decision: not ignored, and no active redirect starts
     * at this address.
     *
     * The redirect half is a subquery rather than a flag on the row, so making
     * a redirect takes the address off the list by itself — and deactivating
     * that redirect puts it back. A second flag would be a second answer to
     * "is this handled", free to disagree with the redirect table the proxy
     * actually reads.
     */
    public function scopeLive(Builder $query): Builder
    {
        return $query->whereNull('ignored_at')->whereNotExists(
            fn ($q) => $q->select(DB::raw(1))
                ->from('redirects')
                ->whereColumn('redirects.from_path', 'not_found_hits.path')
                ->where('redirects.is_active', true),
        );
    }

    public function scopeIgnored(Builder $query): Builder
    {
        return $query->whereNotNull('ignored_at');
    }

    /**
     * Record one request for an address that does not exist.
     *
     * Never throws: the caller is the 404 page of a site that is already
     * telling somebody the page is missing, and a monitor that can fail turns
     * one missing page into two.
     *
     * An upsert on the unique hash rather than a read-then-write, the reasoning
     * `ClientError::report()` gives: a crawler asking for one dead address in a
     * burst is the normal case, and the read-then-write version races exactly
     * there. On a repeat the count goes up and `last_seen_at` moves;
     * `first_seen_at` and `ignored_at` are left alone — "when did this start"
     * is a question an update would destroy, and an address somebody ignored
     * must stay ignored while it goes on being asked for.
     */
    public static function report(string $path, ?string $referrer): void
    {
        try {
            $path = self::normalise($path);

            if ($path === null || self::isNotRecorded($path)) {
                return;
            }

            if (Redirect::query()->where('from_path', $path)->where('is_active', true)->exists()) {
                return;
            }

            $referrer = self::cleanReferrer($referrer);
            $now = now();

            $update = [
                'hits' => DB::raw('hits + 1'),
                'last_seen_at' => $now,
                'updated_at' => $now,
            ];

            // A bare column name compiles to the driver's own "take the
            // incoming value" form (see ClientError::report()). Only when a new
            // referrer was given: a request that arrives with none must not
            // erase the one that told us where the link lives.
            if ($referrer !== null) {
                $update[] = 'referrer';
            }

            static::query()->upsert(
                [[
                    'path' => $path,
                    'path_hash' => hash('sha256', $path),
                    'hits' => 1,
                    'referrer' => $referrer,
                    'first_seen_at' => $now,
                    'last_seen_at' => $now,
                    'ignored_at' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]],
                ['path_hash'],
                $update,
            );
        } catch (Throwable $e) {
            logger()->warning('Could not record a missing page.', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Only the path: no host, no query string, a leading slash, no trailing one.
     * A caller chose these strings, and an absolute URL stored here would be a
     * link somebody else chose, read on an admin screen.
     */
    private static function normalise(string $value): ?string
    {
        $path = parse_url(trim($value), PHP_URL_PATH);

        if (! is_string($path) || ! str_starts_with($path, '/')) {
            return null;
        }

        $path = rtrim($path, '/');

        return $path === '' ? null : Str::limit($path, self::MAX, '');
    }

    private static function isNotRecorded(string $path): bool
    {
        $lower = strtolower($path);

        foreach (self::PRIVATE_AREAS as $area) {
            if ($lower === $area || str_starts_with($lower, $area.'/')) {
                return true;
            }
        }

        foreach (self::SECRET_PREFIXES as $prefix) {
            if (str_starts_with($lower, $prefix)) {
                return true;
            }
        }

        foreach (self::NOISE as $needle) {
            if (str_contains($lower, $needle)) {
                return true;
            }
        }

        return preg_match(self::STATIC_FILE, $lower) === 1;
    }

    /** Origin and path of an http(s) referrer; the query string is somebody else's session. */
    private static function cleanReferrer(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        $parts = parse_url(trim($value));

        if (! is_array($parts) || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host'])) {
            return null;
        }

        $clean = strtolower($parts['scheme']).'://'.strtolower($parts['host'])
            .(isset($parts['port']) ? ':'.$parts['port'] : '')
            .($parts['path'] ?? '');

        return Str::limit($clean, self::MAX, '');
    }
}
