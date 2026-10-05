<?php

namespace App\Support\WordPress\Steps;

use App\Models\WordPressImportMapping;
use App\Support\WordPress\Context;
use App\Support\WordPress\ImportMap;
use App\Support\WordPress\Outcome;
use Illuminate\Database\Eloquent\Model;

/**
 * Links between imported pages, pointed at their new addresses.
 *
 * A post that linked to `https://old.example/services/cabling/` would
 * otherwise send every reader through a redirect (or to the old site, if it
 * is switched off). Once every record exists, this pass reads the map —
 * every imported record's old address beside its new one — and rewrites
 * each `href` in an imported body that names an old address, keeping any
 * `#fragment`. A link to a file in the old uploads directory (a PDF, say)
 * brings the file into the media library and points at it there.
 *
 * A page laid out as builder sections (0.109.0) carries its words in each
 * section's `body` and its links in buttons' and features' `href`s as well
 * as its own body, and those are rewritten the same way.
 *
 * It runs in the commit only, after the last record step; in the review it
 * has nothing to count.
 */
class LinksStep extends Step
{
    /** The records whose markup is rewritten, and the column that holds it. */
    private const BODIES = ['blog_post' => 'body', 'page' => 'body', 'entry' => 'body', 'store_product' => 'description'];

    public function key(): string
    {
        return 'links';
    }

    public function label(): string
    {
        return 'Links between pages';
    }

    public function section(): string
    {
        return 'content';
    }

    public function applies(Context $ctx): bool
    {
        return true;
    }

    public function records(Context $ctx): iterable
    {
        return [];
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        return Outcome::delegated('');
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void {}

    public function finish(Context $ctx): void
    {
        $paths = self::paths($ctx);

        WordPressImportMapping::query()
            ->where('site', $ctx->import->site)
            ->whereIn('target_type', array_keys(self::BODIES))
            ->lazyById(200)
            ->each(function (WordPressImportMapping $row) use ($ctx, $paths) {
                $model = ImportMap::resolve($row);
                $column = self::BODIES[$row->target_type];

                if ($model === null) {
                    return;
                }

                $label = (string) $model->getAttribute('title') ?: (string) $model->getAttribute('name');
                $changed = false;

                if (is_string($html = $model->getAttribute($column)) && $html !== '') {
                    $rewritten = $this->rewrite($ctx, $html, $paths, $label);
                    if ($rewritten !== $html) {
                        $model->setAttribute($column, $rewritten);
                        $changed = true;
                    }
                }

                if ($row->target_type === 'page' && is_array($blocks = $model->getAttribute('blocks')) && $blocks !== []) {
                    $rewritten = $this->rewriteSections($ctx, $blocks, $paths, $label);
                    if ($rewritten !== $blocks) {
                        $model->setAttribute('blocks', $rewritten);
                        $changed = true;
                    }
                }

                if ($changed) {
                    $model->save();
                    $ctx->report->count($this->key(), 'update');
                }
            });
    }

    /**
     * Every imported record's old path → its public path here.
     *
     * @return array<string, string>
     */
    public static function paths(Context $ctx): array
    {
        return $ctx->memo('old-paths', function () use ($ctx) {
            $paths = [];

            foreach ($ctx->map->withUrls() as $row) {
                $old = self::normalise((string) $row->source_url);
                $model = ImportMap::resolve($row);

                if ($old !== null && $model instanceof Model && method_exists($model, 'publicPath')) {
                    $paths[$old] = $model->publicPath();
                }
            }

            return $paths;
        });
    }

    /**
     * An old-site URL or path as a comparable key: a path with a leading
     * slash and no trailing one — or, for a site on WordPress's "Plain"
     * permalinks, the one query parameter that names the record, as
     * `/?p=62`, `/?page_id=5`, `/?product=cap`, `/?cat=3`. That shape is what
     * the proxy looks up on the home path (`proxy.ts`, `wordpressKeys`), with
     * the value decoded on both sides.
     */
    public static function normalise(string $url): ?string
    {
        $path = '/'.trim((string) parse_url($url, PHP_URL_PATH), '/');
        $query = (string) parse_url($url, PHP_URL_QUERY);

        if (($path === '/' || $path === '/index.php') && $query !== '') {
            parse_str($query, $params);
            unset($params['post_type'], $params['preview']);

            foreach ($params as $key => $value) {
                if (is_string($value) && $value !== '' && preg_match('/^[a-z0-9_-]+$/i', (string) $key)) {
                    return '/?'.$key.'='.$value;
                }
            }

            return null;
        }

        return $path === '/' ? null : $path;
    }

    /**
     * A section list with every `body` rewritten as markup and every `href`
     * as a link, at any depth.
     *
     * @param  array<int|string, mixed>  $value
     * @param  array<string, string>  $paths
     * @return array<int|string, mixed>
     */
    private function rewriteSections(Context $ctx, array $value, array $paths, string $label): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->rewriteSections($ctx, $item, $paths, $label);
            } elseif ($key === 'body' && is_string($item) && $item !== '') {
                $value[$key] = $this->rewrite($ctx, $item, $paths, $label);
            } elseif ($key === 'href' && is_string($item) && $item !== '') {
                $value[$key] = html_entity_decode((string) preg_replace('/^href="|"$/', '', $this->rewrite($ctx, 'href="'.e($item).'"', $paths, $label)), ENT_QUOTES);
            }
        }

        return $value;
    }

    /** @param  array<string, string>  $paths */
    private function rewrite(Context $ctx, string $html, array $paths, string $label): string
    {
        $site = preg_replace('/^www\./i', '', (string) parse_url((string) ($ctx->site()['url'] ?? $ctx->import->site_url), PHP_URL_HOST));

        return (string) preg_replace_callback('/(\bhref=")([^"]+)(")/i', function (array $m) use ($ctx, $paths, $site, $label) {
            $href = html_entity_decode($m[2], ENT_QUOTES);
            $host = preg_replace('/^www\./i', '', (string) parse_url($href, PHP_URL_HOST));

            if ($host !== '' && strcasecmp($host, $site) !== 0) {
                return $m[0];
            }

            if (self::isSiteUpload($ctx, $href) && ($path = $ctx->media($href, $label)) !== null) {
                return $m[1].e(Context::mediaUrl($path)).$m[3];
            }

            $old = self::normalise($href);
            $fragment = (string) parse_url($href, PHP_URL_FRAGMENT);

            if ($old !== null && isset($paths[$old])) {
                return $m[1].e($paths[$old].($fragment !== '' ? '#'.$fragment : '')).$m[3];
            }

            return $m[0];
        }, $html);
    }
}
