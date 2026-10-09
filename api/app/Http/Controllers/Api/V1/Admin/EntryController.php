<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesAnswerContent;
use App\Http\Controllers\Concerns\WritesCustomFields;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\EntryRequest;
use App\Http\Resources\Admin\ContentTypeResource;
use App\Http\Resources\Admin\EntryResource;
use App\Models\ContentType;
use App\Models\Entry;
use App\Support\CustomFields\CustomFields;
use App\Support\PageSections\RecordSections;
use App\Support\PublishStamp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Entries of a custom content type, nested under it:
 * `/admin/content-types/{type-slug}/entries/{id}`. Behind
 * role:content_manager, and in the Solutions pattern — the SEO override, the
 * FAQs, the answer blocks and the custom fields each written after the row.
 *
 * The type is addressed by slug because that is the console's URL
 * (`/admin/content/{type}`) and nothing on an entry's form can change it; the
 * entry by id, the rule every CMS record follows, and scoped so an entry of
 * another type answers 404.
 */
class EntryController extends Controller
{
    // Not `WritesCmsEntities`: its helpers take a bare `Model`, and an entry
    // is typed here instead — the two it needs are written against `Entry`.
    use HandlesBulk, WritesAnswerContent, WritesCustomFields;

    private const DETAIL = ['contentType', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group'];

    public function index(Request $request, ContentType $contentType): AnonymousResourceCollection
    {
        $entries = $contentType->entries()
            ->with('contentType')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('summary', 'like', "%{$term}%"));
            })
            // Drafts, then the newest — the ones needing work at the top.
            ->orderByRaw('published_at IS NULL DESC')
            ->orderByDesc('published_at')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return EntryResource::collection($entries)->additional(['meta' => [
            'type' => new ContentTypeResource($contentType),
            'statuses' => array_map(
                fn (PublishStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                PublishStatus::cases(),
            ),
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The groups attached to this type, for the new form's Fields tab.
            'custom_field_groups' => CustomFields::definitions($contentType->target()),
        ]]);
    }

    public function show(ContentType $contentType, Entry $entry): JsonResource
    {
        return new EntryResource($entry->load(self::DETAIL));
    }

    public function store(EntryRequest $request, ContentType $contentType): JsonResponse
    {
        $entry = DB::transaction(function () use ($request, $contentType) {
            [$attributes, $seo] = $this->split($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);
            $content = $this->pullAnswerContent($attributes);

            // The type first, so the slug is made unique within it.
            $entry = new Entry(['content_type_id' => $contentType->id]);
            $entry->setRelation('contentType', $contentType);
            $entry->fill($this->publishedAt($attributes))->save();

            $this->saveAnswerContent($entry, $content);
            $this->seo($entry, $seo);
            $this->saveCustomFields($entry, $custom);

            return $entry;
        });

        return (new EntryResource($entry->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(EntryRequest $request, ContentType $contentType, Entry $entry): JsonResource
    {
        DB::transaction(function () use ($request, $entry) {
            [$attributes, $seo] = $this->split($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);
            $content = $this->pullAnswerContent($attributes);

            // A blank slug on an edit means "keep it", never "make it null".
            if (array_key_exists('slug', $attributes) && blank($attributes['slug'])) {
                unset($attributes['slug']);
            }

            // A slug change writes the 301 through `Sluggable`, under this
            // type's prefix.
            $entry->update($this->publishedAt($attributes, $entry));

            $this->saveAnswerContent($entry, $content);
            $this->seo($entry, $seo);
            $this->saveCustomFields($entry, $custom);
        });

        return new EntryResource($entry->fresh(self::DETAIL) ?? $entry);
    }

    /**
     * The validated attributes and the nested SEO override, apart:
     * `preventSilentlyDiscardingAttributes` is on, so `seo` in `fill()` throws.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    private function split(array $validated): array
    {
        $seo = $validated['seo'] ?? null;
        unset($validated['seo']);

        return [$validated, is_array($seo) ? $seo : null];
    }

    /** The override row, only when there is something to write. */
    private function seo(Entry $entry, ?array $seo): void
    {
        if ($seo !== null) {
            $entry->seo()->updateOrCreate([], $seo);
        }
    }

    /**
     * Publishing without a date means now — the `WritesCmsEntities` rule.
     * `Entry::scopePublished` admits a null date, so this is about the
     * archive's newest-first order and the page's dateline, not visibility.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function publishedAt(array $attributes, ?Entry $existing = null): array
    {
        return PublishStamp::apply($attributes, $existing);
    }

    public function destroy(ContentType $contentType, Entry $entry): JsonResponse
    {
        $this->remove($entry);

        return response()->json(['message' => 'Entry deleted.']);
    }

    /**
     * `POST /admin/content-types/{type}/entries/bulk` — publish, draft,
     * archive or delete the ticked entries **of this type**; another type's
     * entry id is simply absent from the answer, as the scoped routes make it
     * a 404.
     */
    public function bulk(BulkActionRequest $request, ContentType $contentType): JsonResponse
    {
        return $this->runBulk($request, Entry::query()->where('content_type_id', $contentType->id), $this->remove(...));
    }

    /** What deleting an entry does, for `destroy()` and the bulk path alike. */
    private function remove(Entry $entry): void
    {
        DB::transaction(function () use ($entry) {
            // Polymorphic rows have nothing to cascade them.
            $entry->seo()->delete();
            $entry->faqs()->delete();
            $entry->answerBlocks()->delete();
            $entry->delete();
        });
    }
}
