<?php

namespace App\Support;

/**
 * The site's own index pages, as things a menu item can point at.
 *
 * Every other `MenuItemType` resolves a **record** — a solution, a product, a
 * blog post — and gets a stable URL for free, because the record knows its own
 * slug and `Sluggable` writes a 301 when that changes. The index pages have no
 * record: `/blog`, `/products` and `/support` are Next routes, so the only way
 * to put one in a menu was a **custom link**, which is free text.
 *
 * That is a real gap rather than a tidy one. The site's current navigation is
 * almost entirely index pages — seven of the eight header links and most of the
 * footer — so building it in the console meant typing about thirty URLs by
 * hand, each of them a chance to ship a 404 into the header of every page. And
 * a typo is invisible: a custom link is pattern-checked for *shape*, so
 * `/blogs` saves perfectly happily.
 *
 * So they are an allowlist instead. An editor picks "Blog" from a dropdown, the
 * key is stored, and the path is resolved here at render time — which means a
 * route that ever moves is one line in this file rather than an unknown number
 * of hand-typed menu rows.
 *
 * **What belongs here and what does not.** These are the routes that exist in
 * `web/src/app/(marketing)` and answer 200 with no parameter. A page an editor
 * creates in the CMS is a `page` target and already resolves properly; it must
 * not be duplicated here, or the same page becomes two different things a menu
 * can point at. `/privacy`, `/terms`, `/downloads` and `/gallery` are exactly
 * that case and are deliberately absent.
 *
 * Two sides of one wire, as ever: this list and the Next route table are
 * hand-written in different languages, and nothing type-checks one against the
 * other. `MenuTest` asserts every path here is shaped like a path; only a
 * browser can prove one resolves, which is why `npm run audit` covers every one
 * of them.
 */
class SiteSection
{
    /**
     * The allowlist: key => [label, path].
     *
     * Grouped in the order somebody would look for them rather than
     * alphabetically — the shopfront and the catalogue first, then the things
     * a visitor reads, then the company.
     *
     * @var array<string, array{label: string, path: string}>
     */
    private const SECTIONS = [
        'home' => ['label' => 'Home', 'path' => '/'],

        'solutions' => ['label' => 'Solutions', 'path' => '/solutions'],
        'products' => ['label' => 'Products (catalogue)', 'path' => '/products'],
        // The shop is a different list from the catalogue above: that one is
        // what somebody researches a project from, this one is what can be
        // bought here and now. Both exist and neither is the other.
        'store' => ['label' => 'Store (shop)', 'path' => '/store'],
        'services' => ['label' => 'Web services', 'path' => '/services'],
        'industries' => ['label' => 'Industries', 'path' => '/industries'],
        'brands' => ['label' => 'Brands', 'path' => '/brands'],
        'locations' => ['label' => 'Locations', 'path' => '/locations'],

        'resources' => ['label' => 'Resources hub', 'path' => '/resources'],
        'blog' => ['label' => 'Blog', 'path' => '/blog'],
        'case_studies' => ['label' => 'Case studies', 'path' => '/case-studies'],
        'knowledge_base' => ['label' => 'Knowledge base', 'path' => '/knowledge-base'],

        'support' => ['label' => 'Support', 'path' => '/support'],
        'contact' => ['label' => 'Contact', 'path' => '/contact'],
        'about' => ['label' => 'About us', 'path' => '/about'],
        'careers' => ['label' => 'Careers', 'path' => '/careers'],

        // The portal. Its own pages redirect when signed out, which is correct
        // and is why they are offered: "Customer login" and "Submit a ticket"
        // are both in the footer today.
        'portal_login' => ['label' => 'Customer login', 'path' => '/portal/login'],
        'portal_register' => ['label' => 'Register for the portal', 'path' => '/portal/register'],
        'portal_tickets' => ['label' => 'Track a ticket', 'path' => '/portal/tickets'],
        'portal_new_ticket' => ['label' => 'Submit a ticket', 'path' => '/portal/tickets/new'],

        'cart' => ['label' => 'Basket', 'path' => '/cart'],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::SECTIONS);
    }

    public static function exists(string $key): bool
    {
        return isset(self::SECTIONS[$key]);
    }

    /** The path, or null for a key that is no longer in the list. */
    public static function path(string $key): ?string
    {
        return self::SECTIONS[$key]['path'] ?? null;
    }

    public static function label(string $key): ?string
    {
        return self::SECTIONS[$key]['label'] ?? null;
    }

    /**
     * The options, for the console's dropdown.
     *
     * Sent by the API rather than listed in TypeScript, the rule
     * `schema_type_options` and `meta.transitions` already follow: two
     * hand-written copies of one list of strings is exactly the drift nothing
     * type-checks across the wire.
     *
     * @return array<int, array{value: string, label: string, path: string}>
     */
    public static function options(): array
    {
        return array_map(
            fn (string $key) => [
                'value' => $key,
                'label' => self::SECTIONS[$key]['label'],
                // Shown beside the label, because "Products" and "Store" are
                // two words for something a client says interchangeably and
                // the path is what settles which one they mean.
                'path' => self::SECTIONS[$key]['path'],
            ],
            array_keys(self::SECTIONS),
        );
    }
}
