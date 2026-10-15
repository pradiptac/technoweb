<?php

namespace App\Enums;

/**
 * Who may fetch a download's file (docs/downloads.md).
 *
 * Two answers and no more: everybody, or a signed-in customer. A finer rule —
 * per company, per contract — would be a second permission system beside the
 * portal's one, and nothing in the brief asks for it.
 */
enum DownloadAccess: string
{
    case Public = 'public';
    case Customers = 'customers';

    public function label(): string
    {
        return match ($this) {
            self::Public => 'Everyone',
            self::Customers => 'Customers only',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Public => 'Anybody who opens the page can download it.',
            self::Customers => 'Listed for everybody, downloadable only by a customer signed in to the portal.',
        };
    }

    /** @return array<int, array{value: string, label: string, blurb: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $a) => ['value' => $a->value, 'label' => $a->label(), 'blurb' => $a->blurb()],
            self::cases(),
        );
    }
}
