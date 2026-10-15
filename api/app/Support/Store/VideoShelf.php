<?php

namespace App\Support\Store;

use App\Http\Resources\Store\ProductResource;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\MediaMeta;
use Illuminate\Http\Request;

/**
 * "Shop the videos" (0.140.0): the shop's products that carry a video, one
 * tile each, as a row with the product under the video.
 *
 * **One definition of the list.** `GET /store/videos` and the page builder's
 * `product_videos` section both read it, so the shop front, the homepage, a
 * builder page and the small row on a product page cannot drift into four
 * answers to "which videos are there". The videos are the ones already on the
 * product (`ProductVideos`, up to four, the product form's Media tab) — there
 * is no second list.
 *
 * **Published products only, and a row never carries a file path or a stock
 * count.** A file video is its public URL (the same one the product page's
 * own player uses); the product half of each row is the shop's ordinary list
 * resource, so the cart button and the cards read it unchanged.
 *
 * **One tile per product**, its first video — except the head of a
 * `?product=` request, where that product's own videos all come first, one
 * tile each, and the product is then excluded from the tail so it cannot
 * appear twice. The tail is the product's category-mates, then the rest.
 *
 * A thumbnail is never fetched from YouTube (the privacy rule, and
 * `i.ytimg.com` is not in the CSP): `poster_url` is the video's uploaded
 * poster or null, and the website falls back to the product's first picture.
 */
final class VideoShelf
{
    public const SHAPES = ['portrait', 'square', 'landscape'];

    public const ORDERS = ['newest', 'featured'];

    public const MIN_LIMIT = 4;

    public const MAX_LIMIT = 24;

    /**
     * @param  array{limit?: int|null, category?: string|null, category_id?: int|null, product?: string|null, order?: string|null, others?: bool|null}  $options
     * @return list<array{id: string, video: array<string, mixed>, product: StoreProduct}>
     */
    public static function rows(array $options = []): array
    {
        $limit = self::limit($options['limit'] ?? null);
        $order = in_array($options['order'] ?? null, self::ORDERS, true)
            ? $options['order']
            : self::order();
        $others = $options['others'] ?? true;

        $rows = [];
        $headId = null;
        $categoryId = null;

        $slug = $options['product'] ?? null;

        if (is_string($slug) && $slug !== '') {
            $head = StoreProduct::query()->published()->withVideos()
                ->with(['category', 'brand', 'variations', 'seo'])
                ->where('slug', $slug)->first();

            if ($head) {
                $headId = $head->id;
                $categoryId = $head->store_category_id;

                foreach (self::videosOf($head) as $n => $video) {
                    $rows[] = ['id' => $head->id.'-'.$n, 'video' => $video, 'product' => $head];
                }

                $rows = array_slice($rows, 0, $limit);
            }
        }

        if (! $others && $headId !== null) {
            return $rows;
        }

        if (count($rows) >= $limit) {
            return $rows;
        }

        $query = StoreProduct::query()->published()->withVideos()
            ->with(['category', 'brand', 'variations', 'seo'])
            ->when($headId !== null, fn ($q) => $q->whereKeyNot($headId))
            ->when(filled($options['category'] ?? null), fn ($q) => $q->whereHas(
                'category', fn ($c) => $c->where('slug', (string) $options['category'])
            ))
            ->when(filled($options['category_id'] ?? null), fn ($q) => $q->where('store_category_id', (int) $options['category_id']));

        // After a product's own videos, its category-mates come first.
        if ($categoryId !== null) {
            $query->orderByRaw('store_category_id = ? desc', [$categoryId]);
        }

        if ($order === 'featured') {
            $query->orderByDesc('is_featured')->orderBy('sort_order')->orderBy('name');
        } else {
            $query->orderByDesc('created_at');
        }

        // Every ordering ends on the id so a page boundary cannot show a row twice.
        $query->orderByDesc('id');

        foreach ($query->limit($limit - count($rows))->get() as $product) {
            $video = self::videosOf($product)[0] ?? null;

            if ($video !== null) {
                $rows[] = ['id' => $product->id.'-0', 'video' => $video, 'product' => $product];
            }
        }

        return $rows;
    }

    /**
     * The rows in the shape the wire carries: the video and the shop's own
     * list resource for the product. Resolved against a bare request, so the
     * product is the *list* shape whatever route is asking (a builder page is
     * `pages.show`, which would otherwise read as a detail view).
     *
     * @param  list<array{id: string, video: array<string, mixed>, product: StoreProduct}>  $rows
     * @return list<array{id: string, video: array<string, mixed>, product: array<string, mixed>}>
     */
    public static function present(array $rows): array
    {
        $request = Request::create('/');

        return array_map(fn (array $row) => [
            'id' => $row['id'],
            'video' => $row['video'],
            'product' => (new ProductResource($row['product']))->resolve($request),
        ], $rows);
    }

    /** @return list<array{id: string, video: array<string, mixed>, product: array<string, mixed>}> */
    public static function presented(array $options = []): array
    {
        return self::present(self::rows($options));
    }

    /** The default count, from Settings → Store → Product videos. */
    public static function limit(mixed $asked = null): int
    {
        $limit = is_numeric($asked) ? (int) $asked : (int) Setting::get('store_videos_limit', 12);

        return max(1, min(self::MAX_LIMIT, $limit ?: 12));
    }

    public static function order(): string
    {
        $order = (string) Setting::get('store_videos_order', 'newest');

        return in_array($order, self::ORDERS, true) ? $order : 'newest';
    }

    /**
     * The product's playable videos, each in the shelf's wire shape.
     *
     * `ProductVideos::forPublic()` decides what is playable and what a file's
     * address is; this adds only the poster's alt text, read by the path the
     * row stores (the public shape does not carry it).
     *
     * @return list<array<string, mixed>>
     */
    private static function videosOf(StoreProduct $product): array
    {
        $out = [];

        foreach (array_values((array) $product->videos) as $raw) {
            if (! is_array($raw)) {
                continue;
            }

            $public = ProductVideos::forPublic([$raw])[0] ?? null;

            if ($public === null) {
                continue;
            }

            $public['poster_alt'] = filled($raw['poster_path'] ?? null)
                ? (MediaMeta::alt((string) $raw['poster_path']) ?? '')
                : null;

            $out[] = $public;
        }

        return $out;
    }
}
