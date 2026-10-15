<?php

namespace App\Support;

use App\Enums\PageSectionType;
use App\Http\Controllers\Api\V1\ContentController;
use App\Models\DetailTemplate;
use App\Models\Industry;
use App\Models\SavedSection;
use App\Models\User;
use App\Support\PageSections\RecordSections;
use App\Support\PageSections\SectionPresenter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Validator;

/**
 * Detail-page templates (0.161.0, docs/page-builder.md "Detail templates").
 *
 * **The one list.** Which kinds of record can have a template, who owns each,
 * which record blocks each may place and what each calls them, the order the
 * page draws them in today, and which block takes which of the two little
 * settings — all here, sent to the console as options, never listed in
 * TypeScript.
 *
 * **The API never presents a record block's content.** A block is
 * `{id, type, data}`; the website draws it from the record the route already
 * loaded. What the API does present is the template's *ordinary* sections,
 * with the same presenter every builder surface uses.
 */
final class DetailTemplates
{
    /**
     * alias => the record kind's label, the staff role that owns it (the
     * `PreviewLinks` pattern: an administrator passes anyway), the noun a
     * sentence uses and the public cache tag a save purges.
     *
     * @var array<string, array{label: string, role: string, noun: string, tag: string}>
     */
    public const TYPES = [
        'solution' => ['label' => 'Solutions', 'role' => 'content_manager', 'noun' => 'solution', 'tag' => 'solutions'],
        'service' => ['label' => 'Services', 'role' => 'content_manager', 'noun' => 'service', 'tag' => 'services'],
        'industry' => ['label' => 'Industries', 'role' => 'content_manager', 'noun' => 'industry', 'tag' => 'industries'],
        'case_study' => ['label' => 'Case studies', 'role' => 'content_manager', 'noun' => 'case study', 'tag' => 'case-studies'],
        'product' => ['label' => 'Catalogue products', 'role' => 'content_manager', 'noun' => 'product', 'tag' => 'products'],
        'store_product' => ['label' => 'Shop products', 'role' => 'store_manager', 'noun' => 'shop product', 'tag' => 'store-products'],
        'blog_post' => ['label' => 'Blog posts', 'role' => 'content_manager', 'noun' => 'blog post', 'tag' => 'blog'],
    ];

    /** Record blocks a template may carry once (`record_body` exactly once). */
    public const REQUIRED = PageSectionType::RecordBody;

    /**
     * block => [alias => the label that kind of page knows it by]. A kind not
     * listed may not place the block (422 on `blocks.N.type`).
     *
     * @var array<string, array<string, string>>
     */
    public const BLOCKS = [
        'record_hero' => [
            'solution' => 'Heading and introduction', 'service' => 'Heading and introduction', 'industry' => 'Heading and introduction',
            'case_study' => 'Heading and client', 'product' => 'Heading, brand and SKU', 'store_product' => 'Heading and brand',
            'blog_post' => 'Article heading, author and picture',
        ],
        'record_body' => [
            'solution' => 'The problem and the overview', 'service' => 'Description', 'industry' => 'Description',
            'case_study' => 'The story', 'product' => 'Overview', 'store_product' => 'Details and applications',
            'blog_post' => 'Article body',
        ],
        'record_highlights' => [
            'solution' => 'Benefits', 'case_study' => 'Results', 'product' => 'Key features', 'store_product' => 'What you get',
        ],
        'record_specs' => ['product' => 'Specifications', 'store_product' => 'Specification'],
        'record_gallery' => ['product' => 'Pictures and details panel', 'case_study' => 'Cover picture'],
        'record_custom_fields' => [
            'solution' => 'Details', 'service' => 'Details', 'industry' => 'Details', 'case_study' => 'Details',
            'product' => 'Details', 'store_product' => 'Details', 'blog_post' => 'Details',
        ],
        'record_answer_blocks' => [
            'solution' => 'Answers', 'service' => 'Answers', 'industry' => 'Answers',
            'product' => 'Answers', 'store_product' => 'Answers', 'blog_post' => 'Answers',
        ],
        'record_faqs' => [
            'solution' => 'Questions', 'service' => 'Questions', 'industry' => 'Questions',
            'product' => 'Questions', 'store_product' => 'Questions', 'blog_post' => 'Questions',
        ],
        'record_related' => [
            'solution' => 'Technologies, hardware, industries and links', 'service' => 'Related links', 'industry' => 'Solutions and links',
            'case_study' => 'Related links and the way back', 'product' => 'Related hardware and links', 'store_product' => 'Suggestions and links',
            'blog_post' => 'Related stories, neighbours and links',
        ],
        'record_enquiry' => ['solution' => 'Enquiry form', 'service' => 'Enquiry form', 'product' => 'Request information'],
        'record_buy' => ['store_product' => 'Pictures and buy panel'],
        'record_downloads' => ['product' => 'Downloads', 'store_product' => 'Downloads'],
        'record_reviews' => ['store_product' => 'Reviews'],
        'record_comments' => ['blog_post' => 'Comments'],
    ];

