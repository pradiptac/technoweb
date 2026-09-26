<?php

namespace App\Support\WordPress\Steps;

use App\Support\HtmlSanitiser;
use App\Support\WordPress\Context;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * One kind of thing the importer brings across.
 *
 * `plan()` decides, and writes nothing; `write()` does what `plan()` decided.
 * The analysis runs `plan()` over every record and the commit runs both, one
 * record at a time — so the preview's counts are the commit's counts, the
 * rule `CatalogueImport::plan()` keeps for the same reason.
 *
 * The helpers here are the conversions every WordPress record needs: the
 * title and body out of `{raw, rendered}`, a slug WordPress may have stored
 * percent-encoded, a date from `*_gmt`, a status.
 */
abstract class Step
{
    /** A short key, used in the report and the commit cursor. */
    abstract public function key(): string;

    /** The heading the review shows. */
    abstract public function label(): string;

    /** Which of `WordPressImport::SECTIONS` asks for this step. */
    abstract public function section(): string;

    /** @param  array<string, mixed>  $record */
    abstract public function plan(Context $ctx, array $record): Outcome;

    /** @param  array<string, mixed>  $record */
    abstract public function write(Context $ctx, array $record, Outcome $outcome): void;

    /**
     * The map's source type for this step's records. In a dry run the
     * importer marks each record it plans to write under it, so later steps
     * can see it is coming (`ImportMap::plan()`).
     */
    public function mapType(): ?string
    {
        return null;
    }

    /** The harvest collection the step reads. */
    public function collection(): string
    {
        return $this->key();
    }

    public function applies(Context $ctx): bool
    {
        return $ctx->import->wants($this->section());
    }

    /** @return iterable<array<string, mixed>> */
    public function records(Context $ctx): iterable
    {
        return Harvest::read($ctx->import, $this->collection());
    }

    /**
     * The attachment ids and upload URLs a record would bring into the media
     * library — what the dry run counts, since it never calls `write()`.
     *
     * @param  array<string, mixed>  $record
     * @return list<int|string>
     */
    public function media(Context $ctx, array $record): array
    {
        return [];
    }

    /** @return list<string> the old site's upload URLs an HTML body shows */
    protected static function bodyUploads(Context $ctx, string $html): array
    {
        preg_match_all('/<img\b[^>]*\bsrc="([^"]+)"/i', $html, $m);

        return array_values(array_unique(array_map(
            fn ($src) => self::originalUpload(html_entity_decode($src, ENT_QUOTES)),
            array_filter($m[1], fn ($src) => self::isSiteUpload($ctx, html_entity_decode($src, ENT_QUOTES))),
        )));
    }

    /** Runs once after the last record, in the commit only. */
    public function finish(Context $ctx): void {}

    // ── conversions ────────────────────────────────────────────────────

    /** @param  mixed  $field  a WordPress `{raw, rendered}` pair, or a string */
    protected static function raw(mixed $field): string
    {
        if (is_array($field)) {
            $field = $field['raw'] ?? $field['rendered'] ?? '';
        }

        return trim(html_entity_decode((string) $field, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    protected static function rendered(mixed $field): string
    {
        return is_array($field) ? (string) ($field['rendered'] ?? $field['raw'] ?? '') : (string) $field;
    }

    /** Plain text from markup, one line. */
    protected static function text(mixed $field, int $limit = 0): string
    {
        $text = HtmlSanitiser::toText(self::rendered($field));

        return $limit > 0 ? Str::limit($text, $limit - 1, '…') : $text;
    }

    /**
     * WordPress stores a non-ASCII slug percent-encoded (`%e0%a4%95…`). Kept
     * as it is when it is already a slug this site accepts — the old URL then
     * needs no redirect at all — and transliterated otherwise.
     */
    protected static function slug(?string $wpSlug, string $fallback): string
    {
        $decoded = rawurldecode((string) $wpSlug);

        if (preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $decoded)) {
            return $decoded;
        }

        $slug = Str::slug($decoded !== '' ? $decoded : $fallback);

        return $slug !== '' ? $slug : (Str::slug($fallback) ?: 'imported');
    }

    /** A `*_gmt` timestamp as a moment, or null for WordPress's zero date. */
    protected static function date(mixed $gmt): ?CarbonImmutable
    {
        $value = (string) $gmt;

        if ($value === '' || str_starts_with($value, '0000')) {
            return null;
        }

        return CarbonImmutable::parse($value, 'UTC')->setTimezone(config('app.timezone'));
    }

    /**
     * A body brought across: every `<img>` pointing at the old site's
     * uploads re-homed in the media library (so the page does not depend on
     * the old site staying up), `srcset` dropped (it names sizes the library
     * does not have), then the sanitiser — the same one a body typed in the
     * console goes through. Links to other pages are rewritten later, by the
     * links step, once every page exists.
     */
    protected static function body(Context $ctx, string $html, string $label): ?string
    {
        if (trim($html) === '') {
            return null;
        }

        $html = (string) preg_replace('/\s(srcset|sizes)="[^"]*"/i', '', $html);

        $html = (string) preg_replace_callback('/(<img\b[^>]*\bsrc=")([^"]+)(")/i', function (array $m) use ($ctx, $label) {
            $src = html_entity_decode($m[2], ENT_QUOTES);

            if (! self::isSiteUpload($ctx, $src)) {
                return $m[0];
            }

            $path = $ctx->media(self::originalUpload($src), $label);

            return $path === null ? $m[0] : $m[1].e(Context::mediaUrl($path)).$m[3];
        }, $html);

        return HtmlSanitiser::clean($html);
    }

    /** Whether a URL is a file in the old site's uploads directory. */
    protected static function isSiteUpload(Context $ctx, string $url): bool
    {
        $site = (string) parse_url((string) ($ctx->site()['url'] ?? $ctx->import->site_url), PHP_URL_HOST);
        $host = (string) parse_url($url, PHP_URL_HOST);

        return $host !== '' && strcasecmp(preg_replace('/^www\./i', '', $host), preg_replace('/^www\./i', '', $site)) === 0
            && str_contains($url, '/wp-content/uploads/');
    }

    /** `photo-1024x768.jpg` → `photo.jpg`: the original rather than a resized copy. */
    protected static function originalUpload(string $url): string
    {
        return (string) preg_replace('/-\d+x\d+(\.[a-z0-9]+)(\?.*)?$/i', '$1', $url);
    }

    /** Shortcodes left in a body that nothing here understands, by name. */
    protected static function shortcodes(string $raw): array
    {
        preg_match_all('/\[([a-z][a-z0-9_-]*)[\s\]]/i', $raw, $m);

        return array_values(array_unique(array_map('strtolower', $m[1])));
    }

    /** Which page builder, if any, laid this page out. */
    protected static function builder(array $record): ?string
    {
        $raw = self::raw($record['content'] ?? '');
        $meta = (array) ($record['meta'] ?? []);

        return match (true) {
            isset($meta['_elementor_data']) || isset($meta['_elementor_edit_mode']) || str_contains($raw, 'elementor') => 'Elementor',
            str_contains($raw, '[et_pb_') => 'Divi',
            str_contains($raw, '[vc_row') => 'WPBakery',
            str_contains($raw, '<!-- wp:kadence/') || str_contains($raw, '<!-- wp:generateblocks/') || str_contains($raw, '<!-- wp:uagb/') => 'a block plugin',
            default => null,
        };
    }
}
