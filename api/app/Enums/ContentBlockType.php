<?php

namespace App\Enums;

/**
 * The four kinds of content block, each with its own list of layouts.
 *
 * The value is also the shortcode's name — `[cta slug="…"]`, `[stats …]`,
 * `[pricing …]`, `[stack …]` — so renaming a case is a breaking change to
 * every body that embeds one.
 */
enum ContentBlockType: string
{
    case Cta = 'cta';
    case Stats = 'stats';
    case Pricing = 'pricing';
    case Stack = 'stack';

    public function label(): string
    {
        return match ($this) {
            self::Cta => 'CTA banner',
            self::Stats => 'Stat bar',
            self::Pricing => 'Pricing',
            self::Stack => 'Technology stack',
        };
    }

    public function plural(): string
    {
        return match ($this) {
            self::Cta => 'CTA banners',
            self::Stats => 'Stat bars',
            self::Pricing => 'Pricing tables',
            self::Stack => 'Technology stacks',
        };
    }

    /**
     * The layout enum that belongs to this type.
     *
     * @return class-string<CtaLayout|StatsLayout|PricingLayout|StackLayout>
     */
    public function layoutEnum(): string
    {
        return match ($this) {
            self::Cta => CtaLayout::class,
            self::Stats => StatsLayout::class,
            self::Pricing => PricingLayout::class,
            self::Stack => StackLayout::class,
        };
    }

    /** @return list<string> */
    public function layoutValues(): array
    {
        return array_map(fn ($c) => $c->value, ($this->layoutEnum())::cases());
    }

    /** @return list<array{value: string, label: string, plural: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'plural' => $c->plural(),
        ], self::cases());
    }
}
