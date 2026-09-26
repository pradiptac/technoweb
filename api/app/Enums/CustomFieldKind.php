<?php

namespace App\Enums;

/**
 * What a custom field holds, which decides how it is validated, stored and
 * drawn. See `App\Support\CustomFields\CustomFields` for the rules per kind.
 *
 * The console's type select is built from `options()` — sent by the API as
 * `meta.kinds`, never listed in TypeScript, the rule `meta.transitions` and
 * `schema_type_options` follow.
 */
enum CustomFieldKind: string
{
    case Text = 'text';
    case Textarea = 'textarea';
    case RichText = 'rich_text';
    case Number = 'number';
    case Date = 'date';
    case Url = 'url';
    case Email = 'email';
    case Select = 'select';
    case MultiSelect = 'multi_select';
    case Boolean = 'boolean';
    case Image = 'image';
    case File = 'file';
    case Relation = 'relation';
    case List = 'list';

    public function label(): string
    {
        return match ($this) {
            self::Text => 'Text',
            self::Textarea => 'Long text',
            self::RichText => 'Rich text',
            self::Number => 'Number',
            self::Date => 'Date',
            self::Url => 'Link',
            self::Email => 'Email address',
            self::Select => 'Dropdown',
            self::MultiSelect => 'Checkboxes',
            self::Boolean => 'Yes / no',
            self::Image => 'Image',
            self::File => 'File',
            self::Relation => 'Linked record',
            self::List => 'List of short items',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Text => 'One line, up to 255 characters.',
            self::Textarea => 'Plain paragraphs, line breaks kept.',
            self::RichText => 'Formatted text, cleaned like every body on the site.',
            self::Number => 'A number, with an optional minimum and maximum.',
            self::Date => 'A calendar date, shown in Indian format.',
            self::Url => 'An http or https address.',
            self::Email => 'One email address.',
            self::Select => 'One choice from a list you define.',
            self::MultiSelect => 'Any number of choices from a list you define.',
            self::Boolean => 'Yes or no.',
            self::Image => 'A picture from the media library.',
            self::File => 'A document from the media library.',
            self::Relation => 'One record of a type you choose — a solution, a page, an entry.',
            self::List => 'A list of short strings, one per row.',
        };
    }

    /** Whether the field needs a list of options to mean anything. */
    public function hasOptions(): bool
    {
        return $this === self::Select || $this === self::MultiSelect;
    }

    /** Whether the stored value is a list rather than a scalar. */
    public function isList(): bool
    {
        return $this === self::MultiSelect || $this === self::List;
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** @return array<int, array{value: string, label: string, blurb: string, has_options: bool}> */
    public static function options(): array
    {
        return array_map(fn (self $k) => [
            'value' => $k->value,
            'label' => $k->label(),
            'blurb' => $k->blurb(),
            'has_options' => $k->hasOptions(),
        ], self::cases());
    }
}