    /**
     * The blocks in the order each kind's page draws them today — what
     * "Start from today's layout" seeds.
     *
     * @var array<string, list<string>>
     */
    public const TODAY = [
        'solution' => ['record_hero', 'record_body', 'record_highlights', 'record_custom_fields', 'record_answer_blocks', 'record_related'],
        'service' => ['record_hero', 'record_body', 'record_custom_fields', 'record_answer_blocks', 'record_related', 'record_enquiry'],
        'industry' => ['record_hero', 'record_body', 'record_custom_fields', 'record_answer_blocks', 'record_related'],
        'case_study' => ['record_hero', 'record_highlights', 'record_gallery', 'record_body', 'record_custom_fields', 'record_related'],
        'product' => ['record_hero', 'record_gallery', 'record_body', 'record_highlights', 'record_specs', 'record_downloads', 'record_custom_fields', 'record_answer_blocks', 'record_enquiry', 'record_related'],
        'store_product' => ['record_hero', 'record_buy', 'record_highlights', 'record_specs', 'record_body', 'record_downloads', 'record_custom_fields', 'record_answer_blocks', 'record_reviews', 'record_related'],
        'blog_post' => ['record_hero', 'record_body', 'record_custom_fields', 'record_answer_blocks', 'record_comments', 'record_related'],
    ];

    /**
     * Which block honours each setting, on which kinds of record: `heading` the
     * words over the block (where that kind's part draws any of its own),
     * `limit` how many entries a list shows. A setting a kind's part has no
     * use for is not offered for it.
     *
     * @var array<string, array<string, list<string>>>
     */
    public const FIELDS = [
        'heading' => [
            'record_highlights' => ['solution', 'case_study', 'product', 'store_product'],
            'record_specs' => ['product', 'store_product'],
            'record_custom_fields' => ['solution', 'service', 'industry', 'case_study', 'product', 'store_product', 'blog_post'],
            'record_downloads' => ['product', 'store_product'],
            'record_enquiry' => ['solution', 'service', 'product'],
        ],
        'limit' => [
            // Related hardware, "You may also like", related stories.
            'record_related' => ['product', 'store_product', 'blog_post'],
        ],
    ];

    /** @return list<string> */
    public static function aliases(): array
    {
        return array_keys(self::TYPES);
    }

    public static function knows(string $alias): bool
    {
        return isset(self::TYPES[$alias]);
    }

    /** Whether this staff member owns templates of this kind — an administrator owns them all. */
    public static function allows(User $user, string $alias): bool
    {
        $role = self::TYPES[$alias]['role'] ?? null;

        return $role !== null && ($user->isAdmin() || $user->hasRole($role));
    }

    /** @return list<string> the kinds this staff member may work on */
    public static function allowedFor(User $user): array
    {
        return array_values(array_filter(self::aliases(), fn (string $a) => self::allows($user, $a)));
    }

    /** @return list<string> the record block types one kind may place */
    public static function blockTypesFor(string $alias): array
    {
        return array_keys(array_filter(self::BLOCKS, fn (array $kinds) => isset($kinds[$alias])));
    }

