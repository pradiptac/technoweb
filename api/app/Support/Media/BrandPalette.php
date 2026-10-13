<?php

namespace App\Support\Media;

use App\Support\Colour;

/**
 * A logo's colours read three ways (0.173.0, `docs/theming.md` "Brand from a
 * logo"), each a candidate palette an editor can pick in one press.
 *
 * Three readings rather than one answer, because which colour of a logo *is*
 * the brand is a judgement: the one there is most of, the one that shouts
 * loudest, or the dark one the wordmark is set in. Each is offered with the
 * others and the editor decides.
 *
 * **It fills Primary, Secondary, Accent and the top bar, and never the
 * background or the text.** A logo says nothing about the page's ground, and
 * those two are what make a site unreadable.
 *
 * **Nothing here can ship a failing contrast**, and that is structural rather
 * than checked: every hex goes to the frontend's generator, where a typed hex
 * is hue intent and never a literal — it pushes each colour until it clears
 * WCAG AA exactly as it does for one an editor types, and `npm run themes`
 * gates that across thirty palettes. So this class chooses colours and makes
 * no promise about contrast.
 */
final class BrandPalette
{
    /**
     * How much colour a colour needs before it can be a brand colour, in
     * OKLCH chroma. Measured: `#f7f7f7` is 0.003 and `#808080` is 0, while
     * the palest brand colour the fifteen presets hold is over 0.05. So the
     * white, the black and the greys that are most of any logo are never
     * offered as a brand, which is what makes a black wordmark answer "there
     * is nothing to take" rather than painting the site grey.
     */
    public const MIN_CHROMA = 0.04;

    /** Secondary and Accent, where the logo does not have one, as the presets space them. */
    private const SECONDARY_TURN = 150.0;

    private const ACCENT_TURN = -40.0;

    /**
     * @param  list<array{hex: string, share: float}>  $colours  From `LogoColours::read()`.
     * @return array{readings: list<array{key: string, label: string, primary: string, secondary: string, accent: string, topbar: string, derived: bool}>, colours: list<array{hex: string, share: float}>}
     */
    public static function from(array $colours): array
    {
        $brand = array_values(array_filter(
            $colours,
            fn (array $colour) => Colour::chroma($colour['hex']) >= self::MIN_CHROMA,
        ));

        if ($brand === []) {
            return ['readings' => [], 'colours' => $colours];
        }

        // The bar carries white text, so the darkest brand colour is the one
        // that can. With only one brand colour it is left blank: blank means
        // the generator derives the bar from the brand in both schemes, and
        // writing Primary into it would throw that derivation away for
        // nothing.
        $topbar = count($brand) > 1 ? self::by($brand, fn (string $hex) => Colour::lightness($hex))[0] : '';

        $orders = [
            'used' => ['Most of the logo', array_column($brand, 'hex')],
            'bold' => ['The boldest colour', self::by($brand, fn (string $hex) => -Colour::chroma($hex))],
            'deep' => ['The darkest colour', self::by($brand, fn (string $hex) => Colour::lightness($hex))],
        ];

        $readings = [];
        $seen = [];

        foreach ($orders as $key => [$label, $order]) {
            $primary = $order[0];
            $derived = count($order) < 3;
            $secondary = $order[1] ?? Colour::rotate($primary, self::SECONDARY_TURN);
            $accent = $order[2] ?? Colour::rotate($primary, self::ACCENT_TURN);

            $reading = [
                'key' => $key,
                'label' => $label,
                'primary' => $primary,
                'secondary' => $secondary,
                'accent' => $accent,
                'topbar' => $topbar,
                'derived' => $derived,
            ];

            // Two readings of a two-colour logo come out the same; offering the
            // same tile twice asks the editor to choose between two identical
            // things.
            $fingerprint = $primary.$secondary.$accent.$topbar;

            if (in_array($fingerprint, $seen, true)) {
                continue;
            }

            $seen[] = $fingerprint;
            $readings[] = $reading;
        }

        return ['readings' => $readings, 'colours' => $colours];
    }

    /**
     * The brand colours ordered by a measure, smallest first, ties kept in
     * the order they arrived (which is by share).
     *
     * @param  list<array{hex: string, share: float}>  $brand
     * @param  callable(string): float  $measure
     * @return list<string>
     */
    private static function by(array $brand, callable $measure): array
    {
        $hexes = array_column($brand, 'hex');
        $keyed = [];

        foreach ($hexes as $i => $hex) {
            $keyed[] = ['hex' => $hex, 'at' => $i, 'by' => $measure($hex)];
        }

        usort($keyed, fn (array $a, array $b) => [$a['by'], $a['at']] <=> [$b['by'], $b['at']]);

        return array_column($keyed, 'hex');
    }
}
