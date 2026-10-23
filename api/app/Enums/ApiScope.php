<?php

namespace App\Enums;

/**
 * What an API key may do on the `/ext` surface. The value is what is stored
 * in `api_keys.scopes` and shown to the person issuing a key, so a case is
 * renamed as carefully as a URL: a key holding a name that stops existing
 * silently loses that permission.
 */
enum ApiScope: string
{
    case LeadsRead = 'leads:read';
    case LeadsWrite = 'leads:write';
    case OrdersRead = 'orders:read';
    case CustomersRead = 'customers:read';
    case TicketsRead = 'tickets:read';
    case SubscribersRead = 'subscribers:read';
    case SubscribersWrite = 'subscribers:write';
    case ProductsRead = 'products:read';
    case StockWrite = 'stock:write';

    public function label(): string
    {
        return match ($this) {
            self::LeadsRead => 'Read leads',
            self::LeadsWrite => 'Create leads',
            self::OrdersRead => 'Read orders',
            self::CustomersRead => 'Read customers',
            self::TicketsRead => 'Read tickets',
            self::SubscribersRead => 'Read subscribers',
            self::SubscribersWrite => 'Add subscribers',
            self::ProductsRead => 'Read shop products',
            self::StockWrite => 'Update stock',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::LeadsRead => 'List and open leads, with their status and score.',
            self::LeadsWrite => 'Send a new lead in from another system.',
            self::OrdersRead => 'List and open shop orders, with their lines and totals.',
            self::CustomersRead => 'List and open portal customers.',
            self::TicketsRead => 'List and open support tickets. Internal notes are never included.',
            self::SubscribersRead => 'List newsletter subscribers and their status.',
            self::SubscribersWrite => 'Add subscribers to the newsletter list.',
            self::ProductsRead => 'List shop products with price and availability.',
            self::StockWrite => 'Set the stock level of a shop product or option.',
        };
    }

    /** @return array<int, array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $s) => ['value' => $s->value, 'label' => $s->label(), 'blurb' => $s->blurb()],
            self::cases(),
        );
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
