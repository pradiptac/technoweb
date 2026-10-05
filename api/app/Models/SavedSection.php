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
     * The pages (and templates) that place this section linked — what a
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

        return $uses;
    }
}
