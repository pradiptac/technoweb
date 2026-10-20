<?php

namespace App\Support\Presets;

use App\Models\ContentType;
use App\Models\NewsletterGroup;
use App\Support\CustomFields\CustomFields;
use Illuminate\Support\Str;

/**
 * The one list of content-type presets (docs/content-presets.md).
 *
 * A preset is the defaults of one or more content types and one field group
 * each; once installed it is an ordinary type the editor owns. The fields
 * marked `locked` are the ones a layout reads by key, so their key and kind
 * are fixed (`CustomFieldGroupRequest`).
 */
final class Presets
{
    /** The keys the presets strip installs by. The newsroom is two types. */
    public const INSTALL_KEYS = ['newsroom', 'investors', 'testimonials', 'awards'];

    /** The standing newsletter group investor alerts go to, found by this. */
    public const INVESTOR_GROUP_SOURCE = 'investors';

    /** @return array<string, array{label: string, blurb: string, types: list<array<string, mixed>>}> */
    public static function all(): array
    {
        return [
            'newsroom' => [
                'label' => 'Newsroom',
                'blurb' => 'Press releases with a dateline and a media contact, the coverage others have written about you, and a media kit.',
                'types' => [self::releases(), self::coverage()],
            ],
            'investors' => [
                'label' => 'Investors',
                'blurb' => 'Results, annual reports, filings and notices, grouped by financial year, with an email alert for subscribers.',
                'types' => [self::investors()],
            ],
            'testimonials' => [
                'label' => 'Testimonials',
                'blurb' => 'Quotes from customers with their name, role, company and photo — shown as cards, on the homepage and in any page.',
                'types' => [self::testimonials()],
            ],
            'awards' => [
                'label' => 'Awards',
                'blurb' => 'Awards and recognition by year, each with the awarding body and its badge.',
                'types' => [self::awards()],
            ],
        ];
    }

    /**
     * One type's definition by its type-level preset key.
     *
     * @return array<string, mixed>|null
     */
    public static function forType(string $preset): ?array
    {
        foreach (self::all() as $def) {
            foreach ($def['types'] as $type) {
                if ($type['preset'] === $preset) {
                    return $type;
                }
            }
        }

        return null;
    }

    /**
     * An investors type's document types, as `[{value, label}]`, read from
     * its locked field — the editor may rename or add options.
     *
     * @return list<array{value: string, label: string}>
     */
    public static function documentTypes(ContentType $type): array
    {
        $field = CustomFields::fieldsFor($type->target())['document_type'] ?? null;

        return array_values(array_filter(array_map(
            fn ($o) => is_array($o) && is_string($o['value'] ?? null) ? ['value' => $o['value'], 'label' => (string) ($o['label'] ?? $o['value'])] : null,
            $field?->options ?? [],
        )));
    }

    /**
     * The standing "Investor updates" group, found by `source` and created
     * if absent — never by name or slug, which an editor may change.
     */
    public static function investorGroup(): NewsletterGroup
    {
        return NewsletterGroup::firstOrCreate(['source' => self::INVESTOR_GROUP_SOURCE], [
            'name' => 'Investor updates',
            'slug' => Str::slug('Investor updates'),
            'description' => 'People who asked, on the investors page, to be emailed when a document is published.',
            'is_active' => true,
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $fields
     * @return array<string, mixed>
     */
    private static function type(string $preset, string $name, string $plural, string $slug, string $icon, string $schema, bool $body, bool $image, bool $pages, string $sort, int $perPage, array $fields): array
    {
        return [
            'preset' => $preset,
            'defaults' => [
                'name' => $name, 'plural' => $plural, 'slug' => $slug, 'icon' => $icon,
                'schema_type' => $schema, 'has_body' => $body, 'has_image' => $image,
                'archive_enabled' => true, 'entry_pages' => $pages, 'sort' => $sort, 'per_page' => $perPage,
            ],
            'fields' => $fields,
        ];
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private static function field(string $key, string $label, string $kind, bool $locked = true, bool $required = false, array $extra = []): array
    {
        return ['key' => $key, 'label' => $label, 'kind' => $kind, 'locked' => $locked, 'required' => $required, ...$extra];
    }

    /** @return array<string, mixed> */
    private static function releases(): array
    {
        return self::type('newsroom_releases', 'Press release', 'Press releases', 'newsroom', 'megaphone', 'Article', true, true, true, 'newest', 12, [
            self::field('dateline', 'Dateline', 'text', true, false, ['help' => 'The city the release is issued from, e.g. Kolkata.', 'settings' => ['max_length' => 60]]),
            self::field('release_pdf', 'Release as a PDF', 'file'),
            self::field('contact_name', 'Media contact (this release only)', 'text', false),
            self::field('contact_email', 'Media contact email', 'email', false),
            self::field('contact_phone', 'Media contact phone', 'text', false),
        ]);
    }

    /** @return array<string, mixed> */
    private static function coverage(): array
    {
        return self::type('newsroom_coverage', 'Coverage', 'In the news', 'in-the-news', 'ms:newspaper', 'WebPage', false, false, false, 'newest', 24, [
            self::field('publication', 'Publication', 'text', true, true),
            self::field('article_url', 'Link to the article', 'url', true, true),
            self::field('publication_logo', 'Publication logo', 'image'),
            self::field('coverage_date', 'Date of the article', 'date'),
        ]);
    }

    /** @return array<string, mixed> */
    private static function investors(): array
    {
        $types = ['Financial results', 'Annual report', 'Shareholding pattern', 'Board meeting outcome', 'Notice of meeting',
            'Corporate governance', 'Policy', 'Stock exchange filing', 'Other'];

        return self::type('investors', 'Investor document', 'Investors', 'investors', 'ms:monitoring', 'WebPage', false, false, false, 'newest', 100, [
            self::field('document_type', 'Document type', 'select', true, true, ['options' => array_map(
                fn ($l) => ['value' => Str::slug($l, '_'), 'label' => $l], $types)]),
            self::field('financial_year', 'Financial year', 'text', true, true, [
                'help' => 'Written as 2025-26.', 'settings' => ['max_length' => 7, 'pattern' => '^\d{4}-\d{2}$']]),
            self::field('document', 'Document', 'file', true, true),
            self::field('document_date', 'Date of the document', 'date'),
        ]);
    }

    /** @return array<string, mixed> */
    private static function testimonials(): array
    {
        return self::type('testimonials', 'Testimonial', 'Testimonials', 'testimonials', 'ms:format_quote', 'WebPage', false, false, false, 'manual', 24, [
            self::field('quote', 'Quote', 'textarea', true, true),
            self::field('role', 'Their role', 'text'),
            self::field('company', 'Company', 'text'),
            self::field('photo', 'Photo', 'image'),
            self::field('company_logo', 'Company logo', 'image'),
            self::field('featured', 'Featured', 'boolean', true, false, ['help' => 'The newest featured testimonial can stand on the homepage.']),
        ]);
    }

    /** @return array<string, mixed> */
    private static function awards(): array
    {
        return self::type('awards', 'Award', 'Awards', 'awards', 'ms:trophy', 'WebPage', false, false, false, 'newest', 48, [
            self::field('awarding_body', 'Awarding body', 'text', true, true),
            self::field('year', 'Year', 'number', true, true, ['settings' => ['min' => 1900, 'max' => 2100]]),
            self::field('category', 'Category', 'text'),
            self::field('badge', 'Badge', 'image'),
            self::field('link', 'Link', 'url'),
        ]);
    }
}
