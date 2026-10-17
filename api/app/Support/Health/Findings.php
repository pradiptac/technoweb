<?php

namespace App\Support\Health;

use App\Models\HealthFinding;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Storing one record's findings, and the words for them (docs/health.md).
 * A recheck replaces the set: a finding that came back keeps when it was
 * first seen and whether it was ignored; a finding that did not is deleted —
 * there is no "fixed" flag. The fingerprint includes the detail, so an
 * ignored finding whose URL or text changed is a new, un-ignored one.
 */
final class Findings
{
    /** check => [group, severity] */
    public const CHECKS = [
        'link_internal_dead' => ['links', 'error'],
        'link_external_dead' => ['links', 'error'],
        'link_redirected' => ['links', 'notice'],
        'link_anchor_missing' => ['links', 'warning'],
        'stale' => ['stale', 'warning'],
        'event_past_featured' => ['stale', 'warning'],
        'vacancy_closed' => ['stale', 'warning'],
        'certification_expired' => ['stale', 'warning'],
        'image_no_alt' => ['accessibility', 'error'],
        'heading_jump' => ['accessibility', 'warning'],
        'link_text_vague' => ['accessibility', 'warning'],
        'link_empty' => ['accessibility', 'warning'],
        'table_no_header' => ['accessibility', 'warning'],
        'video_no_title' => ['accessibility', 'warning'],
    ];

    /** Detail keys that drift while the problem stays the same; stored, never part of a finding's identity. */
    public const VOLATILE = ['months', 'status'];

    public const GROUPS = ['links' => 'Links', 'stale' => 'Out of date', 'accessibility' => 'Accessibility'];

    public const SEVERITIES = ['error' => 'Error', 'warning' => 'Warning', 'notice' => 'Notice'];

    /** @param  list<array{check: string, severity: string, field: string, detail: array}>  $findings */
    public static function replace(Model $model, array $findings): void
    {
        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();
        $published = Kinds::isPublished($model);
        $now = now();

        DB::transaction(function () use ($findings, $alias, $id, $published, $now) {
            $keep = [];

            foreach ($findings as $f) {
                $detail = $f['detail'];
                ksort($detail);
                $identity = array_diff_key($detail, array_flip(self::VOLATILE));
                $fingerprint = sha1(implode('|', [$alias, $id, $f['check'], $f['field'], json_encode($identity)]));
                $keep[] = $fingerprint;

                $row = HealthFinding::firstOrNew(['fingerprint' => $fingerprint]);
                $row->fill([
                    'subject_type' => $alias, 'subject_id' => $id, 'subject_published' => $published,
                    'check' => $f['check'], 'severity' => $f['severity'], 'field' => $f['field'],
                    'detail' => $detail, 'last_seen_at' => $now,
                ]);
                $row->first_seen_at ??= $now;
                $row->save();
            }

            HealthFinding::query()->where('subject_type', $alias)->where('subject_id', $id)
                ->when($keep !== [], fn ($q) => $q->whereNotIn('fingerprint', $keep))
                ->delete();
        });
    }

    public static function forget(string $alias, int $id): void
    {
        HealthFinding::query()->where('subject_type', $alias)->where('subject_id', $id)->delete();
        DB::table('health_link_refs')->where('subject_type', $alias)->where('subject_id', $id)->delete();
    }

    /** The one sentence a row says. Every word is the API's. */
    public static function sentence(HealthFinding $f): string
    {
        $d = ($f->detail ?? []) + ['url' => '', 'to' => '', 'anchor' => '', 'months' => 0, 'from' => '', 'text' => ''];

        return match ($f->check) {
            'link_internal_dead' => "Links to {$d['url']}, which does not exist.",
            'link_external_dead' => "Links to {$d['url']}, which did not answer twice a week apart".(isset($d['status']) ? " ({$d['status']})." : '.'),
            'link_redirected' => "Links to {$d['url']}, which now redirects to {$d['to']}. Link to {$d['to']} directly.",
            'link_anchor_missing' => "Links to #{$d['anchor']}, which is not on this page.",
            'stale' => "Not edited for {$d['months']} months.",
            'event_past_featured' => 'This event has taken place and is still featured.',
            'vacancy_closed' => 'This vacancy is past its closing date and still published.',
            'certification_expired' => 'This certification has expired and is still published.',
            'image_no_alt' => isset($d['path']) ? "The picture {$d['path']} has no description for screen readers." : 'A picture in the text has no description for screen readers.',
            'heading_jump' => "A heading jumps from level {$d['from']} to level {$d['to']}.",
            'link_text_vague' => "A link says only \"{$d['text']}\". Say where it goes.",
            'link_empty' => 'A link has no words, so a screen reader cannot say where it goes.',
            'table_no_header' => 'A table has no header row.',
            'video_no_title' => 'A video has no heading or caption.',
            default => $f->check,
        };
    }

    public static function fieldLabel(string $field): string
    {
        if (preg_match('/^blocks\.(\d+)\./', $field, $m)) {
            return 'Section '.((int) $m[1] + 1);
        }

        return match (true) {
            $field === 'record' => 'The record',
            str_starts_with($field, 'images.') => 'Gallery picture',
            str_ends_with($field, 'image_path') => 'Cover picture',
            default => ucfirst(str_replace('_', ' ', $field)),
        };
    }

    /** The edit form's tab to open: `sections` for anything in the builder, else the form's first. */
    public static function tabFor(string $field): ?string
    {
        return str_starts_with($field, 'blocks.') ? 'sections' : null;
    }
}
