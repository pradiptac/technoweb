<?php

namespace App\Support\Newsletter;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;

/**
 * The addresses on one web page, with the name and the company the page puts
 * beside each, and the page's links (2026-09-27, the website crawl).
 *
 * Pure: HTML and a URL in, arrays out — no request, no database — so every
 * rule here is a unit test.
 *
 * **Where an address comes from**, in the order they are trusted:
 *
 *  - `mailto:` links. The link's own text is the person's name when it is
 *    not itself an address ("Priya Nair" → `priya@…`).
 *  - JSON-LD: a `Person` or an `Organization`/`LocalBusiness` with an
 *    `email`, which names both.
 *  - Cloudflare's email protection, which replaces every address on a page
 *    with an encoded `data-cfemail` (or a `/cdn-cgi/l/email-protection#…`
 *    link) and would otherwise hide all of them.
 *  - The visible text, with the usual disguises undone first:
 *    `name [at] firm [dot] in`, `name(at)firm.in`, `name at firm dot in`.
 *
 * **Which company.** A directory lists many businesses on one page, so the
 * page's own name is wrong for all of them. The company for an address is
 * the nearest heading in the block around it — climbing at most four
 * ancestors, the depth of a directory card — unless that heading is a
 * signpost ("Contact us", "Email") rather than a name; failing that the
 * page's company: its JSON-LD organisation, its `og:site_name`, the first
 * part of its `<title>`.
 *
 * **What is thrown away**: image and asset names that happen to contain an
 * `@` (`logo@2x.png`), the long hex addresses error trackers embed, and the
 * placeholders a template ships with (`you@example.com`).
 */
final class EmailExtractor
{
    private const EMAIL = '/[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,24}/i';

