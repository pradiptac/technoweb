<?php

namespace App\Enums;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Event;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\Solution;
use Illuminate\Database\Eloquent\Model;

/**
 * What a menu item can point at.
 *
 * Every case but `Custom` stores a **record reference**, never a URL, and
 * resolves to the record's current address when the menu is rendered. That is
 * the whole design rather than a detail of it: `Sluggable` writes a 301 on
 * every slug change precisely because slugs move, and a menu is on every page
 * of the site — a stale URL here is a 404 in the header, sitewide, from an
 * edit somebody made on a different screen. It is the same failure
 * `RepathsLandingPages` exists for, and this avoids it by not storing the
 * derived value at all.
 *
 * The values are the **morph map aliases** already registered in
 * `AppServiceProvider`, so there is one vocabulary for "which kind of record"
 * rather than a second list that has to be kept in step.
 */
enum MenuItemType: string
{
    case Custom = 'custom';

    /**
     * One of the site's own index pages, by key.
     *
     * The only case that is neither a record nor free text. `/blog`,
     * `/products` and `/support` are Next routes with nothing in the database
     * behind them, so before this the only way to put one in a menu was a
     * custom link — free text, pattern-checked for shape and nothing else, on
     * an element that renders on every page of the site. See
     * `App\Support\SiteSection`.
     */
    case Section = 'section';

    /**
     * A live list of the catalogue, by key — `solutions`, `services`,
     * `industries`, `product_categories`. Stores nothing but the key;
     * `MenuTree` expands it at render into what is published and ticked for
     * the menu at that moment, so a footer column keeps up with the
     * catalogue instead of freezing the day the menu was assigned. See
     * `App\Support\CatalogueList`.
     */
    case Catalogue = 'catalogue';
    case Page = 'page';
    case Solution = 'solution';
    case Service = 'service';
    case ServiceCategory = 'service_category';
    case Industry = 'industry';
    case ProductCategory = 'product_category';
    case Product = 'product';
    case BlogPost = 'blog_post';
    case CaseStudy = 'case_study';
    case KnowledgeArticle = 'knowledge_article';
    case LandingPage = 'landing_page';

    /**
     * An entry of a custom content type, and a type's archive
     * (docs/custom-content.md). Record references like the rest, so a slug
     * change on either moves the navigation with it.
     */
    case Entry = 'entry';
    case ContentType = 'content_type';

    /**
     * One event (docs/events.md) — "Register for the launch" in the header
     * for a month. A record reference like the rest, and dropped from the
     * menu the day the event is unpublished rather than left pointing at a
     * 404.
     */
    case Event = 'event';

    public function label(): string
    {
        return match ($this) {
            self::Custom => 'Custom link',
            self::Section => 'Site section',
            self::Catalogue => 'Live list',
            self::Page => 'Page',
            self::Solution => 'Solution',
            self::Service => 'Service',
            self::ServiceCategory => 'Service category',
            self::Industry => 'Industry',
            self::ProductCategory => 'Product category',
            self::Product => 'Product',
            self::BlogPost => 'Blog post',
            self::CaseStudy => 'Case study',
            self::KnowledgeArticle => 'Knowledge base article',
            self::LandingPage => 'Landing page',
            self::Entry => 'Custom content entry',
            self::ContentType => 'Custom content archive',
            self::Event => 'Event',
        };
    }

    /** The model class, or null for a custom link, which has no record. */
    public function model(): ?string
    {
        return match ($this) {
            self::Custom, self::Section, self::Catalogue => null,
            self::Page => Page::class,
            self::Solution => Solution::class,
            self::Service => Service::class,
            self::ServiceCategory => ServiceCategory::class,
            self::Industry => Industry::class,
            self::ProductCategory => ProductCategory::class,
            self::Product => Product::class,
            self::BlogPost => BlogPost::class,
            self::CaseStudy => CaseStudy::class,
            self::KnowledgeArticle => KnowledgeArticle::class,
            self::LandingPage => LandingPage::class,
            self::Entry => Entry::class,
            self::ContentType => ContentType::class,
            self::Event => Event::class,
        };
    }

    /**
     * The column holding the human name.
     *
     * Products, categories and industries are titled `name`; everything else
     * is `title`. That split is a fact about the schema this project already
     * documents, and getting it wrong yields a picker of empty labels.
     */
    public function titleColumn(): string
    {
        return match ($this) {
            self::Product, self::ProductCategory, self::Industry, self::ServiceCategory => 'name',
            self::ContentType => 'plural',
            default => 'title',
        };
    }

    /**
     * Where a record of this type lives on the public site.
     *
     * A landing page is absent deliberately: it stores a whole `path` of its
     * own, composed from other records, so there is no prefix to append a slug
     * to. `url()` handles it.
     */
    public function prefix(): ?string
    {
        return match ($this) {
            self::Custom, self::Section, self::Catalogue, self::LandingPage, self::Entry, self::ContentType, self::ServiceCategory => null,
            self::Page => '',
            self::Solution => '/solutions',
            self::Service => '/services',
            self::Industry => '/industries',
            // Both live under one segment — `/products/[slug]` resolves a
            // category or a product, which is a documented property of that
            // route rather than an accident.
            self::ProductCategory, self::Product => '/products',
            self::BlogPost => '/blog',
            self::CaseStudy => '/case-studies',
            self::KnowledgeArticle => '/knowledge-base',
            self::Event => '/events',
        };
    }

    /** The record's address today, or null when it can no longer be built. */
    public function url(?Model $record): ?string
    {
        if ($this === self::Custom || $record === null) {
            return null;
        }

        if ($this === self::LandingPage) {
            return $record->path ?? null;
        }

        // An archive is linkable while its type is switched on and has one;
        // an entry while it is published. Either answers its own path.
        if ($record instanceof ContentType) {
            return $record->is_active && $record->archive_enabled ? $record->publicPath() : null;
        }

        // A service category has no page of its own: it is a tab of the
        // Services page, opened by its fragment, while it is switched on.
        if ($record instanceof ServiceCategory) {
            return $record->is_active && filled($record->slug) ? '/services#'.$record->slug : null;
        }

        if ($record instanceof Entry) {
            return $record->isPublic() && $record->contentType?->is_active ? $record->publicPath() : null;
        }

        // An event is linkable while it is published; a draft or an
        // archived one is a 404, and a 404 in the header is on every page.
        if ($record instanceof Event) {
            return $record->isPublished() && filled($record->slug) ? $record->publicPath() : null;
        }

        // A record with no slug cannot be addressed. Returning null lets the
        // caller drop the item rather than emit a link to `/solutions/`.
        return blank($record->slug) ? null : $this->prefix().'/'.$record->slug;
    }

    /** The types an editor may pick from, sent by the API rather than listed
     *  in TypeScript — the same rule `schema_type_options` follows. */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'needs_record' => $c->model() !== null,
        ], self::cases());
    }
}
