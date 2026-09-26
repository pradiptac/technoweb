<?php

namespace App\Models;

use App\Enums\CustomFieldKind;
use App\Support\CustomFields\EntryTargets;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A kind of record an editor made from the console — "Events", "Downloads"
 * (docs/custom-content.md). Its `slug` is the URL prefix: `/events` is the
 * archive and `/events/{entry}` each entry.
 *
 * **Renaming the slug moves every entry**, and the entries' paths are derived
 * rather than stored, so the move is a redirect per entry plus one for the
 * archive — written one row at a time, the `RepathsLandingPages` rule, so each
 * is a real `Redirect` a person can find and edit. Two more things carry the
 * slug and move with it: custom field groups attached as `entry:<slug>`, and
 * linked-record fields pointing at the type.
 */
class ContentType extends Model
{
    public const SORTS = ['newest', 'title', 'manual'];

    public const SCHEMA_TYPES = ['Article', 'WebPage'];

    protected $fillable = [
        'name', 'plural', 'slug', 'icon', 'description', 'has_body', 'has_image',
        'archive_enabled', 'per_page', 'sort', 'schema_type', 'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'has_body' => 'boolean',
            'has_image' => 'boolean',
            'archive_enabled' => 'boolean',
            'is_active' => 'boolean',
            'per_page' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public static function booted(): void
    {
        static::updated(function (ContentType $type) {
            if ($type->wasChanged('slug') && filled($type->getOriginal('slug'))) {
                $type->moveSlug((string) $type->getOriginal('slug'), (string) $type->slug);
            }
        });
    }

    /** @return HasMany<Entry, $this> */
    public function entries(): HasMany
    {
        return $this->hasMany(Entry::class);
    }

    /**
     * @param  Builder<ContentType>  $query
     * @return Builder<ContentType>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function publicPath(): string
    {
        return '/'.$this->slug;
    }

    /** The key custom field groups are attached to this type's entries by. */
    public function target(): string
    {
        return EntryTargets::PREFIX.$this->slug;
    }

    /**
     * Everything that carries the old slug, moved to the new one.
     *
     * A redirect per entry rather than one prefix rule, because the redirect
     * table is looked up by exact path (`proxy.ts` holds it as a map). Any
     * redirect already *pointing* at an old address is re-aimed, so a chain
     * of two hops does not become three.
     */
    private function moveSlug(string $old, string $new): void
    {
        DB::transaction(function () use ($old, $new) {
            $moves = ['/'.$old => '/'.$new];
            foreach ($this->entries()->get(['id', 'slug']) as $entry) {
                $moves["/{$old}/{$entry->slug}"] = "/{$new}/{$entry->slug}";
            }

            foreach ($moves as $from => $to) {
                Redirect::query()->where('to_path', $from)->update(['to_path' => $to]);
                Redirect::updateOrCreate(
                    ['from_path' => $from],
                    ['to_path' => $to, 'status_code' => 301, 'is_active' => true, 'created_automatically' => true],
                );
            }

            // A redirect that now points at itself is a loop: the old path
            // was reused and has just been moved away again.
            Redirect::query()->whereColumn('from_path', 'to_path')->delete();

            $from = EntryTargets::PREFIX.$old;
            $to = EntryTargets::PREFIX.$new;

            CustomFieldGroup::query()->forTarget($from)->get()->each(function (CustomFieldGroup $group) use ($from, $to) {
                $group->update(['targets' => array_values(array_map(fn ($t) => $t === $from ? $to : $t, $group->targets ?? []))]);
            });

            CustomField::query()->where('kind', CustomFieldKind::Relation->value)->get()
                ->filter(fn (CustomField $f) => $f->setting('target') === $from)
                ->each(fn (CustomField $f) => $f->update(['settings' => ['target' => $to] + ($f->settings ?? [])]));
        });
    }
}
