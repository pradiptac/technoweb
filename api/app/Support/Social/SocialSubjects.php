<?php

namespace App\Support\Social;

use App\Enums\PublishStatus;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Event;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * What a social post can be about, and what each kind says about itself.
 * Aliases are the morph map's own; an entry counts only as a press release.
 */
class SocialSubjects
{
    public const ALIASES = ['blog_post', 'case_study', 'event', 'entry'];

    public const PRESET = 'newsroom_releases';

    public static function supports(Model $m): bool
    {
        if ($m instanceof Entry) {
            return ContentType::query()->whereKey($m->content_type_id)->value('preset') === self::PRESET;
        }

        return $m instanceof BlogPost || $m instanceof CaseStudy || $m instanceof Event;
    }

    /** Published, and for a post or entry, dated no later than now. */
    public static function isVisible(BlogPost|CaseStudy|Event|Entry $m): bool
    {
        if (! self::supports($m) || $m->status !== PublishStatus::Published) {
            return false;
        }

        return ! ($m instanceof BlogPost || $m instanceof Entry)
            || ($m->published_at !== null && $m->published_at->lte(now()));
    }

    public static function find(string $alias, int $id): ?Model
    {
        if (! in_array($alias, self::ALIASES, true)) {
            return null;
        }

        $class = Relation::getMorphedModel($alias);

        return $class === null ? null : $class::query()->find($id);
    }

    public static function title(BlogPost|CaseStudy|Event|Entry $m): string
    {
        return (string) $m->title;
    }

    public static function summary(BlogPost|CaseStudy|Event|Entry $m): string
    {
        $summary = trim((string) ($m->excerpt ?? $m->summary ?? ''));

        return $summary !== '' ? $summary : mb_substr(HtmlSanitiser::toText((string) $m->body), 0, 200);
    }

    public static function bodyText(BlogPost|CaseStudy|Event|Entry $m, int $words = 300): string
    {
        $all = preg_split('/\s+/u', HtmlSanitiser::toText((string) $m->body), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return implode(' ', array_slice($all, 0, $words));
    }

    public static function publicUrl(BlogPost|CaseStudy|Event|Entry $m): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$m->publicPath();
    }

    public static function adminPath(BlogPost|CaseStudy|Event|Entry $m): string
    {
        return match (true) {
            $m instanceof BlogPost => '/admin/blog/'.$m->id,
            $m instanceof CaseStudy => '/admin/case-studies/'.$m->id,
            default => $m->adminPath(), // Event and Entry know theirs
        };
    }

    public static function kindLabel(BlogPost|CaseStudy|Event|Entry $m): string
    {
        return match (true) {
            $m instanceof BlogPost => 'Blog post',
            $m instanceof CaseStudy => 'Case study',
            $m instanceof Event => 'Event',
            default => 'Press release',
        };
    }
}