    private const ASSET_TLDS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'css', 'js', 'ico', 'bmp', 'tiff'];

    private const PLACEHOLDER_DOMAINS = ['example.com', 'example.org', 'example.net', 'domain.com', 'email.com', 'yourdomain.com', 'yoursite.com', 'company.com', 'sentry.io', 'wixpress.com', 'sentry-next.wixpress.com'];

    private const SIGNPOSTS = '/\b(contact|get in touch|reach us|email|e-mail|mail us|write to us|address|office|call us|support|enquir|inquir|follow us|connect|newsletter|subscribe|find us|location)\b/i';

    /**
     * @return array{company: ?string, emails: array<string, array{name: ?string, company: ?string}>}
     */
    public static function extract(string $html, string $url = ''): array
    {
        $dom = self::dom($html);

        if ($dom === null) {
            return ['company' => null, 'emails' => []];
        }

        $xpath = new DOMXPath($dom);
        $page = self::pageCompany($xpath);
        $found = [];

        $add = function (string $email, ?string $name, ?string $company) use (&$found, $page): void {
            $email = strtolower(trim($email));

            if (! self::acceptable($email)) {
                return;
            }

            $existing = $found[$email] ?? ['name' => null, 'company' => null];
            $found[$email] = [
                'name' => $existing['name'] ?? self::cleanName($name, $email),
                'company' => $existing['company'] ?? ($company ?: $page),
            ];
        };

        // 1. mailto: links.
        foreach ($xpath->query('//a[starts-with(translate(@href, "MAILTO", "mailto"), "mailto:")]') ?: [] as $a) {
            /** @var DOMElement $a */
            $target = rawurldecode(substr((string) $a->getAttribute('href'), 7));
            $target = explode('?', $target, 2)[0];

            foreach (preg_split('/[,;]/', $target) ?: [] as $email) {
                $add($email, trim($a->textContent), self::cardHeading($a));
            }
        }

        // 2. JSON-LD.
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $data = json_decode((string) $script->textContent, true);

            if (is_array($data)) {
                self::walkJsonLd($data, null, $add);
            }
        }

        // 3. Cloudflare's email protection.
        foreach ($xpath->query('//*[@data-cfemail]') ?: [] as $element) {
            /** @var DOMElement $element */
            if (($email = self::cfDecode((string) $element->getAttribute('data-cfemail'))) !== null) {
                $add($email, null, self::cardHeading($element));
            }
        }

        foreach ($xpath->query('//a[contains(@href, "/cdn-cgi/l/email-protection#")]') ?: [] as $a) {
            /** @var DOMElement $a */
            $hex = substr((string) strstr((string) $a->getAttribute('href'), '#'), 1);

            if (($email = self::cfDecode($hex)) !== null) {
                $name = trim($a->textContent);
                $add($email, str_contains($name, '[email') ? null : $name, self::cardHeading($a));
            }
        }

        // 4. The visible text, one text node at a time so each keeps its card.
        foreach ($xpath->query('//body//text()[not(ancestor::script) and not(ancestor::style) and not(ancestor::noscript)]') ?: [] as $text) {
            $plain = self::undisguise((string) $text->textContent);

            if (! str_contains($plain, '@')) {
                continue;
            }

            if (preg_match_all(self::EMAIL, $plain, $matches)) {
                foreach ($matches[0] as $email) {
                    $add($email, null, self::cardHeading($text->parentNode));
                }
            }
        }

        // …and once across the whole body, for a disguise split over elements.
        $body = ($xpath->query('//body') ?: null)?->item(0);

        if ($body !== null && preg_match_all(self::EMAIL, self::undisguise(self::visibleText($body)), $matches)) {
            foreach ($matches[0] as $email) {
                $add($email, null, null);
            }
        }

        return ['company' => $page, 'emails' => $found];
    }

    /**
     * Every link on the page, absolute, http(s) only, without its fragment.
     *
     * @return list<array{url: string, text: string}>
     */
    public static function links(string $html, string $base): array
    {
        $dom = self::dom($html);

        if ($dom === null) {
            return [];
        }

        $xpath = new DOMXPath($dom);
        $declared = ($xpath->query('//base[@href]') ?: null)?->item(0);

        if ($declared instanceof DOMElement) {
            $base = self::resolve($base, (string) $declared->getAttribute('href')) ?? $base;
        }

        $links = [];

        foreach ($xpath->query('//a[@href]') ?: [] as $a) {
            /** @var DOMElement $a */
            $url = self::resolve($base, trim((string) $a->getAttribute('href')));

            if ($url !== null) {
                $links[] = ['url' => $url, 'text' => trim(preg_replace('/\s+/', ' ', $a->textContent) ?? '')];
            }
        }

        return $links;
    }

    /** An absolute http(s) URL for `$href` read on `$base`, without a fragment, or null. */
    public static function resolve(string $base, string $href): ?string
    {
        if ($href === '' || str_starts_with($href, '#') || preg_match('/^(mailto|tel|javascript|data|sms|whatsapp|ftp):/i', $href)) {
            return null;
        }

        $href = explode('#', $href, 2)[0];
        $b = parse_url($base);

        if ($b === false || ! isset($b['scheme'], $b['host'])) {
            return null;
        }

        if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $href)) {
            $url = $href;
        } elseif (str_starts_with($href, '//')) {
            $url = $b['scheme'].':'.$href;
        } else {
            $origin = $b['scheme'].'://'.$b['host'].(isset($b['port']) ? ':'.$b['port'] : '');

            if (str_starts_with($href, '/')) {
                $path = $href;
            } elseif (str_starts_with($href, '?')) {
                $path = ($b['path'] ?? '/').$href;
            } else {
                $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');
                $path = $dir.$href;
            }

            $url = $origin.self::normalisePath($path);
        }

        $parts = parse_url($url);

        if ($parts === false || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host'])) {
            return null;
        }

        return strtolower($parts['scheme']).'://'.strtolower($parts['host'])
            .(isset($parts['port']) ? ':'.$parts['port'] : '')
            .self::normalisePath($parts['path'] ?? '/')
            .(isset($parts['query']) && $parts['query'] !== '' ? '?'.$parts['query'] : '');
    }

    /** Undo the usual ways of disguising an address from a crawler. */
    public static function undisguise(string $text): string
    {
        $text = str_replace(["\u{00a0}", '&#64;', '&#x40;'], [' ', '@', '@'], $text);
        $text = preg_replace('/\s*[\[\(\{<]\s*(?:at|@)\s*[\]\)\}>]\s*/i', '@', $text) ?? $text;
        $text = preg_replace('/\s*[\[\(\{<]\s*(?:dot|\.)\s*[\]\)\}>]\s*/i', '.', $text) ?? $text;

        // "priya at meridian dot in" — spelled out, both words present.
        return preg_replace_callback(
            '/\b([a-z0-9._%+\-]+)\s+at\s+([a-z0-9\-]+(?:\s+dot\s+[a-z0-9\-]+)+)\b/i',
            fn (array $m) => $m[1].'@'.preg_replace('/\s+dot\s+/i', '.', $m[2]),
            $text,
        ) ?? $text;
    }

    public static function acceptable(string $email): bool
    {
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 190) {
            return false;
        }

        [$local, $domain] = explode('@', $email, 2);
        $tld = strtolower((string) substr((string) strrchr($domain, '.'), 1));

        if (in_array($tld, self::ASSET_TLDS, true) || in_array($domain, self::PLACEHOLDER_DOMAINS, true)) {
            return false;
        }

        // An error tracker's key, not a person: 16+ hex characters and nothing else.
        if (preg_match('/^[a-f0-9]{16,}$/', $local)) {
            return false;
        }

        return ! in_array($local, ['you', 'your', 'yourname', 'your.name', 'name', 'email', 'user', 'someone', 'username', 'firstname.lastname'], true);
    }

    /** Cloudflare's scheme: the first byte is the key, every later byte XORed with it. */
    public static function cfDecode(string $hex): ?string
    {
        if (! preg_match('/^[0-9a-f]{4,}$/i', $hex) || strlen($hex) % 2 !== 0) {
            return null;
        }

        $key = hexdec(substr($hex, 0, 2));
        $email = '';

        for ($i = 2; $i < strlen($hex); $i += 2) {
            $email .= chr(hexdec(substr($hex, $i, 2)) ^ $key);
        }

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    private static function dom(string $html): ?DOMDocument
    {
        if (trim($html) === '') {
            return null;
        }

        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);

        try {
            // The XML prolog is the one reliable way to tell libxml the bytes are UTF-8.
            $loaded = $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        return $loaded ? $dom : null;
    }

    /** @param  array<mixed>  $node */
    private static function walkJsonLd(array $node, ?string $company, callable $add): void
    {
        $type = strtolower(implode(' ', (array) ($node['@type'] ?? '')));
        $name = is_string($node['name'] ?? null) ? trim($node['name']) : null;
        $isPerson = str_contains($type, 'person');
        $isOrganisation = ! $isPerson && preg_match('/organization|business|corporation|store|office|agency|company/', $type);

        if ($isOrganisation && $name !== null) {
            $company = $name;
        }

        $worksFor = is_array($node['worksFor'] ?? null) && is_string($node['worksFor']['name'] ?? null) ? $node['worksFor']['name'] : null;

        foreach ((array) ($node['email'] ?? []) as $email) {
            if (is_string($email)) {
                $email = preg_replace('/^mailto:/i', '', $email) ?? $email;
                $add($email, $isPerson ? $name : null, $worksFor ?? $company);
            }
        }

        foreach ($node as $key => $child) {
            if (is_array($child) && $key !== 'worksFor') {
                self::walkJsonLd($child, $company, $add);
            }
        }
    }

    private static function pageCompany(DOMXPath $xpath): ?string
    {
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $data = json_decode((string) $script->textContent, true);
            $name = is_array($data) ? self::organisationName($data) : null;

            if ($name !== null) {
                return $name;
            }
        }

        $site = ($xpath->query('//meta[@property="og:site_name"]/@content') ?: null)?->item(0)?->nodeValue;

        if (is_string($site) && trim($site) !== '') {
            return self::short(trim($site));
        }

        $title = trim((string) ($xpath->query('//title') ?: null)?->item(0)?->textContent);

        // The first part of the title that is not the page's own label:
        // "Contact — Anand Hardware" names Anand Hardware, not "Contact".
        foreach (preg_split('/\s[|–—\-:·]\s/u', $title) ?: [] as $part) {
            $part = trim($part);

            if ($part !== '' && ! preg_match(self::SIGNPOSTS, $part) && ! preg_match('/^(home|about( us)?|welcome|our team|team|people|staff|page \d+)$/i', $part)) {
                return self::short($part);
            }
        }

        return null;
    }

    /** @param  array<mixed>  $node */
    private static function organisationName(array $node): ?string
    {
        $type = strtolower(implode(' ', (array) ($node['@type'] ?? '')));

        if (is_string($node['name'] ?? null) && preg_match('/organization|business|corporation|store|office|agency|company/', $type) && ! str_contains($type, 'person')) {
            return self::short(trim($node['name']));
        }

        foreach ($node as $child) {
            if (is_array($child) && ($name = self::organisationName($child)) !== null) {
                return $name;
            }
        }

        return null;
    }

    /**
     * The heading of the block an address sits in: a directory card's
     * business name. Null when there is none within four ancestors, or when
     * the nearest is a signpost rather than a name.
     */
    private static function cardHeading(?DOMNode $node): ?string
    {
        $climb = 0;

        while ($node instanceof DOMElement && $climb < 4) {
            if (in_array(strtolower($node->nodeName), ['body', 'main', 'html'], true)) {
                return null;
            }

            foreach (['h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b'] as $tag) {
                foreach ($node->getElementsByTagName($tag) as $heading) {
                    $text = trim(preg_replace('/\s+/', ' ', $heading->textContent) ?? '');

                    if ($text === '' || str_contains($text, '@') || mb_strlen($text) > 120 || mb_strlen($text) < 2) {
                        continue;
                    }

                    return preg_match(self::SIGNPOSTS, $text) ? null : $text;
                }
            }

            $node = $node->parentNode;
            $climb++;
        }

        return null;
    }

    private static function cleanName(?string $name, string $email): ?string
    {
        $name = trim(preg_replace('/\s+/', ' ', (string) $name) ?? '');

        if ($name === '' || str_contains($name, '@') || mb_strlen($name) > 80 || preg_match(self::SIGNPOSTS, $name) || preg_match('/^(click|here|write|send|mail|email me)\b/i', $name)) {
            return null;
        }

        return $name;
    }

    private static function visibleText(DOMNode $node): string
    {
        $text = '';

        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement && in_array(strtolower($child->nodeName), ['script', 'style', 'noscript'], true)) {
                continue;
            }

            $text .= $child->nodeType === XML_TEXT_NODE ? $child->textContent : ' '.self::visibleText($child).' ';
        }

        return $text;
    }

    private static function short(string $text): string
    {
        return mb_substr($text, 0, 120);
    }

    private static function normalisePath(string $path): string
    {
        $out = [];

        foreach (explode('/', $path) as $segment) {
            if ($segment === '..') {
                array_pop($out);
            } elseif ($segment !== '.') {
                $out[] = $segment;
            }
        }

        $normal = implode('/', $out);

        return str_starts_with($normal, '/') ? $normal : '/'.$normal;
    }
}
