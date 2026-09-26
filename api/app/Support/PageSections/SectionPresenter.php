<?php

namespace App\Support\PageSections;

use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Http\Resources\ContentBlockResource;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentBlock;
use App\Models\Faq;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\Service;
use App\Models\Slider;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Support\MediaMeta;
use App\Support\Money;
use Illuminate\Support\Collection;

/**
 * A builder page's sections as the public site reads them (2026-09-26).
 *
 * What changes on the way out, and each is the point:
 *
 * - **Hidden sections are gone.** Hiding is the editor's "not yet"; the
 *   public read never carries one, so nothing downstream has to remember.
 * - **A stored path becomes a URL**, with the library's alt text and focal
 *   point beside it (`MediaMeta`, the rule every public image follows) —
 *   `image_path` → `image`, `image_alt`, `image_focus`; a background's
 *   `image_path` gains `image_url` and `image_focus`, the shape
 *   `ThemeOptions::withUrls()` gives a homepage section.
 * - **A reference becomes what the page draws.** A content block is
 *   presented inline, the public `ContentBlockResource`; a slider, gallery
 *   or form becomes its current **slug**, which the frontend fetches from its
 *   own public endpoint (the shortcodes' path, so "published and not empty"
 *   has one definition). Stored as ids, so renaming a slug moves nothing.
 *   A reference that has since been unpublished or deleted drops its section,
 *   as a deleted record drops its menu item.
 * - **A `cards` section is resolved now**: the live list's current rows,
 *   published only, as tiles with a path, a picture and an icon — so a
 *   solution published tomorrow is on the page tomorrow.
 * - **A `faq` section on "this page's FAQs" carries them**, read from the
 *   page's loaded `faqs`.
 *
 * Unknown types are dropped: a stored type outlives the code that drew it.
 */
