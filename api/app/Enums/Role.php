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

    /*
     * The lead pipeline, and a role of its own on the same argument as the two
     * above: blast radius rather than skill.
     *
     * What it holds is every enquirer's name, telephone number and what they
     * are planning to spend -- a list of this company's prospects, which is
     * worth more to a competitor than anything else in the console. Whoever
     * writes the blog has no business reading it, and whoever works it has no
     * business editing the site.
     *
     * It is deliberately not `support_engineer`, though on a small desk the
     * same person will hold both. Support answers people who have already
     * bought; sales answers people who have not, and the day those become two
     * people is the day a role that conflated them has to be split anyway --
     * with the permission already granted to everyone who had the other job.
     */
    case SalesManager = 'sales_manager';

    /*
     * Who may host an online meeting (2026-09-29, docs/meetings.md).
     *
     * Not every staff member takes calls with customers, and the slot engine
     * offers a customer only the hosts who do — so eligibility is this role,
     * held **explicitly**: the administrator's implicit pass through every
     * role check does not make somebody a host, or every administrator would
     * be booked into calls they never agreed to take. A host who is neither
     * sales nor support reaches their own diary through "My meetings".
     */
    case MeetingHost = 'meeting_host';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrator',
            self::SupportEngineer => 'Support engineer',
            self::ContentManager => 'Content manager',
            self::SeoManager => 'SEO manager',
            self::CampaignManager => 'Campaign manager',
            self::StoreManager => 'Store manager',
            self::SalesManager => 'Sales manager',
            self::MeetingHost => 'Meeting host',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Admin => 'Full access to every module, including users and settings.',
            self::SupportEngineer => 'Tickets and saved replies, customers and their approval, job applications and engineer visits.',
            self::ContentManager => 'Pages, catalogue, blog, case studies and media.',
            self::SeoManager => 'SEO metadata, the sitemap, redirects, landing pages and places.',
            self::CampaignManager => 'Newsletter subscribers, groups and campaigns. A send cannot be recalled.',
            self::StoreManager => 'The store: products, prices, stock, orders, coupons and digital codes.',
            self::SalesManager => 'Leads and enquiries: the pipeline, follow-ups and everyone who has written in.',
            self::MeetingHost => 'Hosts online meetings with customers: offered for booking in their working hours, and sees their own meetings.',
        };
    }
}
