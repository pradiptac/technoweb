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
         * It is deliberately the exact tag set that web/src/components/ui/prose.tsx
         * styles. A tag outside this list renders unstyled on the site even
         * when it is perfectly safe, so anything not listed here is something
         * an editor should not be able to produce.
         *
         * Notably absent and intentionally so: script, iframe, style, form,
         * input, and every event-handler attribute — HTMLPurifier drops
         * unlisted attributes, so no onerror/onclick can survive. It also
         * rejects javascript: and data: URIs on href and src by default,
         * which is why URI.AllowedSchemes is pinned rather than left open.
         */
        'cms' => [
            'HTML.Doctype' => 'HTML 4.01 Transitional',
            'HTML.Allowed' => implode(',', [
                'p', 'br',
                'h2', 'h3',
                'strong', 'em', 'code',
                'ul', 'ol', 'li',
                'blockquote',
                'a[href|title|rel|target]',
                'img[src|alt|width|height]',
                'table', 'thead', 'tbody', 'tr',
                'th[scope]', 'td',
            ]),

            // No inline styles at all. Presentation is the design system's
            // job; an editor pasting from Word must not be able to smuggle
            // colours and fonts into the page.
            'CSS.AllowedProperties' => '',

            'URI.AllowedSchemes' => ['http' => true, 'https' => true, 'mailto' => true],

            // Anything pointing off-site opens safely and does not leak the
            // referrer-window handle back to the opener.
            'HTML.TargetBlank' => true,
            'Attr.AllowedRel' => ['noopener', 'noreferrer', 'nofollow'],

            // Editors leave empty paragraphs behind constantly; strip them
            // rather than shipping vertical gaps into the article.
            'AutoFormat.RemoveEmpty' => true,
            'AutoFormat.RemoveEmpty.RemoveNbsp' => true,

            // The body arrives as HTML from CKEditor and is already
            // paragraph-wrapped; re-paragraphing it mangles the markup.
            'AutoFormat.AutoParagraph' => false,
        ],
    ],
];
