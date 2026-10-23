<?php

namespace App\Support\Notifications;

use App\Models\User;

/**
 * Whether a person can open a console screen — the PHP twin of the console's
 * `screenRole()` (nav-items.tsx + nav-match.ts): SCREEN_GATES first, then the
 * longest matching NAV row, an administrator passing every gate (C2,
 * docs/notifications.md). Unlike the console, a path no row matches is
 * refused: a notification must point somewhere a row vouches for.
 * `AdminNavRolesTest` fails the moment the two lists disagree.
 */
final class ScreenAccess
{
    /** @var list<array{0: string, 1: ?string, 2: bool}> href, role gate, exact — the NAV array of nav-items.tsx */
    public const ROWS = [
        ['/admin', 'support_engineer', true],
        ['/admin/tickets', 'support_engineer', false],
        ['/admin/tickets/settings', 'admin', false],
        ['/admin/customers', 'support_engineer', false],
        ['/admin/customers/settings', 'admin', false],
        ['/admin/leads', 'sales_manager', false],
        ['/admin/leads/settings', 'admin', false],
        ['/admin/visits', 'sales_manager,support_engineer', false],
        ['/admin/visits/settings', 'admin', false],
        ['/admin/meetings', 'sales_manager,support_engineer', false],
        ['/admin/meetings/types', 'sales_manager', false],
        ['/admin/meetings/hosts', 'admin', false],
        ['/admin/my-meetings', 'meeting_host', false],
        ['/admin/meetings/settings', 'admin', false],
        ['/admin/newsletter', 'campaign_manager', false],
        ['/admin/newsletter/settings', 'admin', false],
        ['/admin/store', 'store_manager', true],
        ['/admin/store/orders', 'store_manager', false],
        ['/admin/store/returns', 'store_manager', false],
        ['/admin/store/products', 'store_manager', false],
        ['/admin/store/categories', 'store_manager', false],
        ['/admin/store/tags', 'store_manager', false],
        ['/admin/store/coupons', 'store_manager', false],
        ['/admin/store/reviews', 'store_manager', false],
        ['/admin/store/promo', 'store_manager', false],
        ['/admin/store/videos', 'store_manager', false],
        ['/admin/store/shipping', 'store_manager', false],
        ['/admin/store/invoicing', 'store_manager', false],
        ['/admin/store/stock', 'store_manager', false],
        ['/admin/store/reports', 'store_manager', false],
        ['/admin/store/settings', 'admin', false],
        ['/admin/messaging/templates', 'campaign_manager,store_manager', false],
        ['/admin/messaging/automations', 'campaign_manager,store_manager', false],
        ['/admin/messaging/broadcasts', 'campaign_manager,store_manager', false],
        ['/admin/messaging/contacts', 'campaign_manager,store_manager', false],
        ['/admin/messaging/settings', 'admin', false],
        ['/admin/chat', 'admin', true],
        ['/admin/chat/unanswered', 'admin', false],
        ['/admin/chat/conversations', 'admin', false],
        ['/admin/chat/settings', 'admin', false],
        ['/admin/blog', 'content_manager', false],
        ['/admin/blog-categories', 'content_manager', false],
        ['/admin/blog-comments', 'content_manager', false],
        ['/admin/blog/settings', 'admin', false],
        ['/admin/events', 'content_manager', false],
        ['/admin/events/settings', 'admin', false],
        ['/admin/tenders', 'content_manager', false],
        ['/admin/tenders/categories', 'content_manager', false],
        ['/admin/knowledge-base', 'content_manager', false],
        ['/admin/case-studies', 'content_manager', false],
        ['/admin/pages', 'content_manager', false],
        ['/admin/pages/library', 'content_manager', false],
        ['/admin/detail-templates', 'content_manager,store_manager', false],
        ['/admin/health', 'content_manager,store_manager,seo_manager', false],
        ['/admin/faqs', 'content_manager', false],
        ['/admin/downloads', 'content_manager', false],
        ['/admin/media', 'content_manager', false],
        ['/admin/media/settings', 'admin', false],
        ['/admin/health/settings', 'admin', false],
        ['/admin/team-members', 'content_manager', false],
        ['/admin/clients', 'content_manager', false],
        ['/admin/certifications', 'content_manager', false],
        ['/admin/custom-fields', 'content_manager', false],
        ['/admin/content-types', 'content_manager', false],
        ['/admin/content', 'content_manager', false],
        ['/admin/products', 'content_manager', false],
        ['/admin/product-categories', 'content_manager', false],
        ['/admin/brands', 'content_manager', false],
        ['/admin/solutions', 'content_manager', false],
        ['/admin/services', 'content_manager', false],
        ['/admin/service-categories', 'content_manager', false],
        ['/admin/industries', 'content_manager', false],
        ['/admin/jobs', 'content_manager', false],
        ['/admin/applications', 'support_engineer', false],
        ['/admin/menus', 'content_manager', false],
        ['/admin/sliders', 'content_manager', false],
        ['/admin/galleries', 'content_manager', false],
        ['/admin/popups', 'content_manager', false],
        ['/admin/blocks/cta', 'content_manager', false],
        ['/admin/blocks/stats', 'content_manager', false],
        ['/admin/blocks/pricing', 'content_manager', false],
        ['/admin/blocks/stack', 'content_manager', false],
        ['/admin/info-bar', 'admin', false],
        ['/admin/themes', 'admin', false],
        ['/admin/analytics', 'admin,seo_manager,content_manager', false],
        ['/admin/site/chrome', 'admin', false],
        ['/admin/support-centres', 'admin', false],
        ['/admin/site/settings', 'admin', false],
        ['/admin/forms', 'content_manager', false],
        ['/admin/seo', 'seo_manager', false],
        ['/admin/landing-pages', 'seo_manager', false],
        ['/admin/locations', 'seo_manager', false],
        ['/admin/redirects', 'seo_manager', false],
        ['/admin/not-found', 'seo_manager', false],
        ['/admin/seo/settings', 'admin', false],
        ['/admin/settings', 'admin', true],
        ['/admin/settings/email-templates', 'admin', false],
        ['/admin/users', 'admin', false],
        ['/admin/webhooks', 'admin', false],
        ['/admin/api-keys', 'admin', false],
        ['/admin/imports/wordpress', 'admin', false],
        ['/admin/imports/site', 'admin', false],
        ['/admin/backups', 'admin', false],
        ['/admin/backups/settings', 'admin', false],
        ['/admin/system/status', 'admin', false],
        ['/admin/system/updates', 'admin', false],
        ['/admin/activity', 'admin', false],
        ['/admin/client-errors', 'admin', false],
    ];

    /** @var list<array{0: string, 1: string}> regex, role gate — nav-items.tsx's SCREEN_GATES */
    public const GATES = [
        ['#^/admin/events/\d+/registrations$#', 'content_manager,sales_manager'],
    ];

    public static function can(User $user, string $path): bool
    {
        $path = (string) strtok($path, '?#');
        $path = $path === '/admin' ? $path : rtrim($path, '/');
        if ($path !== '/admin' && ! str_starts_with($path, '/admin/')) {
            return false;
        }

        foreach (self::GATES as [$pattern, $gate]) {
            if (preg_match($pattern, $path) === 1) {
                return self::permits($user, $gate);
            }
        }

        $best = null;
        foreach (self::ROWS as [$href, $gate, $exact]) {
            $hit = $path === $href || (! $exact && str_starts_with($path, $href.'/'));
            if ($hit && ($best === null || strlen($href) > strlen($best[0]))) {
                $best = [$href, $gate];
            }
        }

        return $best !== null && self::permits($user, $best[1]);
    }

    private static function permits(User $user, ?string $gate): bool
    {
        if ($gate === null || $user->isAdmin()) {
            return true;
        }

        return $user->hasRole(...explode(',', $gate));
    }
}