    /**
     * What the console is told, beside the page builder's own options.
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        $described = collect(PageSectionType::recordOptions())->keyBy('value');

        $types = [];
        foreach (self::TYPES as $alias => $type) {
            $types[] = [
                'value' => $alias,
                'label' => $type['label'],
                'noun' => $type['noun'],
                'role' => $type['role'],
                'tag' => $type['tag'],
                'today' => self::TODAY[$alias],
                'blocks' => array_map(fn (string $block) => [
                    'value' => $block,
                    'label' => self::BLOCKS[$block][$alias],
                    'blurb' => $described[$block]['blurb'] ?? '',
                    'heading' => in_array($alias, self::FIELDS['heading'][$block] ?? [], true),
                    'limit' => in_array($alias, self::FIELDS['limit'][$block] ?? [], true),
                ], self::blockTypesFor($alias)),
            ];
        }

        return [
            'types' => $types,
            'required_block' => self::REQUIRED->value,
            'record_block_types' => PageSectionType::recordOptions(),
        ];
    }

    /**
     * The checks no rule can express: where a record block may go, that each
     * is placed once, that the body is placed and not hidden — on top of the
     * page builder's own, with what a record's body area cannot hold taken
     * out (the same sections `RecordSections` refuses).
     */
    public static function after(Validator $validator, string $alias, mixed $blocks): void
    {
        RecordSections::after($validator, $blocks, true);

        if (! is_array($blocks)) {
            return;
        }

        $noun = self::TYPES[$alias]['noun'] ?? 'record';
        $seen = [];
        $body = 0;

        foreach ($blocks as $i => $block) {
            $type = is_array($block) ? PageSectionType::tryFrom((string) ($block['type'] ?? '')) : null;
            if (! $type || ! $type->isRecordBlock()) {
                continue;
            }

            if (! isset(self::BLOCKS[$type->value][$alias])) {
                $validator->errors()->add("blocks.{$i}.type", "A {$noun} page has no “{$type->label()}” to place.");

                continue;
            }

            if (isset($seen[$type->value])) {
                $validator->errors()->add("blocks.{$i}.type", "“{$type->label()}” is already in this template; a page draws it once.");
            }
            $seen[$type->value] = true;

            if ($type === self::REQUIRED) {
                $body++;
                if (filter_var($block['hidden'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
                    $validator->errors()->add("blocks.{$i}.hidden", 'The record body cannot be hidden: without it the page would have no content.');
                }
            }
        }

        if ($body === 0) {
            $validator->errors()->add('blocks', 'Every template places the record body once — add it from “Add a section”.');
        }
    }

    private static function cacheKey(string $alias): string
    {
        return "detail_template.active.{$alias}";
    }

    public static function forget(string $alias): void
    {
        Cache::forget(self::cacheKey($alias));
    }

    /**
     * The active template of one kind, as `{id, blocks}` — held for five
     * minutes and forgotten on any change, because every public detail read
     * asks. `false` is cached too: most installs have none.
     *
     * @return array{id: int, blocks: list<array<string, mixed>>}|null
     */
    public static function active(string $alias): ?array
    {
        $found = Cache::remember(self::cacheKey($alias), 300, function () use ($alias) {
            // A page must not fail because its layout could not be looked up (a table not yet migrated, a dropped
            // connection): it is drawn as it is in code, and the reason is logged.
            try {
                $template = DetailTemplate::query()->where('type', $alias)->where('is_active', true)->first();
            } catch (\Throwable $e) {
                Log::warning('Detail template lookup failed: '.$e->getMessage());

                return false;
            }

            return $template ? ['id' => $template->id, 'blocks' => $template->blocks] : false;
        });

        return $found === false ? null : $found;
    }

    /**
     * The `detail_template` key of a public detail read: the ordinary sections
     * presented as everywhere, the record blocks passed as `{id, type, data}`.
     * Null when no template is active for the kind.
     *
     * @return array{id: int, sections: list<array<string, mixed>>}|null
     */
    public static function publicRead(string $alias): ?array
    {
        $active = self::active($alias);

        return $active === null ? null : self::present($active['id'], $active['blocks']);
    }

    /**
     * @param  list<array<string, mixed>>  $blocks  as stored
     * @return array{id: int, sections: list<array<string, mixed>>}
     */
    public static function present(int $id, array $blocks): array
    {
        return ['id' => $id, 'sections' => SectionPresenter::present($blocks, null, RecordSections::excluded())];
    }

    /**
     * The record kinds as the console's record picker reads them: alias =>
     * [model, title column] — the library's own list of the same seven.
     *
     * @return array{0: class-string<Model>, 1: string}|null
     */
    public static function recordModel(string $alias): ?array
    {
        return self::knows($alias) ? SavedSection::RECORDS[$alias] : null;
    }

    /**
     * A record's public detail read, whatever its status and without its
     * structured data — what the template preview draws the template around.
     * `PreviewLinks` covers six of the seven kinds; an industry has no share
     * link, so its read is asked for here.
     *
     * @return array<string, mixed>
     */
    public static function presentRecord(string $alias, Model $record, Request $request): array
    {
        if ($alias !== 'industry') {
            return PreviewLinks::present($alias, $record, $request);
        }

        /** @var Industry $record */
        $data = app(ContentController::class)->presentIndustry($record)->toResponse($request)->getData(true)['data'] ?? [];

        return array_diff_key($data, array_flip(['schema', 'faq_schema']));
    }
}
