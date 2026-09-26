<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Page;
use App\Support\ReservedSlugs;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * Custom post types, as content types here — a "Portfolio" type becomes a
 * content type whose entries live at `/portfolio/{slug}`.
 *
 * The address is WordPress's type slug unless the review chose another, and
 * it is held to the rules the console's own form applies: it cannot be a
 * route the site already has (`ReservedSlugs`), a CMS page's slug or another
 * type's. A type whose address is taken is skipped and says so, and the
 * review offers a box to give it a free one; a type left blank there is not
 * imported at all.
 */
class ContentTypesStep extends Step
{
    public function key(): string
    {
        return 'content_types';
    }

    public function label(): string
    {
        return 'Content types';
    }

    public function section(): string
    {
        return 'custom';
    }

    public function mapType(): ?string
    {
        return 'type';
    }

    public function records(Context $ctx): iterable
    {
        return array_map(fn (array $type) => $type + ['id' => $type['slug']], array_values((array) ($ctx->site()['types'] ?? [])));
    }

    /** The address a WordPress type is imported at, or '' when the review left it out. */
    public static function slugFor(Context $ctx, string $wpSlug): string
    {
        $chosen = ($ctx->decision('type_slugs') ?? [])[$wpSlug] ?? null;

        if (is_string($chosen)) {
            return strtolower(trim($chosen));
        }

        return Str::slug(str_replace('_', '-', $wpSlug));
    }

    /** Why an address cannot be used for a new type, or null. */
    public static function slugRefusal(string $slug, ?int $ignoreType = null): ?string
    {
        return match (true) {
            ! preg_match('/^[a-z][a-z0-9-]{0,59}$/', $slug) => 'must start with a letter and use only lowercase letters, numbers and hyphens',
            ReservedSlugs::reserved($slug) => 'belongs to a part of the site that already exists',
            Page::query()->where('slug', $slug)->exists() => 'is a page\'s address',
            ContentType::query()->where('slug', $slug)->when($ignoreType, fn ($q) => $q->whereKeyNot($ignoreType))->exists() => 'is another content type\'s address',
            default => null,
        };
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = trim((string) $record['name']) ?: $record['slug'];
        $existing = $ctx->map->model('type', $record['slug'], ContentType::class);

        if ($existing !== null) {
            return Outcome::update($name, ['existing' => $existing->id]);
        }

        $slug = self::slugFor($ctx, $record['slug']);

        if ($slug === '') {
            return Outcome::skip($name, 'Left out in the review.');
        }

        if ($why = self::slugRefusal($slug)) {
            return Outcome::skip($name, "Its address /{$slug} {$why}; give it another in the review.");
        }

        return Outcome::create($name, ['slug' => $slug]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $type = $outcome->data['existing'] ?? null
            ? ContentType::query()->find($outcome->data['existing'])
            : null;

        if ($type === null) {
            $name = Str::limit($outcome->label, 100, '');
            $type = ContentType::query()->create([
                'name' => Str::singular($name),
                'plural' => $name,
                'slug' => $outcome->data['slug'],
                'has_body' => true,
                'has_image' => true,
                'archive_enabled' => true,
                'is_active' => true,
            ]);
        }

        $ctx->map->put('type', $record['slug'], $type);
    }
}
