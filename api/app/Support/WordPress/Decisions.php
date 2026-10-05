<?php

namespace App\Support\WordPress;

use App\Models\NewsletterGroup;
use App\Models\NewsletterSequence;
use App\Support\Newsletter\CustomerGroupSync;
use App\Support\WordPress\Steps\ContentTypesStep;
use Illuminate\Validation\ValidationException;

/**
 * What the review asks a person to settle, and what it settled.
 *
 * `options()` is what the review screen draws: the choices with their
 * current value and the facts the choice turns on. `validate()` checks what
 * a `PATCH` sends back. The stored decisions live on `wordpress_imports.decisions`
 * and the steps read them through `Context::decision()`.
 *
 *  - **media_scope** — `referenced` (default: only files something imported
 *    shows) or `all`.
 *  - **tax_basis** — asked only when WooCommerce adds tax on top of its
 *    prices. This shop's prices include GST, so either GST is added to each
 *    price (`add_gst`, which changes every number) or the numbers are kept as
 *    they are (`keep`, which lowers every price by the tax). Neither is
 *    chosen silently; `keep` is the default because it changes nothing the
 *    person has not looked at.
 *  - **type_slugs** — the address each custom post type is imported at;
 *    blank leaves it out.
 *  - **acf_kinds** — per kind of record, per ACF field, the kind it becomes
 *    or `skip`.
 *  - **page_layout** — `sections` (default: each page laid out as builder
 *    sections from its WordPress blocks, or split at its headings) or `html`
 *    (one text body, as before 0.109.0).
 *
 * The newsletter notice is a fact rather than a choice: the client decided
 * imported customers join "Existing customers" like any other, and the
 * review names the sequences that will then email them.
 */
final class Decisions
{
    /** @return array<string, mixed> */
    public static function options(Context $ctx): array
    {
        return $ctx->memo('decisions', fn () => self::build($ctx));
    }

    /** @return array<string, mixed> */
    private static function build(Context $ctx): array
    {
        $import = $ctx->import;
        $site = $ctx->site();
        $out = [
            'media_scope' => [
                'value' => $ctx->decision('media_scope', 'referenced'),
                'library' => (int) (($site['harvest_counts'] ?? [])['media'] ?? 0),
            ],
        ];

        if ($site['woocommerce'] ?? false) {
            $currency = (string) $ctx->wc('woocommerce_currency', '');
            $out['currency'] = $currency;

            if ($currency !== '' && $currency !== 'INR') {
                $ctx->report->notice("The shop sells in {$currency}; this store sells in rupees only, so no prices, orders or coupons are imported.");
            }

            $addsTax = $ctx->wc('woocommerce_calc_taxes') === 'yes' && $ctx->wc('woocommerce_prices_include_tax') === 'no';

            if ($addsTax && array_intersect(['catalogue', 'customers'], $import->sections ?? [])) {
                $out['tax_basis'] = ['value' => $ctx->decision('tax_basis', 'keep'), 'choices' => ['keep', 'add_gst']];
            }
        }

        if ($import->wants('content')) {
            $out['page_layout'] = [
                'value' => $ctx->decision('page_layout', 'sections'),
                'pages' => (int) (($site['harvest_counts'] ?? [])['pages'] ?? 0),
            ];
        }

        if ($import->wants('custom')) {
            $out['content_types'] = [];

            foreach ((array) ($site['types'] ?? []) as $wpSlug => $type) {
                $slug = ContentTypesStep::slugFor($ctx, (string) $wpSlug);
                $mapped = $ctx->map->targetId('type', (string) $wpSlug) !== null;

                $out['content_types'][] = [
                    'source' => (string) $wpSlug,
                    'name' => (string) $type['name'],
                    'slug' => $slug,
                    'problem' => $mapped || $slug === '' ? null : ContentTypesStep::slugRefusal($slug),
                    'imported' => $mapped,
                    'entries' => (int) (($site['harvest_counts'] ?? [])['cpt:'.$wpSlug] ?? 0),
                ];
            }

            $out['acf'] = AcfValues::infer($ctx, self::acfSources($ctx));
            $out['acf_exposed'] = (bool) ($site['acf'] ?? false);

            if (($site['acf'] ?? false) && $out['acf'] === []) {
                $ctx->report->notice('ACF is installed but no values reached the REST API. In each field group switch on "Show in REST API", then scan again.');
            }
        }

        if ($import->wants('customers')) {
            $group = NewsletterGroup::query()->where('source', CustomerGroupSync::SOURCE)->first();
            $sequences = NewsletterSequence::query()
                ->where('status', 'active')
                ->where(fn ($q) => $q->whereNull('newsletter_group_id')->when($group, fn ($q) => $q->orWhere('newsletter_group_id', $group->id)))
                ->pluck('name')
                ->all();

            $out['newsletter'] = [
                'customers' => (int) (($site['harvest_counts'] ?? [])['customers'] ?? 0),
                'group' => CustomerGroupSync::NAME,
                'sequences' => $sequences,
            ];
        }

        return $out;
    }