final class SectionPresenter
{
    /**
     * @param  array<int, mixed>|null  $blocks  as stored (or as normalised, for a preview)
     * @return list<array<string, mixed>>
     */
    public static function present(?array $blocks, ?Page $page = null): array
    {
        $out = [];

        foreach ($blocks ?? [] as $block) {
            if (! is_array($block) || filter_var($block['hidden'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                continue;
            }
            $type = PageSectionType::tryFrom((string) ($block['type'] ?? ''));
            if (! $type) {
                continue;
            }

            $data = self::data($type, (array) ($block['data'] ?? []), $page);
            if ($data === null) {
                continue;
            }

            $out[] = [
                'id' => (string) ($block['id'] ?? ''),
                'type' => $type->value,
                'background' => self::background($block['background'] ?? null),
                'data' => (object) $data,
            ];
        }

        return $out;
    }

    /**
     * The FAQ entries the page's own sections add to its `FAQPage` — the
     * custom ones only, since "this page's FAQs" are already the page's.
     *
     * @param  array<int, mixed>|null  $blocks
     * @return list<object{question: string, answer: string}>
     */
    public static function faqEntries(?array $blocks): array
    {
        $entries = [];
        foreach ($blocks ?? [] as $block) {
            if (! is_array($block) || filter_var($block['hidden'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                continue;
            }
            $data = (array) ($block['data'] ?? []);
            if (($block['type'] ?? null) !== PageSectionType::Faq->value || ($data['source'] ?? null) !== 'custom') {
                continue;
            }
            foreach ((array) ($data['items'] ?? []) as $item) {
                if (filled($item['question'] ?? null) && filled($item['answer'] ?? null)) {
                    // Escaped, because the answer is plain text and the graph
                    // builder reads an answer as markup it strips.
                    $entries[] = (object) ['question' => (string) $item['question'], 'answer' => e((string) $item['answer'])];
                }
            }
        }

        return $entries;
    }

    /** @return array<string, mixed>|null */
    private static function background(mixed $bg): ?array
    {
        if (! is_array($bg) || ($bg['kind'] ?? 'default') === 'default') {
            return null;
        }
        if (is_string($bg['image_path'] ?? null) && $bg['image_path'] !== '') {
            $bg['image_url'] = asset('storage/'.$bg['image_path']);
            if (($focus = MediaMeta::focus($bg['image_path'])) !== null) {
                $bg['image_focus'] = $focus;
            }
        }

        return $bg;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null null drops the section
     */
    private static function data(PageSectionType $type, array $data, ?Page $page): ?array
    {
        return match ($type) {
            PageSectionType::Hero, PageSectionType::MediaText => self::picture($data, 'image'),
            PageSectionType::Testimonial => self::picture($data, 'photo'),
            PageSectionType::Video => self::video($data),
            PageSectionType::Cards => self::cards($data),
            PageSectionType::ContentBlock => self::contentBlock($data),
            PageSectionType::Slider => self::slug($data, 'slider_id', Slider::class),
            PageSectionType::Gallery => self::slug($data, 'gallery_id', Gallery::class),
            PageSectionType::Form => self::slug($data, 'form_id', Form::class),
            PageSectionType::Faq => self::faq($data, $page),
            default => $data,
        };
    }

    private static function url(?string $path): ?string
    {
        return filled($path) ? asset('storage/'.$path) : null;
    }

    /**
     * `{$name}_path` → `{$name}`, `{$name}_alt`, `{$name}_focus`; a video path → `video`.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private static function picture(array $data, string $name): array
    {
        $path = $data["{$name}_path"] ?? null;
        unset($data["{$name}_path"]);
        if (is_string($path) && $path !== '') {
            $data[$name] = self::url($path);
            $data["{$name}_alt"] = MediaMeta::alt($path) ?? '';
            $data["{$name}_focus"] = MediaMeta::focus($path);
        }

        return self::video($data);
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function video(array $data): array
    {
        $path = $data['video_path'] ?? null;
        unset($data['video_path']);
        if (is_string($path) && $path !== '') {
            $data['video'] = self::url($path);
        }

        return $data;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed>|null */
    private static function contentBlock(array $data): ?array
    {
        $block = ContentBlock::query()->where('status', PublishStatus::Published)->find((int) ($data['block_id'] ?? 0));

        return $block ? ['block' => (new ContentBlockResource($block))->resolve()] : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  class-string<Slider|Gallery|Form>  $model
     * @return array<string, mixed>|null
     */
    private static function slug(array $data, string $key, string $model): ?array
    {
        $record = $model::query()->where('status', PublishStatus::Published)->find((int) ($data[$key] ?? 0));
        if (! $record) {
            return null;
        }
        unset($data[$key]);
        $data['slug'] = $record->slug;

        return $data;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed>|null */
    private static function faq(array $data, ?Page $page): ?array
    {
        if (($data['source'] ?? 'custom') === 'page') {
            $faqs = $page ? ($page->relationLoaded('faqs') ? $page->getRelation('faqs') : $page->faqs()->get()) : collect();
            $data['items'] = $faqs->map(fn (Faq $f) => ['question' => $f->question, 'answer' => $f->answer])->values()->all();
        }

        return empty($data['items']) ? null : $data;
    }

    /**
     * A live list, resolved now.
     *
     * An empty list drops the section: a heading over nothing reads as broken.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>|null
     */
    private static function cards(array $data): ?array
    {
        $limit = max(1, min(12, (int) ($data['limit'] ?? 6)));
        $category = is_string($data['category'] ?? null) && $data['category'] !== '' ? $data['category'] : null;
        $source = (string) ($data['source'] ?? '');

        /** @var Collection<int, array<string, mixed>> $items */
        $items = match ($source) {
            'solutions' => Solution::published()->orderBy('sort_order')->orderBy('id')->limit($limit)->get()
                ->map(fn (Solution $s) => self::tile($s->title, $s->summary, "/solutions/{$s->slug}", $s->hero_image_path, $s->icon)),
            'services' => Service::published()->orderBy('sort_order')->orderBy('id')->limit($limit)->get()
                ->map(fn (Service $s) => self::tile($s->title, $s->summary, "/services/{$s->slug}", null, $s->icon)),
            'industries' => Industry::query()->orderBy('sort_order')->orderBy('id')->limit($limit)->get()
                ->map(fn (Industry $i) => self::tile($i->name, $i->summary, "/industries/{$i->slug}", null, $i->icon)),
            'case_studies' => CaseStudy::published()->with('industry')->orderByDesc('id')->limit($limit)->get()
                ->map(fn (CaseStudy $c) => self::tile($c->title, $c->summary, "/case-studies/{$c->slug}", $c->cover_image_path, null, $c->industry?->name)),
            'blog' => BlogPost::published()->orderByDesc('published_at')->orderByDesc('id')->limit($limit)->get()
                ->map(fn (BlogPost $p) => self::tile($p->title, $p->excerpt, "/blog/{$p->slug}", $p->cover_image_path, null, null, $p->published_at?->format('j F Y'))),
            'knowledge' => KnowledgeArticle::published()->with('category')->orderByDesc('published_at')->orderByDesc('id')->limit($limit)->get()
                ->map(fn (KnowledgeArticle $a) => self::tile($a->title, $a->excerpt, "/knowledge-base/{$a->slug}", null, null, $a->category?->name)),
            'products' => Product::published()->with('brand')
                ->when($category, fn ($q) => $q->whereHas('category', fn ($c) => $c->where('slug', $category)))
                ->orderByDesc('is_featured')->orderBy('sort_order')->orderBy('id')->limit($limit)->get()
                ->map(fn (Product $p) => self::tile($p->name, $p->short_description, "/products/{$p->slug}", $p->images[0] ?? null, null, $p->brand?->name)),
            'store_products' => StoreProduct::published()->with('brand')
                ->when($category, fn ($q) => $q->whereHas('category', fn ($c) => $c->where('slug', $category)))
                ->orderByDesc('is_featured')->orderBy('sort_order')->orderBy('id')->limit($limit)->get()
                ->map(fn (StoreProduct $p) => self::tile($p->name, $p->short_description, "/store/products/{$p->slug}", $p->images[0] ?? null, null, $p->brand?->name, Money::format((int) $p->price_paise))),
            default => collect(),
        };

        $data['index_path'] = match ($source) {
            'solutions' => '/solutions',
            'services' => '/services',
            'industries' => '/industries',
            'case_studies' => '/case-studies',
            'blog' => '/blog',
            'knowledge' => '/knowledge-base',
            'products' => $category ? "/products/{$category}" : '/products',
            'store_products' => $category ? "/store/categories/{$category}" : '/store',
            default => null,
        };
        $data['items'] = $items->values()->all();

        return $data['items'] === [] ? null : $data;
    }

    /** @return array<string, mixed> */
    private static function tile(string $title, ?string $summary, string $path, ?string $image, ?string $icon, ?string $kicker = null, ?string $meta = null): array
    {
        return [
            'title' => $title,
            'summary' => $summary,
            'path' => $path,
            'image' => self::url($image),
            'image_alt' => $image ? (MediaMeta::alt($image) ?? '') : null,
            'image_focus' => $image ? MediaMeta::focus($image) : null,
            'icon' => $icon,
            'kicker' => $kicker,
            'meta' => $meta,
        ];
    }
}
