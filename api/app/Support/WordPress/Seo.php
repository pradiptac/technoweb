<?php

namespace App\Support\WordPress;

use App\Models\SeoMetadata;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Yoast's (or Rank Math's) metadata for a record, as this site's SEO
 * override — and only where it says something the site would not derive.
 *
 * Yoast publishes what it renders in `yoast_head_json`: a title built from a
 * template (`Post title - Old Site Name`), the description if one was
 * written, robots, the canonical and the share image. Copied blindly, every
 * imported page would carry the old site's name in its title and a canonical
 * pointing at the old domain — telling Google the real page is somewhere
 * else. So:
 *
 *  - the title is kept only when, with the site-name suffix taken off, it
 *    differs from the record's own title (an editor wrote it);
 *  - a canonical is kept only when it points off the old site entirely — a
 *    canonical to itself or a sibling page is re-derived here;
 *  - robots is kept only when it says `noindex` or `nofollow`;
 *  - the share image is brought into the media library.
 *
 * Rank Math, with its headless option on, exposes `rank_math_*` meta; read
 * the same way.
 */
final class Seo
{
    /**
     * @param  array<string, mixed>  $record
     * @return array<string, mixed> the override row's columns; empty when there is nothing worth keeping
     */
    public static function from(Context $ctx, array $record, string $ownTitle, string $label): array
    {
        $head = (array) ($record['yoast_head_json'] ?? []);
        $meta = (array) ($record['meta'] ?? []);
        $seo = [];

        $title = trim((string) ($head['title'] ?? $meta['rank_math_title'] ?? ''));
        $title = self::withoutSiteName($title, (string) ($ctx->site()['name'] ?? ''));

        if ($title !== '' && strcasecmp($title, $ownTitle) !== 0) {
            $seo['title'] = Str::limit($title, 250, '');
        }

        $description = trim(html_entity_decode((string) ($head['description'] ?? $meta['rank_math_description'] ?? ''), ENT_QUOTES));

        if ($description !== '') {
            $seo['description'] = Str::limit($description, 320, '');
        }

        $focus = trim((string) ($meta['_yoast_wpseo_focuskw'] ?? $meta['rank_math_focus_keyword'] ?? ''));

        if ($focus !== '') {
            $seo['focus_keyword'] = Str::limit(explode(',', $focus)[0], 190, '');
        }

        $robots = $head['robots'] ?? null;
        $index = is_array($robots) ? (string) ($robots['index'] ?? 'index') : 'index';
        $follow = is_array($robots) ? (string) ($robots['follow'] ?? 'follow') : 'follow';

        if ($index === 'noindex' || $follow === 'nofollow') {
            $seo['robots'] = "{$index}, {$follow}";
        }

        $canonical = (string) ($head['canonical'] ?? '');
        $siteHost = (string) parse_url((string) ($ctx->site()['url'] ?? $ctx->import->site_url), PHP_URL_HOST);

        if ($canonical !== '' && strcasecmp((string) parse_url($canonical, PHP_URL_HOST), $siteHost) !== 0) {
            $seo['canonical_url'] = Str::limit($canonical, 250, '');
        }

        $image = $head['og_image'][0]['url'] ?? null;

        if (is_string($image) && $image !== '' && ($path = $ctx->media($image, $label)) !== null && ! $ctx->dryRun) {
            $seo['og_image_path'] = $path;
        }

        return $seo;
    }

    /** @param  array<string, mixed>  $seo */
    public static function save(Model $model, array $seo): void
    {
        if ($seo === [] || ! method_exists($model, 'seo')) {
            return;
        }

        /** @var SeoMetadata|null $existing */
        $existing = $model->seo()->first();

        $existing !== null ? $existing->update($seo) : $model->seo()->create($seo);
    }

    private static function withoutSiteName(string $title, string $site): string
    {
        $title = trim(html_entity_decode($title, ENT_QUOTES));

        if ($site === '') {
            return $title;
        }

        foreach ([' - ', ' | ', ' – ', ' — ', ' · ', ' » '] as $sep) {
            if (str_ends_with(mb_strtolower($title), mb_strtolower($sep.$site))) {
                return trim(mb_substr($title, 0, mb_strlen($title) - mb_strlen($sep.$site)));
            }
        }

        return $title;
    }
}
