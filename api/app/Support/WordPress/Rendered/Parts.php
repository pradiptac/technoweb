<?php

namespace App\Support\WordPress\Rendered;

use App\Enums\ContentBlockType;
use App\Enums\GalleryTransition;
use App\Enums\PublishStatus;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Gallery;
use App\Support\Blocks\BlockRules;
use App\Support\WordPress\Context;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The records a page's sections point at: a form, a pricing block, a
 * gallery — created **published**, so the page shows them as the old site
 * did, and mapped so a second run finds them again.
 *
 * Two modes, because a step plans before it writes. **Counting** (`plan()`,
 * in the review and in the commit alike) adds each part to the report under
 * `STEP` once per run — a form placed on twelve pages is one form — and
 * writes nothing. **Writing** (`write()`) creates what is not here yet and
 * reuses what is: a form the first page created, or a part an earlier import
 * created, which is kept as it stands here rather than overwritten.
 *
 * A form is found again by the plugin's own id (`FormReader`), a pricing
 * block or a gallery by the page it is on and its place there.
 */
final class Parts
{
    public const STEP = 'page_parts';

    public const LABEL = 'Forms, pricing tables and galleries';

    private const FORM = 'wp_form';

    private const PRICING = 'wp_pricing';

    private const GALLERY = 'wp_gallery';

    /** @var array<string, int> place counters per kind, on this page */
    private array $places = [];

    /** @var array<string, int> how many of each kind this page holds */
    public array $found = [];

    /** @param  bool  $writes  whether records are created, or only counted */
    public function __construct(
        private readonly Context $ctx,
        private readonly string $page,
        private readonly string $title,
        private readonly bool $writes,
    ) {}

    /**
     * A form; its id here, or 0 while counting.
     *
     * @param  array{key: string, name: ?string, submit_label: string, fields: list<array<string, mixed>>, dropped?: list<string>}  $spec
     */
    public function form(array $spec, ?string $heading): int
    {
        $key = $spec['key'];
        $this->found['form'] = ($this->found['form'] ?? 0) + 1;

        if (! $this->writes) {
            $this->count(self::FORM, $key, 'Forms, placed as form sections');
            foreach ($spec['dropped'] ?? [] as $label) {
                $this->ctx->report->count(self::STEP, 'warn');
                $this->ctx->report->reason(self::STEP, 'warn', 'A file upload field has no field here and was left out of its form.', $this->title.' — '.$label);
            }

            return 0;
        }

        if ($existing = $this->ctx->map->model(self::FORM, $key, Form::class)) {
            return (int) $existing->getKey();
        }

        $form = Form::query()->create([
            'name' => Str::limit($spec['name'] ?? (($heading !== null && $heading !== '' ? $heading : 'Form').' — '.$this->title), 147, '…'),
            'status' => PublishStatus::Published,
            'submit_label' => $spec['submit_label'],
        ]);
        foreach ($spec['fields'] as $i => $field) {
            $form->fields()->create([
                'kind' => $field['kind'],
                'name' => $field['name'],
                'label' => $field['label'],
                'placeholder' => $field['placeholder'] ?? null,
                'required' => (bool) ($field['required'] ?? false),
                'options' => $field['options'] ?? null,
                'width' => $field['width'] ?? 'full',
                'sort_order' => $i,
            ]);
        }
        $this->ctx->map->put(self::FORM, $key, $form);

        return (int) $form->getKey();
    }

    /**
     * A pricing block of up to four plans.
     *
     * @param  list<array<string, mixed>>  $plans
     */
    public function pricing(array $plans, ?string $heading): ?int
    {
        $plans = array_map(function (array $plan) {
            if (isset($plan['cta']['href'])) {
                $plan['cta']['href'] = $this->local((string) $plan['cta']['href']);
            }

            return $plan;
        }, array_slice($plans, 0, 4));
        $content = array_filter([
            'heading' => $heading !== null && $heading !== '' ? Str::limit($heading, 157, '…') : null,
            'sets' => [['label' => 'Plans', 'plans' => $plans]],
        ]);
        if (! self::validPricing($content)) {
            return null;
        }

        $key = $this->place('pricing');
        $this->found['pricing'] = ($this->found['pricing'] ?? 0) + 1;
        if (! $this->writes) {
            $this->count(self::PRICING, $key, 'Pricing tables, made pricing blocks');

            return 0;
        }

        if ($existing = $this->ctx->map->model(self::PRICING, $key, ContentBlock::class)) {
            return (int) $existing->getKey();
        }

        $block = ContentBlock::query()->create([
            'type' => ContentBlockType::Pricing,
            'layout' => 'three_tier',
            'name' => Str::limit(($heading !== null && $heading !== '' ? $heading : 'Pricing').' — '.$this->title, 147, '…'),
            'status' => PublishStatus::Published,
            'data' => $content,
        ]);
        $this->ctx->map->put(self::PRICING, $key, $block);

        return (int) $block->getKey();
    }

