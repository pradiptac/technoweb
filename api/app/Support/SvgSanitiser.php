<?php

namespace App\Support;

use DOMAttr;
use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Strip everything a browser will *run* out of an uploaded SVG.
 *
 * An SVG is not an image as far as a browser is concerned — it is a document,
 * and opening one directly executes any script it carries. Media uploads land
 * on the public disk and are served straight back from the API origin, so an
 * unsanitised one is stored active content: the same class of hole
 * `HtmlSanitiser` exists to close for CMS bodies, on a file type nobody thinks
 * of as markup. `MediaController` has always carried a comment saying public
 * media excludes "no svg-as-document", with `svg` sitting in its allowlist
 * four lines below — the rule was written down and never implemented.
 *
 * **Rejecting SVG outright was the other option and is the wrong one here.**
 * Vector is the format brand logos and icons are actually published in, and
 * every one of the 33 placeholder images in this library is an SVG. An upload
 * form that refuses the format the content is in gets worked around, and the
 * workaround is somebody putting the file somewhere with no checks at all.
 *
 * **Allowlist, never a denylist.** The vectors are not a list anybody can
 * finish from memory: `script`, `on*`, `foreignObject` (arbitrary HTML),
 * `animate` targeting `href` (a link that turns into `javascript:` after the
 * check has passed), `use` pointing at a data URI, `style` carrying `@import`,
 * and an external DTD. Naming what may stay is the only version of this that
 * is safe against the vector nobody has written up yet.
 *
 * Returns null when the file is not parseable as XML, which the controller
 * turns into a 422 — an SVG the parser cannot read is one no browser should be
 * asked to.
 */
class SvgSanitiser
{
    /**
     * Elements that draw, group, or describe.
     *
     * Nothing that scripts, embeds or fetches: no `script`, `foreignObject`,
     * `image`, `use`, `handler`, `set`, `animate`, `iframe`, `audio`, `video`.
     */
    private const ELEMENTS = [
        'svg', 'g', 'defs', 'symbol', 'title', 'desc', 'metadata',
        'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
        'text', 'tspan',
        'lineargradient', 'radialgradient', 'stop', 'pattern',
        'clippath', 'mask', 'marker',
        'filter', 'fegaussianblur', 'feoffset', 'feblend', 'femerge', 'femergenode',
        'fecolormatrix', 'fecomposite', 'feflood', 'fedropshadow',
    ];

    /**
     * Presentation and geometry only.
     *
     * `href` and `xlink:href` are absent by design rather than by oversight:
     * every element that could legitimately carry one is already off the
     * element list, and a URL attribute is the single richest source of script
     * in this format. `style` is absent for the same reason — an inline
     * stylesheet can carry `url()` and `@import`, so it is a fetch primitive
     * wearing a presentation hat, and everything worth saying in it can be said
     * in the presentation attributes below.
     */
    private const ATTRIBUTES = [
        'id', 'class', 'xmlns', 'version', 'viewbox', 'preserveaspectratio',
        'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
        'width', 'height', 'd', 'points', 'transform', 'gradienttransform',
        'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
        'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
        'stroke-opacity', 'stroke-miterlimit', 'opacity', 'color',
        'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'spreadmethod',
        'font-family', 'font-size', 'font-weight', 'font-style',
        'text-anchor', 'dominant-baseline', 'letter-spacing', 'dx', 'dy',
        'clip-path', 'clip-rule', 'mask', 'filter', 'marker-start', 'marker-end',
        'patternunits', 'patterncontentunits', 'maskunits', 'clippathunits',
        'stddeviation', 'result', 'in', 'in2', 'mode', 'type', 'values',
        'flood-color', 'flood-opacity', 'operator',
        'aria-label', 'aria-hidden', 'role', 'lang',
    ];

    /** The sanitised document, or null if it could not be parsed. */
    public static function clean(string $svg): ?string
    {
        if (trim($svg) === '') {
            return null;
        }

        $document = new DOMDocument;
        $document->preserveWhiteSpace = false;

        /*
         * LIBXML_NONET blocks the network during entity resolution, and
         * LIBXML_NOENT is deliberately *not* passed so entities are never
         * substituted. Together they close the XXE half of this, which is a
         * file-read primitive rather than a script one and is exactly as bad.
         */
        $previous = libxml_use_internal_errors(true);
        $parsed = $document->loadXML($svg, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $parsed || ! $document->documentElement) {
            return null;
        }

        if (strtolower($document->documentElement->nodeName) !== 'svg') {
            return null;
        }

        // A DTD is how an external entity gets declared in the first place, and
        // nothing legitimate in an exported icon carries one.
        while ($document->doctype) {
            $document->removeChild($document->doctype);
        }

        /*
         * The root's own attributes, then everything beneath it.
         *
         * Easy to leave out, and the one it lets through is the worst of them:
         * `onload` on the `<svg>` element itself needs no interaction — the
         * file runs the moment its URL is opened. The first cut of this class
         * walked only the children and `SvgSanitiserTest` failed on exactly
         * that payload.
         */
        self::scrubAttributes($document->documentElement);
        self::scrub($document->documentElement);

        return $document->saveXML() ?: null;
    }

    /**
     * Depth-first, over a *copy* of the child list.
     *
     * `childNodes` is live: removing a node while walking it renumbers
     * everything after it, so a plain `foreach` silently skips every second
     * child — which on a crafted file is how a `script` element survives a
     * sanitiser that reads as correct.
     */
    private static function scrub(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof DOMElement) {
                if (! in_array(self::localName($child->nodeName), self::ELEMENTS, true)) {
                    $node->removeChild($child);

                    continue;
                }

                self::scrubAttributes($child);
                self::scrub($child);

                continue;
            }

            // Comments carry nothing worth keeping, and a processing
            // instruction is a documented way to attach a stylesheet.
            if ($child->nodeType === XML_COMMENT_NODE || $child->nodeType === XML_PI_NODE) {
                $node->removeChild($child);
            }
        }
    }

    private static function scrubAttributes(DOMElement $element): void
    {
        foreach (iterator_to_array($element->attributes) as $attribute) {
            /** @var DOMAttr $attribute */
            $name = self::localName($attribute->nodeName);

            if (str_starts_with($name, 'on') || ! in_array($name, self::ATTRIBUTES, true)) {
                $element->removeAttributeNode($attribute);
            }
        }
    }

    /**
     * The name without its prefix.
     *
     * A namespaced spelling is how a blocked name gets back in: `xlink:href`
     * is not the string `href`, and both reach the same handler in a browser.
     * Comparing the local name means a prefix cannot be used to smuggle one
     * past the list.
     */
    private static function localName(string $name): string
    {
        $name = strtolower($name);

        return str_contains($name, ':') ? substr($name, strrpos($name, ':') + 1) : $name;
    }
}
