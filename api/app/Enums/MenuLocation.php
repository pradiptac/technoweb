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
 * Four locations, and **one of them renders one level**. The footer's bottom
 * row shares its line with the credit line and the scheme toggle and has
 * nowhere to put a dropdown. The top bar used to be counted with it, on the
 * argument that a 38px strip beside a telephone number and a search field is
 * no place for a panel — and then a top-bar item wanted a customer-zone
 * panel under it, tabs on the left and cards on the right, which is what a
 * utility bar on a large vendor's site does. So the top bar nests now, to the
 * same depth as the header, and `TopBarPanel` on the frontend renders it.
 * `depth()` says which and `hint()` says so in words, because the depth a
 * location renders is not something an editor can see until they have built
 * something it silently ignores.
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
                .'search field. Top-level items are the short links; an item with children '
                .'opens a panel — its children are the tabs down the left, and their children '
                .'the cards beside them. Children with nothing under them are shown as cards.',
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
     * The three nesting locations answer `MenuRequest::MAX_DEPTH` rather than a
     * literal, because that constant is the whole of the limit — the tree, the
     * resource and every renderer recurse without one, so a second number
     * here would be a second place to raise and the one nobody remembers.
     */
    public function depth(): int
    {
        return match ($this) {
            self::BottomBar => 1,
            self::TopBar, self::Primary, self::Footer => MenuRequest::MAX_DEPTH,
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
