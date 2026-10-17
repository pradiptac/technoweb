<?php

namespace App\Support\Health;

use App\Models\HealthLink;
use App\Support\MediaMeta;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Every check on one record (docs/health.md "The checks"). Reads only; the
 * one write is the link cache — a URL the record links to is entered in
 * `health_links` so the checker probes it, and the record's refs are
 * replaced so a link that dies later can find who links to it.
 */
final class Checker
{
    private const VAGUE = ['click here', 'here', 'read more', 'more', 'learn more', 'this link', 'link'];

    /** @return list<array{check: string, severity: string, field: string, detail: array}> */
    public static function run(Model $model): array
    {
        $out = [];
        $add = function (string $check, string $field, array $detail = []) use (&$out) {
            $out[] = ['check' => $check, 'severity' => Findings::CHECKS[$check][1], 'field' => $field, 'detail' => $detail];
        };

        self::stale($model, $add);

        if ($model->getMorphClass() === 'certification') {
            return $out;
        }

        $content = Content::of($model);
        self::links($model, $content, $add);
        self::accessibility($content, $add);

        return $out;
    }

    private static function stale(Model $model, callable $add): void
    {
        if (! Kinds::isPublished($model)) {
            return;
        }

        $alias = $model->getMorphClass();
        $months = HealthSettings::staleMonths($alias);
        $updated = $model->getAttribute('updated_at');

        $past = $alias === 'event' && method_exists($model, 'isPast') && $model->isPast();
        if ($months > 0 && $updated !== null && ! $past && $updated->lt(now()->subMonths($months))) {
            $add('stale', 'record', ['months' => (int) $updated->diffInMonths(now())]);
        }

        match ($alias) {
            'event' => method_exists($model, 'isPast') && $model->isPast() && $model->getAttribute('is_featured')
                ? $add('event_past_featured', 'record') : null,
            'job_opening' => ($closes = $model->getAttribute('closes_at')) !== null && $closes->lt(now()->startOfDay())
                ? $add('vacancy_closed', 'record') : null,
            'certification' => ($until = $model->getAttribute('valid_until')) !== null && $until->lt(now()->startOfDay())
                ? $add('certification_expired', 'record') : null,
            default => null,
        };
    }

    private static function links(Model $model, Content $content, callable $add): void
    {
        $refs = [];

        foreach ($content->links as $link) {
            $target = LinkTarget::classify($link['href']);

            if ($target === null) {
                continue;
            }

            if ($target['kind'] === 'anchor') {
                if (! in_array($target['value'], $content->anchors, true)) {
                    $add('link_anchor_missing', $link['field'], ['anchor' => $target['value']]);
                }

                continue;
            }

            if ($target['kind'] === 'internal') {
                $judged = LinkTarget::judge($target['value']);

                if ($judged['state'] === 'dead') {
                    $add('link_internal_dead', $link['field'], ['url' => $target['value']]);
                } elseif ($judged['state'] === 'redirect') {
                    $add('link_redirected', $link['field'], ['url' => $target['value'], 'to' => $judged['to']]);
                } elseif ($judged['state'] === 'ask') {
                    $row = self::linkRow($target['value'], internal: true);
                    $refs[] = $row->id;
                    if ($row->isDead()) {
                        $add('link_internal_dead', $link['field'], ['url' => $target['value']]);
                    }
                }

                continue;
            }

            if (! HealthSettings::externalOn()) {
                continue;
            }

            $row = self::linkRow($target['value'], internal: false);
            $refs[] = $row->id;
            if ($row->isDead()) {
                $add('link_external_dead', $link['field'], ['url' => $target['value'], 'status' => $row->status ?? 'no answer']);
            }
        }

        self::replaceRefs($model, array_values(array_unique($refs)));
    }

    private static function accessibility(Content $content, callable $add): void
    {
        foreach ($content->pictures as $picture) {
            if (blank(MediaMeta::alt($picture['path']))) {
                $add('image_no_alt', $picture['field'], ['path' => $picture['path']]);
            }
        }

        foreach ($content->bodyImages as $image) {
            if ($image['alt'] === null) {
                $add('image_no_alt', $image['field']);
            }
        }

        foreach ($content->headings as $h) {
            // A section's own heading is the h2 above its body; the record's title is the h1 above a plain body.
            $previous = str_starts_with($h['field'], 'blocks.') ? 2 : 1;
            foreach ($h['levels'] as $level) {
                if ($level > $previous + 1) {
                    $add('heading_jump', $h['field'], ['from' => $previous, 'to' => $level]);
                    break;
                }
                $previous = $level;
            }
        }

        foreach ($content->links as $link) {
            $text = mb_strtolower(trim($link['text']));
            if ($text !== '' && (in_array($text, self::VAGUE, true) || $text === mb_strtolower(trim($link['href'])))) {
                $add('link_text_vague', $link['field'], ['text' => mb_substr($link['text'], 0, 120)]);
            }
        }

        foreach ($content->emptyLinks as $field) {
            $add('link_empty', $field);
        }

        foreach ($content->tablesWithoutHeader as $field) {
            $add('table_no_header', $field);
        }

        foreach ($content->videos as $video) {
            if (! $video['titled']) {
                $add('video_no_title', $video['field']);
            }
        }
    }

    private static function linkRow(string $url, bool $internal): HealthLink
    {
        return HealthLink::firstOrCreate(
            ['url_hash' => HealthLink::hashOf($url)],
            ['url' => $url, 'host' => $internal ? 'internal' : strtolower((string) parse_url($url, PHP_URL_HOST)),
                'internal' => $internal, 'result' => 'pending', 'next_check_at' => now()],
        );
    }

    /** @param  list<int>  $linkIds */
    private static function replaceRefs(Model $model, array $linkIds): void
    {
        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();

        DB::table('health_link_refs')->where('subject_type', $alias)->where('subject_id', $id)->delete();
        DB::table('health_link_refs')->insert(array_map(
            fn (int $link) => ['health_link_id' => $link, 'subject_type' => $alias, 'subject_id' => $id],
            $linkIds,
        ));
    }
}
