<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case SupportEngineer = 'support_engineer';
    case ContentManager = 'content_manager';
    case SeoManager = 'seo_manager';
    case CampaignManager = 'campaign_manager';

    /*
     * The store, and it is a role of its own for the same reason
     * `campaign_manager` is: blast radius rather than skill.
     *
     * This one holds prices, stock and the digital-code inventory — the three
     * things a mistake in cannot be taken back once somebody has paid. It is
     * deliberately narrower than `content_manager` rather than a superset:
     * whoever runs the shop has no business editing the blog, and whoever
     * edits the blog has no business changing what a switch costs.
     */
    case StoreManager = 'store_manager';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrator',
            self::SupportEngineer => 'Support engineer',
            self::ContentManager => 'Content manager',
            self::SeoManager => 'SEO manager',
            self::CampaignManager => 'Campaign manager',
            self::StoreManager => 'Store manager',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Admin => 'Full access to every module, including users and settings.',
            self::SupportEngineer => 'Tickets, customers and the knowledge base.',
            self::ContentManager => 'Pages, catalogue, blog, case studies and media.',
            self::SeoManager => 'SEO metadata, redirects and the sitemap.',
            self::CampaignManager => 'Newsletter subscribers, groups and campaigns. A send cannot be recalled.',
            self::StoreManager => 'The store: products, prices, stock, orders, coupons and digital codes.',
        };
    }
}
