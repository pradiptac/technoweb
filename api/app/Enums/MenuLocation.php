<?php

namespace App\Enums;

/**
 * Where a menu can be rendered.
 *
 * The list the way `MailTransport` owns its list of transports: one enum that
 * the validation, the console's picker and the public endpoint all read, so
 * adding a location is a case here rather than a change in four files that
 * then have to agree. The frontend never enumerates these — it asks the API,
 * the same rule `schema_type_options` follows.
 */
enum MenuLocation: string
{
    case Primary = 'primary';
    case Footer = 'footer';

    public function label(): string
    {
        return match ($this) {
            self::Primary => 'Main navigation',
            self::Footer => 'Footer',
        };
    }

    /**
     * What the location does with the tree, said plainly, because the depth a
     * location renders is not something an editor can see until they have
     * built something it silently ignores.
     */
    public function hint(): string
    {
        return match ($this) {
            self::Primary => 'The header. Top-level items become the links across the bar; '
                .'their children fill the panel that drops down beneath one.',
            self::Footer => 'The footer. Top-level items become the column headings; '
                .'their children become the links under each.',
        };
    }

    /** How deep this location renders. Anything below is stored and ignored. */
    public function depth(): int
    {
        return 2;
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'hint' => $c->hint(),
            'depth' => $c->depth(),
        ], self::cases());
    }
}
