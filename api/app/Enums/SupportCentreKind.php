<?php

namespace App\Enums;

/** What a support centre is (docs/support-network.md). */
enum SupportCentreKind: string
{
    case ServiceCentre = 'service_centre';
    case Office = 'office';
    case Partner = 'partner';

    public function label(): string
    {
        return match ($this) {
            self::ServiceCentre => 'Service centre',
            self::Office => 'Office',
            self::Partner => 'Service partner',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::ServiceCentre => 'Our own engineers work from here; bring equipment in or call out.',
            self::Office => 'A sales or head office.',
            self::Partner => 'An authorised partner who services on our behalf.',
        };
    }

    /**
     * @return array<int, array{value: string, label: string, blurb: string}>
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
