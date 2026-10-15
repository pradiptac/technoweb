<?php

namespace App\Support\SiteImport;

/**
 * The site's own name inside its page titles: "About us | Acme" and
 * "Contact — Acme" both end in it. Found as the segment most titles end (or
 * begin) with, and taken off each page's title so the SEO title and the page's
 * name are about the page.
 */
final class SiteName
{
    private const SEPARATORS = '/\s+[|\x{2013}\x{2014}\x{00B7}\x{00BB}:-]\s+/u';

    /**
     * @param  list<string>  $titles
     */
    public static function detect(array $titles): ?string
    {
        $titles = array_values(array_filter($titles));

        if (count($titles) < 2) {
            return null;
        }

        $ends = [];
        $starts = [];

        foreach ($titles as $title) {
            $parts = preg_split(self::SEPARATORS, $title) ?: [];

            if (count($parts) > 1) {
                $last = trim((string) end($parts));
                $first = trim($parts[0]);
                $ends[mb_strtolower($last)] = ($ends[mb_strtolower($last)] ?? 0) + 1;
                $starts[mb_strtolower($first)] = ($starts[mb_strtolower($first)] ?? 0) + 1;
            }
        }

        $need = max(2, (int) ceil(count($titles) * 0.6));

        foreach ([$ends, $starts] as $tally) {
            arsort($tally);
            $name = (string) array_key_first($tally);

            if ($name !== '' && reset($tally) >= $need) {
                // Back to the case it was written in.
                foreach ($titles as $title) {
                    foreach (preg_split(self::SEPARATORS, $title) ?: [] as $part) {
                        if (mb_strtolower(trim($part)) === $name) {
                            return trim($part);
                        }
                    }
                }
            }
        }

        return null;
    }

    public static function strip(string $title, ?string $name): string
    {
        $title = trim($title);

        if ($name === null || $name === '') {
            return $title;
        }

        $quoted = preg_quote($name, '/');
        $sep = '\s+[|\x{2013}\x{2014}\x{00B7}\x{00BB}:-]\s+';
        $stripped = (string) preg_replace('/'.$sep.$quoted.'$/iu', '', $title);
        $stripped = (string) preg_replace('/^'.$quoted.$sep.'/iu', '', $stripped);

        return trim($stripped) !== '' ? trim($stripped) : $title;
    }
}
