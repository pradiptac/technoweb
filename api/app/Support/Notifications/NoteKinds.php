<?php

namespace App\Support\Notifications;

use App\Models\Entry;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * The records a team note can hang off (C2) — the kinds page history knows,
 * read from `Revisions`, never a second list. Their console addresses live
 * here because no other class names them; `MentionsTest` fails a kind added to
 * `Revisions` without one.
 */
final class NoteKinds
{
    private const PATHS = [
        'page' => '/admin/pages',
        'saved_section' => '/admin/pages/library',
        'blog_post' => '/admin/blog',
        'knowledge_article' => '/admin/knowledge-base',
        'case_study' => '/admin/case-studies',
        'solution' => '/admin/solutions',
        'service' => '/admin/services',
        'product' => '/admin/products',
        'store_product' => '/admin/store/products',
        'event' => '/admin/events',
        'tender' => '/admin/tenders',
        'job_opening' => '/admin/jobs',
        'entry' => '/admin/content',
        'landing_page' => '/admin/landing-pages',
    ];

    /** @return list<string> */
    public static function aliases(): array
    {
        return Revisions::aliases();
    }

    public static function find(string $alias, int $id): ?Model
    {
        $class = in_array($alias, self::aliases(), true) ? Relation::getMorphedModel($alias) : null;

        return $class === null ? null : $class::query()->find($id);
    }

    public static function title(Model $m): string
    {
        return (string) ($m->getAttribute('title') ?? $m->getAttribute('name') ?? '#'.$m->getKey());
    }

    public static function adminPath(string $alias, Model $m): string
    {
        return $m instanceof Entry ? $m->adminPath() : self::PATHS[$alias].'/'.$m->getKey();
    }

    public static function indexPath(string $alias): string
    {
        return self::PATHS[$alias];
    }
}
