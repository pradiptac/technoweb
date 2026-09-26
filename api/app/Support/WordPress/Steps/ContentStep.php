<?php

namespace App\Support\WordPress\Steps;

use App\Enums\PublishStatus;
use App\Support\WordPress\AcfValues;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Seo;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * What posts, pages and custom-post-type entries share: a title, a slug, a
 * status with a date, a body, SEO, ACF values — and the same things that do
 * not come across.
 *
 * **The rendered body is what is imported, not the raw one.** `content.raw`
 * is block comments and shortcodes only WordPress can expand; `rendered` is
 * the HTML the page actually showed. So a `[gallery]` arrives as its pictures
 * and a core block as its markup. What does not survive is anything a plugin
 * drew with scripts or a layout it styled — a contact form, an Elementor
 * section — and those are named per page from the raw content.
 *
 * **A slug is kept when it is free here.** The old address then needs no
 * redirect. When a record here already holds it, the import takes the next
 * free one and says so; the redirect step points the old address at it.
 * On a second run the record's slug is never changed (it would make
 * `Sluggable` write a redirect nobody asked for).
 */
abstract class ContentStep extends Step
{
    /** Shortcodes WordPress itself renders into plain markup. */
    private const CORE_SHORTCODES = ['gallery', 'caption', 'wp_caption', 'audio', 'video', 'embed', 'playlist'];

    /** @return class-string<Model> */
    abstract protected function model(): string;

    /**
     * The step's own columns, beyond the shared ones.
     *
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>
     */
    protected function fields(Context $ctx, array $record, Outcome $outcome): array
    {
        return [];
    }

    /** @param  array<string, mixed>  $record */
    protected function afterWrite(Context $ctx, Model $model, array $record, Outcome $outcome): void {}

    /** Whether a slug is unavailable to a new record of this kind. */
    protected function slugTaken(Context $ctx, array $record, string $slug): bool
    {
        return $this->slugQuery($ctx, $record)->where('slug', $slug)->exists();
    }

    /** A query for records of this kind that could hold `$slug`; entries scope it to their type. */
    protected function slugQuery(Context $ctx, array $record): Builder
    {
        return ($this->model())::query();
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $title = self::raw($record['title'] ?? '');
        $label = $title !== '' ? $title : '(untitled #'.($record['id'] ?? '?').')';

        if (($record['status'] ?? '') === 'trash') {
            return Outcome::skip($label, 'In the bin on the old site.');
        }

        $existing = $ctx->map->model((string) $this->mapType(), $record['id'], $this->model());
        $outcome = Outcome::upsert($existing !== null, $label, ['title' => $title !== '' ? $title : $label, 'existing' => $existing?->getKey()]);

        [$status, $publishedAt] = $this->status($record, $outcome);
        $outcome->data['status'] = $status;
        $outcome->data['published_at'] = $publishedAt;

        if ($existing === null) {
            $wanted = self::slug($record['slug'] ?? null, $label);
            $slug = $this->freeSlug($ctx, $record, $wanted);
            $outcome->data['slug'] = $slug;

            if ($slug !== $wanted) {
                $outcome->warn('Its address was already used here, so it was given the next free one.');
            }
        }

        $raw = self::raw($record['content'] ?? '');

        if ($builder = self::builder($record)) {
            $outcome->warn("Laid out with {$builder}: the text and pictures come across, the layout does not.");
        }

        $foreign = array_diff(self::shortcodes($raw), self::CORE_SHORTCODES);

        foreach ($foreign as $code) {
            $outcome->warn("Uses the [{$code}] shortcode, which a plugin drew; what it showed may not survive.");
        }

        if ($ctx->import->wants('custom')) {
            AcfValues::plan($ctx, $this->targetKey($ctx, $record), $record, $outcome);
        }

        return $outcome;
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $class = $this->model();
        $label = $outcome->label;

        $values = [
            'title' => Str::limit($outcome->data['title'], 250, ''),
            'body' => self::body($ctx, self::rendered($record['content'] ?? ''), $label),
            'status' => $outcome->data['status'],
            'published_at' => $outcome->data['published_at'],
        ] + $this->fields($ctx, $record, $outcome);

        $model = $outcome->data['existing'] ? $class::query()->find($outcome->data['existing']) : null;

        if ($model === null) {
            $model = new $class;
            $model->fill($values + ['slug' => $outcome->data['slug'] ?? self::slug($record['slug'] ?? null, $label)]);
        } else {
            $model->fill($values);
        }

        $this->beforeSave($ctx, $model, $record);
        $model->save();

        Seo::save($model, Seo::from($ctx, $record, $outcome->data['title'], $label));

        if ($ctx->import->wants('custom')) {
            AcfValues::write($ctx, $model, $this->targetKey($ctx, $record), $record);
        }

        $this->afterWrite($ctx, $model, $record, $outcome);

        $ctx->map->put((string) $this->mapType(), $record['id'], $model, $record['link'] ?? null);
    }

    public function media(Context $ctx, array $record): array
    {
        $sources = self::bodyUploads($ctx, self::rendered($record['content'] ?? ''));

        if ($this->keepsFeaturedImage() && ! empty($record['featured_media'])) {
            $sources[] = (int) $record['featured_media'];
        }

        if (is_string($og = $record['yoast_head_json']['og_image'][0]['url'] ?? null)) {
            $sources[] = $og;
        }

        return array_merge($sources, AcfValues::media($ctx, $this->targetKey($ctx, $record), $record));
    }

    /** Whether the record kind has somewhere to put a featured image (pages do not). */
    protected function keepsFeaturedImage(): bool
    {
        return false;
    }

    /** Anything that must be set on the model before its first save (an entry's type). */
    protected function beforeSave(Context $ctx, Model $model, array $record): void {}

    /** The custom-field target this record's ACF values belong to. */
    protected function targetKey(Context $ctx, array $record): string
    {
        return (new ($this->model()))->getMorphClass();
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array{0: PublishStatus, 1: ?CarbonImmutable}
     */
    protected function status(array $record, Outcome $outcome): array
    {
        $date = self::date($record['date_gmt'] ?? null) ?? self::date($record['date'] ?? null);

        if (! empty($record['content']['protected'])) {
            $outcome->warn('Was password-protected; imported as a draft.');

            return [PublishStatus::Draft, null];
        }

        return match ($record['status'] ?? 'draft') {
            'publish', 'future' => [PublishStatus::Published, $date ?? CarbonImmutable::now()],
            'private' => (function () use ($outcome) {
                $outcome->warn('Was private; imported as a draft.');

                return [PublishStatus::Draft, null];
            })(),
            default => [PublishStatus::Draft, null],
        };
    }

    private function freeSlug(Context $ctx, array $record, string $wanted): string
    {
        $slug = $wanted;
        $i = 2;

        while ($this->slugTaken($ctx, $record, $slug)) {
            $slug = $wanted.'-'.$i++;
        }

        return $slug;
    }
}
