<?php

namespace App\Support\PageSections;

use DOMDocument;
use DOMElement;
use DOMNode;
use Illuminate\Support\Str;

/**
 * A page body as builder sections (0.109.0, `docs/page-builder.md`, "From a
 * page's own content").
 *
 * A page written in the editor — or imported from a site whose layout cannot
 * be read — is one block of HTML. Switching it to the builder used to start
 * from an empty list, so the content seemed to vanish. This splits the body
 * into `rich_text` sections at its headings: each `<h2>` starts a section and
 * becomes its heading, and what came before the first one is a section of its
 * own. A body whose top level has no `<h2>` but at least two `<h3>`s is split
 * at those instead; a body with neither stays one section.
 *
 * Nothing is lost and nothing is guessed: the words, lists, tables and
 * pictures stay in each section's body exactly as they were. Two rules keep
 * every result saveable as it stands:
 *
 *  - **A heading with nothing under it** keeps its words as an `<h2>` in the
 *    body rather than becoming a section heading over an empty body, which
 *    the builder refuses ("Write the text for this section").
 *  - **At most `SectionRules::MAX_SECTIONS`**: past that, what is left joins
 *    the last section. A body over the `rich_text` limit is cut at its
 *    top-level elements, never inside one.
 *
 * The result is `SectionRules::normalise()`d, so it is exactly the stored
 * shape, ids included.
 */
final class BodySections
{
    /** Below the `rich_text` rule's 200,000, leaving room for the sanitiser to re-serialise. */
    private const MAX_BODY = 180000;

    /**
     * @return list<array<string, mixed>>
     */
    public static function fromHtml(?string $html): array
    {
        return SectionRules::normalise(self::raw($html));
    }

    /**
     * The sections before normalising: `{id, type, hidden, data}` rows.
     *
     * @return list<array<string, mixed>>
     */
    public static function raw(?string $html): array
    {
        $nodes = self::topLevel((string) $html);
        if ($nodes === []) {
            return [];
        }

        $level = self::splitLevel($nodes);

        // Chunks of [heading text|null, list of html strings].
        $chunks = [[null, []]];
        foreach ($nodes as $node) {
            $tag = $node instanceof DOMElement ? strtolower($node->tagName) : null;
            if ($level !== null && $tag === $level) {
                $chunks[] = [self::text($node), []];

                continue;
            }
            $markup = self::markup($node);
            if (trim(strip_tags($markup, '<img><iframe><table><hr>')) !== '') {
                $chunks[count($chunks) - 1][1][] = $markup;
            }
        }

        $sections = [];
        foreach ($chunks as [$heading, $parts]) {
            if ($parts === []) {
                // A heading over nothing: its words stay, inside the body.
                if ($heading !== null && $heading !== '') {
                    $sections[] = self::section(null, '<h2>'.e($heading).'</h2>');
                }

                continue;
            }
            foreach (self::cut($parts) as $n => $body) {
                $sections[] = self::section($n === 0 ? $heading : null, $body);
            }
        }

        return self::cap($sections);
    }

    /**
     * One section's data.
     *
     * @return array<string, mixed>
     */
    public static function section(?string $heading, string $body): array
    {
        $data = ['body' => $body];
        if ($heading !== null && $heading !== '') {
            $data['heading'] = Str::limit($heading, 157, '…');
        }

        return ['id' => (string) Str::uuid(), 'type' => 'rich_text', 'hidden' => false, 'data' => $data];
    }

    /**
     * At most `MAX_SECTIONS`: the rest joins the last one, whose heading
     * the joined sections' own headings follow as `<h2>`s.
     *
     * @param  list<array<string, mixed>>  $sections
     * @return list<array<string, mixed>>
     */
    public static function cap(array $sections): array
    {
        $max = SectionRules::MAX_SECTIONS;
        if (count($sections) <= $max) {
            return $sections;
        }

        $kept = array_slice($sections, 0, $max - 1);
        $rest = array_slice($sections, $max - 1);
        $first = array_shift($rest);
        $body = (string) ($first['data']['body'] ?? '');
        foreach ($rest as $section) {
            $heading = $section['data']['heading'] ?? null;
            $body .= ($heading ? '<h2>'.e($heading).'</h2>' : '').(string) ($section['data']['body'] ?? $section['data']['html'] ?? '');
        }
        $first['type'] = 'rich_text';
        $first['data'] = array_filter(['heading' => $first['data']['heading'] ?? null, 'body' => $body]);
        $kept[] = $first;

        return $kept;
    }

    /**
     * The body's top-level nodes, each a whole element (or a run of text).
     *
     * @return list<DOMNode>
     */
    private static function topLevel(string $html): array
    {
        if (trim($html) === '') {
            return [];
        }

        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="body-sections-root">'.$html.'</div>', LIBXML_NOERROR | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('body-sections-root');
        if (! $root) {
            return [];
        }

        $nodes = [];
        foreach ($root->childNodes as $node) {
            if ($node->nodeType === XML_TEXT_NODE && trim((string) $node->textContent) === '') {
                continue;
            }
            if ($node->nodeType === XML_COMMENT_NODE) {
                continue;
            }
            $nodes[] = $node;
        }

        return $nodes;
    }

    /** `h2`, or `h3` when there is no `h2` and at least two `h3`s, or null. @param list<DOMNode> $nodes */
    private static function splitLevel(array $nodes): ?string
    {
        $count = ['h2' => 0, 'h3' => 0];
        foreach ($nodes as $node) {
            if ($node instanceof DOMElement && isset($count[strtolower($node->tagName)])) {
                $count[strtolower($node->tagName)]++;
            }
        }

        return $count['h2'] > 0 ? 'h2' : ($count['h3'] > 1 ? 'h3' : null);
    }

    /**
     * Bodies no longer than `MAX_BODY`, cut between top-level elements.
     *
     * @param  list<string>  $parts
     * @return list<string>
     */
    private static function cut(array $parts): array
    {
        $bodies = [''];
        foreach ($parts as $part) {
            $i = count($bodies) - 1;
            if ($bodies[$i] !== '' && strlen($bodies[$i]) + strlen($part) > self::MAX_BODY) {
                $bodies[] = '';
                $i++;
            }
            $bodies[$i] .= $part;
        }

        return array_values(array_filter($bodies, fn ($b) => $b !== ''));
    }

    private static function text(DOMNode $node): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', (string) $node->textContent));
    }

    private static function markup(DOMNode $node): string
    {
        return $node->nodeType === XML_TEXT_NODE
            ? '<p>'.e(trim((string) $node->textContent)).'</p>'
            : (string) $node->ownerDocument?->saveHTML($node);
    }
}