    /**
     * A gallery; each picture's address is brought into the library.
     *
     * @param  list<array<string, mixed>>  $images  `{src, alt?, caption?}`
     * @param  callable(string): ?string  $media  address → library path
     */
    public function gallery(array $images, ?string $heading, callable $media): ?int
    {
        $items = [];
        foreach ($images as $image) {
            $path = $media((string) $image['src']);
            if ($path !== null) {
                $items[] = ['media_path' => $path, 'alt_text' => isset($image['alt']) ? mb_substr((string) $image['alt'], 0, 255) : null, 'title' => $image['caption'] ?? null];
            }
        }
        if (count($items) < 2) {
            return null;
        }

        $key = $this->place('gallery');
        $this->found['gallery'] = ($this->found['gallery'] ?? 0) + 1;
        if (! $this->writes) {
            $this->count(self::GALLERY, $key, 'Galleries and carousels, made galleries');

            return 0;
        }

        if ($existing = $this->ctx->map->model(self::GALLERY, $key, Gallery::class)) {
            return (int) $existing->getKey();
        }

        $gallery = Gallery::query()->create([
            'name' => Str::limit(($heading !== null && $heading !== '' ? $heading : 'Gallery').' — '.$this->title, 187, '…'),
            'status' => PublishStatus::Published,
            'transition' => GalleryTransition::Fade,
            'autoplay' => false,
        ]);
        foreach ($items as $i => $item) {
            $gallery->items()->create($item + ['sort_order' => $i]);
        }
        $this->ctx->map->put(self::GALLERY, $key, $gallery);

        return (int) $gallery->getKey();
    }

    /**
     * A link to the old site as a path here: the redirects step answers the
     * old address, and a pricing block is not something the links step reads.
     */
    private function local(string $href): string
    {
        $site = (string) parse_url((string) ($this->ctx->site()['url'] ?? $this->ctx->import->site_url), PHP_URL_HOST);
        $host = (string) parse_url($href, PHP_URL_HOST);
        if ($host === '' || $site === '' || strcasecmp((string) preg_replace('/^www\./i', '', $host), (string) preg_replace('/^www\./i', '', $site)) !== 0) {
            return $href;
        }
        $path = (string) parse_url($href, PHP_URL_PATH);
        $query = parse_url($href, PHP_URL_QUERY);
        $fragment = parse_url($href, PHP_URL_FRAGMENT);

        return ($path !== '' ? $path : '/').($query ? '?'.$query : '').($fragment ? '#'.$fragment : '');
    }

    /** A part's key on this page: `page:12:pricing:1`. */
    private function place(string $kind): string
    {
        $this->places[$kind] = ($this->places[$kind] ?? 0) + 1;

        return "page:{$this->page}:{$kind}:{$this->places[$kind]}";
    }

    /** Counted once per run, however many pages hold it. */
    private function count(string $type, string $key, string $reason): void
    {
        // A marker of its own, so "counted already" is not confused with "imported before".
        $marker = $type.'#counted';
        if ($this->ctx->map->has($marker, $key)) {
            return;
        }
        $this->ctx->map->plan($marker, $key);

        $exists = $this->ctx->map->get($type, $key) !== null;
        $this->ctx->report->count(self::STEP, $exists ? 'update' : 'create');
        $this->ctx->report->reason(self::STEP, 'info', $exists ? $reason.' (already here; kept as it is)' : $reason, $this->title);
    }

    /** @param  array<string, mixed>  $content */
    private static function validPricing(array $content): bool
    {
        $validator = Validator::make(['content' => $content], BlockRules::for(ContentBlockType::Pricing, 'three_tier'));
        $validator->after(fn ($v) => BlockRules::after($v, ContentBlockType::Pricing, 'three_tier', $content));

        return ! $validator->fails();
    }
}
