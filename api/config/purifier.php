<?php

/**
 * HTML sanitisation for CMS rich text. Consumed through App\Support\HtmlSanitiser,
 * never called directly — see that class for why this runs on write.
 *
 * @link http://htmlpurifier.org/live/configdoc/plain.html
 */
return [
    'encoding' => 'UTF-8',
    'finalize' => true,
    'ignoreNonStrings' => false,
    'cachePath' => storage_path('app/purifier'),
    'cacheFileMode' => 0755,

    'settings' => [
        /*
         * The 'cms' profile is the allowlist for every rich-text body in the
         * CMS: blog posts, knowledge-base articles, case studies, solutions,
         * services, industries and pages.
         *
         * It is deliberately the exact set the editor can produce and
         * web/src/components/ui/prose.tsx styles — those three have to agree,
         * and they are listed here in the order they must be changed. A tag
         * this list drops is a toolbar button that appears to work and does
         * nothing; a tag it admits that Prose does not style renders unstyled
         * on the live site. Both failures are silent, which is why the rule is
         * written down rather than left to be noticed.
         *
         * Notably absent and intentionally so: script, style, form, input,
         * object, embed, and every event-handler attribute — HTMLPurifier drops
         * unlisted attributes, so no onerror/onclick can survive. It also
         * rejects javascript: and data: URIs on href and src by default,
         * which is why URI.AllowedSchemes is pinned rather than left open.
         */
        'cms' => [
            'HTML.Doctype' => 'HTML 4.01 Transitional',
            'HTML.Allowed' => implode(',', [
                // h1 is absent: the page renders exactly one and it is the
                // record's title. A second in the body fails `npm run audit`
                // on every screen that shows it.
                'p[style]', 'br', 'hr',
                'h2[style]', 'h3[style]', 'h4[style]',
                'strong', 'em', 'u', 's', 'sub', 'sup', 'code', 'pre',
                /*
                 * `b`, `i` and `strike` are here because they are what the
                 * browser actually produces.
                 *
                 * The editor formats through `document.execCommand`, and Bold
                 * emits `<b>` — not `<strong>` — in every engine. Leaving them
                 * out does not make an editor write semantic markup; it makes
                 * the Bold button silently do nothing, which is measurably
                 * worse. `strike` is transformed by HTMLPurifier's own Tidy
                 * module into a span carrying `text-decoration:line-through`,
                 * so it never reaches the database as a deprecated element.
                 */
                'b', 'i', 'strike',
                /*
                 * Likewise `font`, which is what the colour, family and size
                 * buttons emit. It is not stored: HTMLPurifier's Tidy module
                 * rewrites `<font color face size>` into `<span style>` and
                 * the declaration is then validated property by property like
                 * any other. So the legacy element is an input format here,
                 * never an output one.
                 */
                'font[color|face|size]',
                // The carrier every one of the above is normalised into. It
                // holds nothing but a validated style declaration — see below.
                'span[style]',
                'ul[style]', 'ol[style]', 'li[style]',
                'blockquote[style]',
                'a[href|title|rel|target]',
                'img[src|alt|width|height|style]',
                'table[style]', 'thead', 'tbody', 'tfoot', 'tr',
                'th[scope|colspan|rowspan|style]', 'td[colspan|rowspan|style]',
                // Video. Constrained to two hosts by URI.SafeIframeRegexp
                // below — the element being allowed is not what makes this
                // safe, the regexp is.
                'iframe[src|width|height|frameborder]',
            ]),

            /*
             * Inline style is permitted, and only these properties.
             *
             * The editor's colour, font, size, alignment, indent, line-height
             * and image resize/float buttons all work by writing inline CSS,
             * so refusing style outright would make seven toolbar controls
             * appear to work and do nothing on save.
             *
             * This is an allowlist of *properties*, and HTMLPurifier parses
             * each declaration and validates the value against the property's
             * own grammar — a colour must be a colour, a length must be a
             * length. So `expression(...)`, `url(javascript:…)` and
             * `behavior:` are not rejected by being on a denylist; they are
             * rejected by not being valid values for anything listed.
             *
             * `position`, `z-index` and `display` are deliberately absent:
             * those are the properties that let body content escape its own
             * box and cover the page's chrome.
             */
            'CSS.AllowedProperties' => implode(',', [
                'color', 'background-color',
                'font-family', 'font-size', 'font-weight', 'font-style',
                'text-align', 'text-decoration', 'line-height',
                'margin-left', 'padding-left',
                'float', 'width', 'height',
            ]),

            /*
             * Level 'heavy', which is what actually normalises legacy markup.
             *
             * HTMLPurifier's Tidy fixes are banded, and every deprecated-tag
             * transform in Tidy_Transitional sits in the top band while the
             * shipped default is 'medium' — so `<font>` was simply *kept* as a
             * `<font>`, allowlisted and stored, which is the opposite of the
             * intent. At 'heavy' it is rewritten to a `<span style>` whose
             * declaration is then validated like any other, and the deprecated
             * element never reaches the database.
             *
             * `u` and `s` are removed from the fix list because their
             * transforms are a loss rather than a normalisation: both are real
             * elements this allowlist admits and Prose styles, and turning them
             * into spans carrying `text-decoration` would throw away the markup
             * in order to reproduce it. `strike` keeps its transform — that one
             * genuinely is deprecated, and `<s>` is what it becomes.
             */
            'HTML.TidyLevel' => 'heavy',
            'HTML.TidyRemove' => 'u,s',

            'URI.AllowedSchemes' => ['http' => true, 'https' => true, 'mailto' => true],

            /*
             * Video embeds, and the host check that makes them safe.
             *
             * An unchecked iframe src is somebody else's page running on this
             * origin — the same hazard the contact page's map embed and
             * App\Support\YouTube are each already written against. This is
             * HTMLPurifier's own mechanism for it: SafeIframe refuses any
             * iframe whose src does not match the regexp.
             *
             * The regexp is anchored (`^`) and the host is followed by `/`, so
             * `youtube.com.attacker.test` cannot pass — the same trap
             * App\Support\YouTube documents for str_contains. The optional
             * scheme group is not laxness: Summernote emits a protocol-relative
             * `//www.youtube.com/embed/…`, and a pattern requiring https would
             * silently drop every video the editor inserts.
             *
             * Two hosts, because each one is a decision about who may run code
             * in a frame on this origin, and it has to be given in three places
             * that agree: here, the editor's toolbar, and `frame-src` in
             * web/next.config.ts. Summernote's own list runs to nine.
             */
            'HTML.SafeIframe' => true,
            'URI.SafeIframeRegexp' => '%^(https?:)?//(www\.youtube(-nocookie)?\.com/embed/|player\.vimeo\.com/video/)%',

            // Anything pointing off-site opens safely and does not leak the
            // referrer-window handle back to the opener.
            'HTML.TargetBlank' => true,
            'Attr.AllowedRel' => ['noopener', 'noreferrer', 'nofollow'],

            // Editors leave empty paragraphs behind constantly; strip them
            // rather than shipping vertical gaps into the article. An <hr> is
            // an empty *token* rather than an empty element and is untouched,
            // and an <iframe> carrying a src is preserved by HTMLPurifier's
            // own default predicate.
            'AutoFormat.RemoveEmpty' => true,
            'AutoFormat.RemoveEmpty.RemoveNbsp' => true,

            // The body arrives as HTML from the editor and is already
            // paragraph-wrapped; re-paragraphing it mangles the markup.
            'AutoFormat.AutoParagraph' => false,
        ],
    ],
];
