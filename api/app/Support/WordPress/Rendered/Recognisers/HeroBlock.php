<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * An opening banner with **no `<h1>`** (0.164.0): plenty of hand-written
 * sites set their headline in a `<div class="display-4">` or an `<h2>`. It is
 * a hero when it is the first thing on the page, its own class says what it
 * is (`hero`, `masthead`, `banner`, `jumbotron`, `intro`, `splash`,
 * `showcase`), it has a short largest line — an `<h2>`–`<h4>`, or an element
 * classed `title`/`headline`/`display`/`heading` — and a button, and, as for
 * `GenericHero` (whose accounting it shares), nothing in it would be lost.
 *
 * Asked after the WordPress builders' recognisers and `GenericHero`, so it
 * takes nothing they claim; a block with an `<h1>` is `GenericHero`'s, claimed
 * or not.
 */
final class HeroBlock implements Recogniser
{
    private const BANNER = '/^(hero|masthead|banner|jumbotron|intro|splash|showcase|page-header|page-title|cover)([-_].*)?$|(^|[-_])(hero|masthead|jumbotron)([-_]|$)/i';

    private const HEADLINE = '/(^|[-_])(title|headline|heading|display(-\d)?)([-_]|$)/i';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! $opening || ! in_array(strtolower($el->tagName), ['div', 'section', 'header', 'article'], true)
            || Structure::heading($el, 1, 1) !== null || ! $this->banner($el)) {
            return null;
        }

        $headline = Structure::heading($el, 2, 4) ?? $this->classed($el);

        if ($headline === null || Dom::text($headline) === '' || mb_strlen(Dom::text($headline)) > 160 || Structure::buttons($el) === []) {
            return null;
        }

        return Structure::hero($el, $headline);
    }

    /** Whether the block, or the one wrapper inside it, is classed as a banner. */
    private function banner(DOMElement $el): bool
    {
        if (Dom::has($el, self::BANNER)) {
            return true;
        }

        $kids = Structure::kids($el);

        return count($kids) === 1 && Dom::has($kids[0], self::BANNER);
    }

    /** The first element with no children of its own that is classed as a headline. */
    private function classed(DOMElement $el): ?DOMElement
    {
        foreach (Dom::descendants($el) as $node) {
            if (Dom::has($node, self::HEADLINE) && Structure::kids($node) === [] && Dom::text($node) !== '') {
                return $node;
            }
        }

        return null;
    }
}
