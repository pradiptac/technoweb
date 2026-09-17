<?php

namespace App\Support;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Certification;
use App\Models\Client;
use App\Models\JobOpening;
use App\Models\TeamMember;

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
    private const MEMO = 'site-section.has-content';

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
        'team' => ['label' => 'Our team', 'path' => '/team'],
        'clients' => ['label' => 'Clients', 'path' => '/clients'],
        'certifications' => ['label' => 'Certifications', 'path' => '/certifications'],
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
     * Whether the section's page has anything on it.
     *
     * The client's rule (2026-09-17): "add the page link if there is
     * content". A footer that offers "Our team" on an install with no team
     * members, or "Careers" with no open vacancy, links to a page that says
     * nothing — so a menu item pointing at one of these is **dropped at
     * render**, the way an item whose record was deleted is, and comes back
     * by itself the day somebody publishes the first row. Only the sections
     * whose page is a list of records that can genuinely be empty: the
     * catalogue and the shop are never empty on a real install, and the
     * fixed pages (About, Contact, Support) have no rows to count. Each is
     * the same query the public page runs to decide what to show, so the
     * link and the page agree by construction.
     *
     * Memoised for the request: a menu is one tree, but the primary, footer
     * and bottom menus can all name the same section on one render. On the
     * container rather than in a `static`, because a static survives from
     * one test's application to the next — the rule `Setting::get()`'s
     * memo already follows.
     */
    /** Drop the request's memo — a test that publishes a row and reads the menu again in the same application. */
    public static function forgetContent(): void
    {
        app()->forgetInstance(self::MEMO);
    }

    public static function hasContent(string $key): bool
    {
        /** @var \ArrayObject<string, bool> $memo */
        $memo = app()->bound(self::MEMO) ? app(self::MEMO) : app()->instance(self::MEMO, new \ArrayObject);

        if ($memo->offsetExists($key)) {
            return $memo[$key];
        }

        return $memo[$key] = match ($key) {
            'team' => TeamMember::published()->exists(),
            'clients' => Client::published()->exists(),
            'certifications' => Certification::live()->exists(),
            'careers' => JobOpening::published()->exists(),
            'case_studies' => CaseStudy::published()->exists(),
            'blog' => BlogPost::published()->exists(),
            default => true,
        };
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
