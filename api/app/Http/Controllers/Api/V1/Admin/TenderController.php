<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\StoreTenderRequest;
use App\Http\Requests\UpdateTenderRequest;
use App\Http\Resources\Admin\TenderResource;
use App\Models\Tender;
use App\Models\TenderCategory;
use App\Support\ListSort;
use App\Support\Tenders\TenderDocuments;
use App\Support\Tenders\TenderText;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Tenders in the console (0.174.0, docs/tenders.md), `role:content_manager`.
 *
 * Not `WritesCmsEntities`: like an event, a tender has no `published_at` for
 * it to stamp, and its SEO row is written below against the model itself.
 */
class TenderController extends Controller
{
    use HandlesBulk;

    /** The columns a header may sort by — `ListSort`'s allowlist. */
    private const SORTS = [
        'closes' => 'closes_at',
        'opens' => 'opens_at',
        'reference' => 'reference',
        'title' => 'title',
        'status' => 'status',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $now = now();
        $when = $request->string('when')->value();

        $query = Tender::query()
            ->with('category')
            ->when($request->filled('status'), fn (Builder $q) => $q->where('tenders.status', $request->string('status')->value()))
            ->when($when === 'open', fn (Builder $q) => $q->open($now))
            ->when($when === 'closed', fn (Builder $q) => $q->closed($now))
            ->when($when === 'upcoming', fn (Builder $q) => $q->upcoming($now))
            ->when($request->filled('q'), fn (Builder $q) => $q->search($request->string('q')->value()));

        // "Filed nowhere" is a real thing to look for — a category was
        // deleted and its tenders need re-filing — so `none` is a value
        // rather than something a filter cannot express.
        $category = $request->string('category')->value();

        if ($category === 'none') {
            $query->whereNull('tenders.tender_category_id');
        } elseif ($category !== '') {
            $query->where('tenders.tender_category_id', (int) $category);
        }

        /*
         * Default: what is still open, closing soonest, then what has
         * closed, most recently first. Read top-down that is "what needs
         * looking at next", and a tender that shut last spring is not it.
         *
         * Two keys for the two halves, because they want opposite
         * directions — see the public list, which orders the same way.
         *
         * It ends on `id`, and that is not decoration: two tenders closing
         * at the same minute are ordered by nothing else, and MySQL is free
         * to order equal rows differently between two queries — so a page
         * boundary shows one of them twice and hides the other.
         */
        $stamp = $now->toDateTimeString();

        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN 0 ELSE 1 END', [$stamp])
            ->orderByRaw('CASE WHEN tenders.closes_at > ? THEN tenders.closes_at END ASC', [$stamp])
            ->orderByRaw('CASE WHEN tenders.closes_at <= ? THEN tenders.closes_at END DESC', [$stamp])
            ->orderBy('tenders.id'));

        $tenders = $query->paginate(min(max($request->integer('per_page', 20), 1), 100))->withQueryString();

        // One query for the whole page's documents — see the public index.
        TenderDocuments::prime($tenders->getCollection());

