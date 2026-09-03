<?php

namespace App\Enums;

use App\Http\Requests\MenuRequest;

/**
 * Where a menu can be rendered.
 *
 * The list the way `MailTransport` owns its list of transports: one enum that
 * the validation, the console's picker and the public endpoint all read, so
 * adding a location is a case here rather than a change in four files that
 * then have to agree. The frontend never enumerates these — it asks the API,
 * the same rule `schema_type_options` follows. Adding the two bars was one
 * case each plus a renderer, and the console's dropdown and its "Where menus
 * appear" cards both picked them up with nothing else changed.
 *
 * **The cases are in page order, top to bottom**, because that list is drawn
 * as a set of cards an editor reads down. The order of the cases is the order
 * of the dropdown; the stored value is the string, so re-ordering is free.
 *
 * Four locations, and **two of them render one level**. That is not an
 * oversight in the renderers: the top bar is a 38px strip beside a telephone
 * number and a search field, and the footer's bottom row shares its line with
 * the credit line and the scheme toggle. Neither has anywhere to put a
 * dropdown, and neither should — a utility strip that opens panels is the
 * header again, one bar higher up. `depth()` says so and `hint()` says so in
 * words, because the depth a location renders is not something an editor can
 * see until they have built something it silently ignores.
 */
enum MenuLocation: string
{
    case TopBar = 'topbar';
    case Primary = 'primary';
    case Footer = 'footer';
    case BottomBar = 'bottom';

    public function label(): string
    {
        return match ($this) {
            self::TopBar => 'Top bar',
            self::Primary => 'Main navigation',
            self::Footer => 'Footer',
            self::BottomBar => 'Footer bottom bar',
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
            self::TopBar => 'The dark strip above the header, beside the telephone number and the '
                .'search field. A flat list of short links — anything nested under one is '
                .'stored and not rendered.',
            self::Primary => 'The header. Top-level items become the links across the bar; '
                .'their children fill the panel that drops down beneath one.',
            self::Footer => 'The footer. Top-level items become the column headings; '
                .'their children become the links under each.',
            self::BottomBar => 'The bottom row of the footer, beside the copyright line. A flat '
                .'list — the legal and policy links. Anything nested under one is stored and '
                .'not rendered.',
        };
    }

    /**
     * How deep this location renders. Anything below is stored and ignored.
     *
     * The two nesting locations answer `MenuRequest::MAX_DEPTH` rather than a
     * literal, because that constant is the whole of the limit — the tree, the
     * resource and all three renderers recurse without one, so a second number
     * here would be a second place to raise and the one nobody remembers.
     */
    public function depth(): int
    {
        return match ($this) {
            self::TopBar, self::BottomBar => 1,
            self::Primary, self::Footer => MenuRequest::MAX_DEPTH,
        };
    }

    /**
     * The name given to a menu this location creates for itself.
     *
     * Here rather than in the controller that rebuilds: that read
     * `$where === self::Footer ? 'Footer navigation' : 'Primary navigation'`,
     * which is a ternary that was exhaustive over two cases and silently
     * wrong the moment there were four — a top bar rebuilt from nothing would
     * have been created as "Primary navigation".
     */
    public function defaultName(): string
    {
        return match ($this) {
            self::TopBar => 'Top bar',
            self::Primary => 'Primary navigation',
            self::Footer => 'Footer navigation',
            self::BottomBar => 'Footer bottom bar',
        };
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