    /**
     * The records whose ACF values are inferred, per custom-field target.
     *
     * @return array<string, iterable<array<string, mixed>>>
     */
    private static function acfSources(Context $ctx): array
    {
        $import = $ctx->import;
        $sources = [];

        if ($import->wants('content')) {
            $sources['blog_post'] = Harvest::read($import, 'posts');
            $sources['page'] = Harvest::read($import, 'pages');
        }

        foreach (array_keys((array) ($ctx->site()['types'] ?? [])) as $wpSlug) {
            $slug = ContentTypesStep::slugFor($ctx, (string) $wpSlug);

            if ($slug !== '') {
                $sources['entry:'.$slug] = Harvest::read($import, 'cpt:'.$wpSlug);
            }
        }

        if ($import->wants('catalogue')) {
            $sources['store_product'] = Harvest::read($import, 'products');
        }

        return $sources;
    }

    /**
     * The decisions a `PATCH` may set, checked. Unknown keys are dropped.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function validate(array $input): array
    {
        $out = [];

        if (array_key_exists('media_scope', $input)) {
            $out['media_scope'] = in_array($input['media_scope'], ['referenced', 'all'], true)
                ? $input['media_scope']
                : throw ValidationException::withMessages(['media_scope' => 'Choose the files something imported shows, or the whole library.']);
        }

        if (array_key_exists('page_layout', $input)) {
            $out['page_layout'] = in_array($input['page_layout'], ['sections', 'html'], true)
                ? $input['page_layout']
                : throw ValidationException::withMessages(['page_layout' => 'Choose builder sections or one text body.']);
        }

        if (array_key_exists('tax_basis', $input)) {
            $out['tax_basis'] = in_array($input['tax_basis'], ['keep', 'add_gst'], true)
                ? $input['tax_basis']
                : throw ValidationException::withMessages(['tax_basis' => 'Choose whether to add GST to the prices or keep the numbers.']);
        }

        if (array_key_exists('type_slugs', $input)) {
            $out['type_slugs'] = [];

            foreach ((array) $input['type_slugs'] as $wpSlug => $slug) {
                $slug = strtolower(trim((string) $slug));

                if ($slug !== '' && ! preg_match('/^[a-z][a-z0-9-]{0,59}$/', $slug)) {
                    throw ValidationException::withMessages(["type_slugs.{$wpSlug}" => 'An address must start with a letter and use only lowercase letters, numbers and hyphens.']);
                }

                $out['type_slugs'][(string) $wpSlug] = $slug;
            }
        }

        if (array_key_exists('acf_kinds', $input)) {
            $out['acf_kinds'] = [];

            foreach ((array) $input['acf_kinds'] as $target => $fields) {
                foreach ((array) $fields as $name => $kind) {
                    if (! in_array($kind, [...AcfValues::KINDS, 'skip'], true)) {
                        throw ValidationException::withMessages(["acf_kinds.{$target}.{$name}" => 'That is not a kind of field.']);
                    }

                    $out['acf_kinds'][(string) $target][(string) $name] = $kind;
                }
            }
        }

        return $out;
    }
}
