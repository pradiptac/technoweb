<?php

namespace App\Support;

use App\Jobs\PingIndexNow;
use App\Models\Setting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * IndexNow — telling the search engines that a page changed, when it changes.
 *
 * Publishing a post or renaming a product updates the cache tag and the
 * sitemap, and then waits for a crawl. IndexNow (Bing, Yandex, Seznam,
 * Naver; Bing's index feeds Copilot and ChatGPT search) is one `POST` per
 * changed URL, and this is where it is sent from: `HasSeo` calls `record()`
 * from every indexable model's `saved` and `deleted` hooks, and a queued
 * `PingIndexNow` job carries the URLs out — off the request path, the way
 * mail is, because a hop to an outside API is not something a console save
 * should wait on. Google has no equivalent; the sitemap's `lastmod` is its
 * half. (`docs/seo-audit-2026-09-18.md`, F6.)
 *
 * **Off by default, and it has to be.** `FRONTEND_URL` is pinned to the
 * production domain on every machine, so a ping from a development laptop
 * would name live URLs for pages that do not exist there yet. Switch
 * `indexnow_enabled` on at launch, in the console. The key is minted on
 * first use and published as a public setting, because the engines verify
 * a ping by fetching `{keyLocation}` and expecting the key back — the
 * frontend serves it at `/indexnow/{key}.txt` from that setting. It is not
 * a secret: the protocol's own key file is world-readable by design.
 *
 * `record()` decides *whether* a save is worth a ping. A draft being edited
 * is not; a record that is published, or that has just stopped being
 * published, is — the second so the engine recrawls and finds the redirect
 * or the 404. A model with no `status` column (an industry, a category) is
 * always live and always pings.
 */
class IndexNow
{
    public const ENDPOINT = 'https://api.indexnow.org/indexnow';

    public static function enabled(): bool
    {
        return (bool) Setting::get('indexnow_enabled', false);
    }

    /** The key, minted the first time anything asks for it. */
    public static function key(): string
    {
        $key = (string) Setting::get('indexnow_key', '');

        if ($key !== '') {
            return $key;
        }

        $key = Str::lower(Str::random(32));
        Setting::query()->updateOrCreate(
            ['key' => 'indexnow_key'],
            ['group' => 'indexnow', 'value' => $key, 'type' => 'string'],
        );
        Setting::flushCache();

        return $key;
    }

    public static function keyLocation(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/indexnow/'.self::key().'.txt';
    }

    /** A record was saved or deleted: ping its public URL if that is worth doing. */
    public static function record(Model $model, bool $deleted = false): void
    {
        if (! self::enabled() || ! method_exists($model, 'publicPath')) {
            return;
        }

        $status = $model->getAttribute('status');
        $published = $status === null || (string) (is_object($status) ? $status->value : $status) === 'published';
        $statusChanged = $status !== null && $model->wasChanged('status');

        if (! $deleted && ! $published && ! $statusChanged) {
            return;
        }

        self::notify([$model->publicPath()]);
    }

    /** @param  array<int, string>  $paths  Site-relative paths, `/solutions/networking`. */
    public static function notify(array $paths): void
    {
        if (! self::enabled() || $paths === []) {
            return;
        }

        $base = rtrim((string) config('app.frontend_url'), '/');
        $urls = array_values(array_unique(array_map(fn ($p) => $base.'/'.ltrim($p, '/'), $paths)));

        PingIndexNow::dispatch($urls);
    }
}
