<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A section in the library, or a page template (docs/page-builder.md "The
 * library"). `kind` is `section` (one block, placed on pages linked or
 * copied) or `template` (a stack to start a page from, always copied).
 *
 * @property int $id
 * @property string $kind
 * @property string $name
 * @property string|null $description
 * @property list<array<string, mixed>> $blocks
 * @property int|null $created_by
 */
class SavedSection extends Model
{
    public const KIND_SECTION = 'section';

    public const KIND_TEMPLATE = 'template';

    /**
     * The record types whose body area can hold sections, by the kind a
     * `linkedFrom()` row names them with, each with its title column.
     *
     * @var array<string, array{0: class-string<Model>, 1: string}>
     */
    public const RECORDS = [
        'solution' => [Solution::class, 'title'],
        'service' => [Service::class, 'title'],
        'industry' => [Industry::class, 'name'],
        'case_study' => [CaseStudy::class, 'title'],
        // 0.130.0: the rest of the records with a written body.
        'blog_post' => [BlogPost::class, 'title'],
        'knowledge_article' => [KnowledgeArticle::class, 'title'],
        'product' => [Product::class, 'name'],
        'store_product' => [StoreProduct::class, 'name'],
        'event' => [Event::class, 'title'],
        'job_opening' => [JobOpening::class, 'title'],
        'entry' => [Entry::class, 'title'],
    ];

    protected $fillable = ['kind', 'name', 'description', 'blocks', 'created_by'];

    protected function casts(): array
    {
        return ['blocks' => 'array'];
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * The pages, templates and records that place this section linked — what a
     * delete would break, so it is refused while there are any.
     *
     * @return list<array{id:int,title:string,kind:string}>
     */
    public function linkedFrom(): array
    {
        $uses = [];
        $places = fn (?array $blocks) => collect($blocks ?? [])->contains(
            fn ($b) => is_array($b) && ($b['type'] ?? null) === 'saved' && (int) ($b['data']['saved_id'] ?? 0) === $this->id,
        );

        foreach (Page::query()->whereNotNull('blocks')->get(['id', 'title', 'blocks']) as $page) {
            if ($places($page->blocks)) {
                $uses[] = ['id' => $page->id, 'title' => (string) $page->title, 'kind' => 'page'];
            }
        }
        foreach (self::query()->where('kind', self::KIND_TEMPLATE)->get(['id', 'name', 'blocks']) as $template) {
            if ($places($template->blocks)) {
                $uses[] = ['id' => $template->id, 'title' => $template->name, 'kind' => 'template'];
            }
        }
        // The records that carry sections in their body area (0.129.0). A
        // link from one is as breakable as a page's, whichever layout the
        // record is showing today.
        foreach (self::RECORDS as $kind => [$model, $title]) {
            foreach ($model::query()->whereNotNull('blocks')->get(['id', $title, 'blocks']) as $record) {
                if ($places($record->getAttribute('blocks'))) {
                    $uses[] = ['id' => (int) $record->getKey(), 'title' => (string) $record->getAttribute($title), 'kind' => $kind];
                }
            }
        }

        return $uses;
    }
}
