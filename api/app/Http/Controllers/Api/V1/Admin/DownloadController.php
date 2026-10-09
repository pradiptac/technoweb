<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\DownloadAccess;
use App\Enums\DownloadSource;
use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\DownloadRequest;
use App\Http\Resources\Admin\DownloadResource;
use App\Models\Download;
use App\Models\DownloadCategory;
use App\Models\Product;
use App\Models\StoreProduct;
use App\Support\Downloads\DownloadFiles;
use App\Support\ListSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The downloads centre's console half (0.131.0, docs/downloads.md). Behind
 * auth:sanctum + role:content_manager — a download is content, a page's
 * worth of files, and it lives with the pages.
 *
 * `options` is what the form needs and cannot read for itself: the shop's
 * products belong to `role:store_manager`, and a content manager attaching
 * a driver to one needs its name and nothing else. Names of published
 * products are what the public site already prints.
 */
class DownloadController extends Controller
{
    use HandlesBulk;

    /** The columns a header may sort by — `ListSort`'s allowlist. */
    private const SORTS = [
        'title' => 'title',
        'released' => 'released_on',
        'count' => 'download_count',
        'status' => 'status',
        'updated' => 'updated_at',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Download::query()
            ->with('category')
            ->withCount(['products', 'storeProducts'])
            ->when($request->filled('q'), fn (Builder $q) => $q->search($request->string('q')->value()))
            ->when($request->filled('status'), fn (Builder $q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('access'), fn (Builder $q) => $q->where('access', $request->string('access')->value()))
            ->when($request->filled('category'), function (Builder $q) use ($request) {
                $category = $request->string('category')->value();

                // `none` is "filed nowhere", a different question from "any".
                $category === 'none'
                    ? $q->whereNull('download_category_id')
                    : $q->where('download_category_id', (int) $category);
            });

        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q->orderByDesc('updated_at'));

        $downloads = $query->paginate(min(max($request->integer('per_page', 25), 1), 100))->withQueryString();

        DownloadFiles::prime($downloads->getCollection());

        return DownloadResource::collection($downloads)->additional(['meta' => self::meta()]);
    }

    /** What the form offers: the shelves, and the products a file can be attached to. */
    public function options(): JsonResponse
    {
        return response()->json(['data' => [
            ...self::meta(),
            'categories' => DownloadCategory::query()->ordered()->get(['id', 'name', 'is_active'])
                ->map(fn (DownloadCategory $c) => ['id' => $c->id, 'name' => $c->name, 'is_active' => (bool) $c->is_active]),
            'products' => Product::query()->orderBy('name')->limit(500)->get(['id', 'name'])
                ->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name]),
            'store_products' => StoreProduct::query()->orderBy('name')->limit(500)->get(['id', 'name'])
                ->map(fn (StoreProduct $p) => ['id' => $p->id, 'name' => $p->name]),
        ]]);
    }

    public function store(DownloadRequest $request): JsonResponse
    {
        $download = $this->write(new Download, $request);

        // `->response()`, never `response()->json($resource)` — the second
        // drops the `data` wrapper. See `PopupController::store()`.
        return $this->resource($download)->response()->setStatusCode(201);
    }

    public function show(Download $download): JsonResource
    {
        return $this->resource($download);
    }

    public function update(DownloadRequest $request, Download $download): JsonResource
    {
        return $this->resource($this->write($download, $request));
    }

    public function destroy(Download $download): JsonResponse
    {
        $this->remove($download);

        return response()->json(null, 204);
    }

    /**
     * `POST /admin/downloads/bulk` — publish, draft, archive or delete the
     * ticked downloads. Publishing is refused, per download, by the same
     * "a file first" rule an edit is held to.
     */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk(
            $request,
            Download::query(),
            $this->remove(...),
            function (Download $download, PublishStatus $status) {
                if ($status === PublishStatus::Published && $refusal = DownloadFiles::storedFileRefusal($download)) {
                    throw ValidationException::withMessages(['status' => $refusal]);
                }
            },
        );
    }

    /** What deleting a download does, for `destroy()` and the bulk path alike. */
    private function remove(Download $download): void
    {
        // The model's `deleted` hook removes a private upload; a library
        // file stays in the library.
        $download->delete();
    }

    /** Streams a private upload to staff — the console's way to check what was uploaded. */
    public function file(Download $download): StreamedResponse
    {
        abort_unless($download->source === DownloadSource::Upload && DownloadFiles::exists($download), 404);

        return DownloadFiles::stream($download);
    }

    /**
     * Create or update, with the file.
     *
     * A new upload is written **before** the row is saved and the old one
     * removed **after** it: a failure between the two leaves the previous
     * file in place and at worst one stray upload, never a row pointing at
     * nothing.
     */
    private function write(Download $download, DownloadRequest $request): Download
    {
        $data = $request->validated();
        $attributes = Arr::except($data, ['file', 'relations_sent', 'product_ids', 'store_product_ids']);

        $source = DownloadSource::from((string) ($attributes['source'] ?? $download->source->value));
        $previous = $download->private_path;
        $stored = null;

        if ($source === DownloadSource::Upload) {
            // The library path belongs to the other source; kept, a later
            // switch back would silently revive a file nobody chose again.
            $attributes['file_path'] = null;

            if ($request->hasFile('file')) {
                $stored = DownloadFiles::store($request->file('file'));
                $attributes = [...$attributes, ...$stored];
            }
        } else {
            $attributes = [...$attributes, 'private_path' => null, 'file_name' => null, 'file_size' => null, 'file_mime' => null];
        }

        try {
            DB::transaction(function () use ($download, $attributes, $data) {
                $download->fill($attributes)->save();

                if (array_key_exists('product_ids', $data)) {
                    $download->products()->sync($data['product_ids']);
                }
                if (array_key_exists('store_product_ids', $data)) {
                    $download->storeProducts()->sync($data['store_product_ids']);
                }
            });
        } catch (\Throwable $e) {
            DownloadFiles::discard($stored['private_path'] ?? null);

            throw $e;
        }

        if (filled($previous) && $previous !== $download->private_path) {
            DownloadFiles::discard($previous);
        }

        return $download;
    }

    private function resource(Download $download): DownloadResource
    {
        $download = $download->fresh() ?? $download;
        $download->load(['category', 'products', 'storeProducts'])->loadCount(['products', 'storeProducts']);

        return (new DownloadResource($download))->detail()->additional(['meta' => self::meta()]);
    }

    /** @return array<string, mixed> */
    private static function meta(): array
    {
        return [
            'accesses' => DownloadAccess::options(),
            'sources' => DownloadSource::options(),
            'statuses' => array_map(fn (PublishStatus $s) => ['value' => $s->value, 'label' => $s->label()], PublishStatus::cases()),
            'extensions' => DownloadFiles::EXTENSIONS,
            'max_upload_kb' => DownloadFiles::maxKb(),
        ];
    }
}
