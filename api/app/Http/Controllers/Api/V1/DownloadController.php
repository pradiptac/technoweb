<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DownloadAccess;
use App\Enums\DownloadSource;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsurePortalEnabled;
use App\Http\Resources\DownloadResource;
use App\Models\Customer;
use App\Models\Download;
use App\Models\DownloadCategory;
use App\Support\Downloads\DownloadFiles;
use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

/**
 * The downloads centre, as the public site reads it (0.131.0,
 * docs/downloads.md).
 *
 * Three routes: the list, the shelves, and the file. The list names every
 * published download — a customers-only one too, with `locked: true` — and
 * never the address of a file. The file route is the one door to the bytes:
 * it counts the download, and it is where a customers-only file asks who is
 * reading.
 */
class DownloadController extends Controller
{
    public const SIGN_IN_REASON = 'sign_in_required';

    public function index(Request $request): AnonymousResourceCollection
    {
        $term = trim($request->string('q')->value());

        $query = Download::query()
            ->published()
            ->with('category')
            ->when($term !== '', fn (Builder $q) => $q->search(mb_substr($term, 0, 100)))
            ->when($request->filled('category'), fn (Builder $q) => $q->whereHas(
                'category', fn (Builder $c) => $c->where('slug', $request->string('category')->value()),
            ))
            // An unknown value is ignored rather than refused: it arrives
            // from a link, and an old link should show the list.
            ->when(DownloadAccess::tryFrom($request->string('access')->value()), fn (Builder $q, DownloadAccess $a) => $q->where('downloads.access', $a))
            ->shelved();

        $downloads = $query
            ->paginate(min(max($request->integer('per_page', 24), 1), 100))
            ->withQueryString();

        DownloadFiles::prime($downloads->getCollection());

        return DownloadResource::collection($downloads);
    }

    /**
     * The shelves that have something on them, in order, each with how many.
     * A plain collection, 200 when empty — the page's filter row.
     */
    public function categories(): JsonResponse
    {
        $counts = Download::query()->published()
            ->whereNotNull('downloads.download_category_id')
            ->selectRaw('downloads.download_category_id as id, COUNT(*) as n')
            ->groupBy('downloads.download_category_id')
            ->pluck('n', 'id');

        $categories = DownloadCategory::query()->active()->ordered()
            ->whereIn('id', $counts->keys())
            ->get()
            ->map(fn (DownloadCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'slug' => $c->slug,
                'description' => $c->description,
                'count' => (int) $counts[$c->id],
            ]);

        return response()->json([
            'data' => $categories->values(),
            'meta' => [
                'total' => Download::query()->published()->count(),
                // The newest change, for the sitemap's `lastmod`.
                'updated_at' => Download::query()->published()->max('downloads.updated_at'),
            ],
        ]);
    }

    /**
     * The file.
     *
     * A library file is answered as `{data: {url}}` — the website redirects
     * the browser there — and a private upload is streamed. Either way the
     * download is counted first. A draft, a download with no file and an id
     * nobody has are one 404.
     *
     * **A customers-only file needs a customer**, read from the guard by
     * name: this route is public, so `$request->user()` is always null here
     * and reads as working (the wishlist's rule, and the blog comments'
     * before it). No customer is a 401 with a `reason` the website branches
     * on. A staff token is not a customer; the console has its own route.
     */
    public function file(Request $request, int $download): Response
    {
        /** @var Download|null $row */
        $row = Download::query()->published()->whereKey($download)->first();

        abort_if($row === null, 404);

        if ($row->isLocked() && self::customer($request) === null) {
            return response()->json([
                'message' => 'Sign in to the customer portal to download this file.',
                'reason' => self::SIGN_IN_REASON,
            ], 401);
        }

        if ($row->source === DownloadSource::Upload) {
            abort_unless(DownloadFiles::exists($row), 404);
            DownloadFiles::count($row);

            return DownloadFiles::stream($row);
        }

        abort_if(DownloadFiles::info($row) === null, 404);
        DownloadFiles::count($row);

        return response()->json(['data' => ['url' => MediaUrl::for((string) $row->file_path)]]);
    }

    /** A customer who may sign in, while the portal is open — or nobody. */
    private static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer && $user->status->canSignIn() && EnsurePortalEnabled::open()
            ? $user
            : null;
    }
}
