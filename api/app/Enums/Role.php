<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case SupportEngineer = 'support_engineer';
    case ContentManager = 'content_manager';
    case SeoManager = 'seo_manager';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrator',
            self::SupportEngineer => 'Support engineer',
            self::ContentManager => 'Content manager',
            self::SeoManager => 'SEO manager',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Admin => 'Full access to every module, including users and settings.',
            self::SupportEngineer => 'Tickets, customers and the knowledge base.',
            self::ContentManager => 'Pages, catalogue, blog, case studies and media.',
            self::SeoManager => 'SEO metadata, redirects and the sitemap.',
        };
    }
}