        return TenderResource::collection($tenders)->additional(['meta' => self::meta()]);
    }

    public function show(Tender $tender): JsonResponse
    {
        return $this->respond($tender);
    }

    public function store(StoreTenderRequest $request): JsonResponse
    {
        $tender = DB::transaction(function () use ($request) {
            $tender = Tender::create($request->modelData());

            $this->saveSeo($tender, $request->validated('seo'));

            return $tender;
        });

        return $this->respond($tender, 201);
    }

    public function update(UpdateTenderRequest $request, Tender $tender): JsonResponse
    {
        DB::transaction(function () use ($request, $tender) {
            $tender->update($request->modelData());

            $this->saveSeo($tender, $request->validated('seo'));
        });

        return $this->respond($tender->refresh());
    }

    public function destroy(Tender $tender): JsonResponse
    {
        $this->remove($tender);

        return response()->json(['message' => 'Tender deleted.']);
    }

    /**
     * `POST /admin/tenders/bulk` — publish, draft, archive or delete the
     * ticked tenders. Publishing is refused, per tender, by the same rule an
     * edit is held to: a notice nobody can answer does not go up.
     */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk(
            $request,
            Tender::query(),
            $this->remove(...),
            function (Tender $tender, PublishStatus $status) {
                if ($status !== PublishStatus::Published) {
                    return;
                }

                if (blank($tender->submission_email) && blank($tender->submission_url) && blank($tender->submission_address)) {
                    throw ValidationException::withMessages([
                        'submission_email' => 'How should a bid be submitted? Add an email address, a link or a postal address before publishing.',
                    ]);
                }
            },
        );
    }

    /** What deleting a tender does, for `destroy()` and the bulk path alike. */
    private function remove(Tender $tender): void
    {
        // The SEO row is polymorphic, so nothing cascades it. The documents
        // are media-library files and are **not** deleted: the library is
        // where a file is removed, and the same PDF is often on two tenders.
        DB::transaction(function () use ($tender) {
            $tender->seo()->delete();
            $tender->delete();
        });
    }

    /**
     * A draft copy under "(copy)" and a free slug — how next year's tender
     * is made from last year's.
     *
     * The reference is **not** copied: it is unique, and a tender number is
     * the one field nobody else can guess for you. The SEO override is not
     * copied either, for the events' reason — two pages with one
     * hand-written title is the duplicate the SEO overview exists to find.
     */
    public function duplicate(Tender $tender): JsonResponse
    {
        $copy = DB::transaction(function () use ($tender) {
            $copy = $tender->replicate(['slug', 'status', 'is_featured', 'reference']);
            $copy->title = mb_substr($tender->title, 0, 171).' (copy)';
            $copy->status = PublishStatus::Draft;
            $copy->is_featured = false;
            // Unique, and a draft needs *something*: the old number with a
            // suffix, which an editor replaces with the real one.
            $copy->reference = $this->freeReference($tender->reference);
            $copy->save();

            return $copy;
        });

        return $this->respond($copy, 201);
    }

    /** `TW/2026/01` → `TW/2026/01-copy`, then `-copy-2`, until nothing holds it. */
    private function freeReference(string $source): string
    {
        $base = mb_substr($source, 0, 70).'-copy';
        $candidate = $base;
        $i = 2;

        while (Tender::query()->where('reference', $candidate)->exists()) {
            $candidate = $base.'-'.$i++;
        }

        return $candidate;
    }

    /**
     * Writes the SEO override row only when there is something to write —
     * `updateOrCreate` through the relation, never a hand-set
     * `seoable_type`: the morph map stores "tender", not the class name.
     *
     * @param  array<string, mixed>|null  $seo
     */
    private function saveSeo(Tender $tender, ?array $seo): void
    {
        if ($seo !== null) {
            $tender->seo()->updateOrCreate([], $seo);
        }
    }

    /**
     * One tender with its `meta`. `->response()` rather than
     * `response()->json($resource)`: the second drops the `data` wrapper, so
     * a created tender would come back shaped unlike every read of one.
     */
    private function respond(Tender $tender, int $status = 200): JsonResponse
    {
        $tender->load(['seo', 'category']);

        return (new TenderResource($tender))
            ->additional(['meta' => self::meta()])
            ->response()
            ->setStatusCode($status);
    }

    /**
     * The lists the form is built from.
     *
     * The categories are every one of them, active or not: a tender already
     * filed under a switched-off category must still show which, or saving
     * the form would silently move it.
     *
     * @return array<string, mixed>
     */
    public static function meta(): array
    {
        return [
            'statuses' => array_map(
                fn (PublishStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                PublishStatus::cases(),
            ),
            'categories' => TenderCategory::query()->ordered()->get()
                ->map(fn (TenderCategory $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'is_active' => (bool) $c->is_active,
                ])->values()->all(),
            'max_documents' => Tender::MAX_DOCUMENTS,
            'closing_soon_days' => Tender::CLOSING_SOON_DAYS,
            'timezone' => TenderText::timezoneLabel(),
        ];
    }
}
