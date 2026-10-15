<?php

namespace App\Support\WordPress\Rendered;

use DOMElement;

/**
 * Something on a rendered WordPress page that has a section here: a price
 * table, a counter, a form. `claim()` answers a piece for an element it
 * knows — by the class or widget name a page builder gave it — or null, and
 * the walker then looks inside the element instead.
 */
interface Recogniser
{
    /** @param  bool  $opening  whether nothing has come before it on the page */
    public function claim(DOMElement $el, bool $opening): ?Piece;
}
