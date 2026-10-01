<?php

namespace App\Support\Newsletter;

/**
 * A site's `robots.txt`, as far as a polite crawler needs it: the `Allow`
 * and `Disallow` rules for our agent (or for `*` when nothing names us),
 * decided by the longest matching rule, `Allow` winning a tie — Google's
 * reading, and the one most sites are written against. `*` and a closing
 * `$` are honoured; everything else in the file is ignored.
 *
 * A site with no `robots.txt`, or one that will not serve it, allows
 * everything; one that answers 401/403 for it is taken to allow nothing,
 * the conservative reading of a server that will not say.
 */
final class Robots
{
    /** @param  list<array{allow: bool, path: string}>  $rules */
    private function __construct(private readonly array $rules) {}

    public static function allowAll(): self
    {
        return new self([]);
    }

    public static function denyAll(): self
    {
        return new self([['allow' => false, 'path' => '/']]);
    }

    public static function parse(string $text, string $agent): self
    {
        $agent = strtolower($agent);
        $groups = [];
        $current = null;
        $lastWasAgent = false;

        foreach (preg_split('/\R/', $text) ?: [] as $line) {
            $line = trim((string) preg_replace('/#.*/', '', $line));

            if ($line === '' || ! str_contains($line, ':')) {
                continue;
            }

            [$field, $value] = array_map('trim', explode(':', $line, 2));
            $field = strtolower($field);

            if ($field === 'user-agent') {
                // Consecutive user-agent lines share one group.
                if (! $lastWasAgent) {
                    $groups[] = ['agents' => [], 'rules' => []];
                    $current = count($groups) - 1;
                }

                $groups[$current]['agents'][] = strtolower($value);
                $lastWasAgent = true;

                continue;
            }

            $lastWasAgent = false;

            if ($current !== null && in_array($field, ['allow', 'disallow'], true)) {
                // An empty Disallow allows everything; it is not a rule.
                if ($value !== '') {
                    $groups[$current]['rules'][] = ['allow' => $field === 'allow', 'path' => $value];
                }
            }
        }

        $mine = [];
        $star = [];

        foreach ($groups as $group) {
            foreach ($group['agents'] as $name) {
                if ($name === '*') {
                    $star = [...$star, ...$group['rules']];
                } elseif ($name !== '' && str_contains($agent, $name)) {
                    $mine = [...$mine, ...$group['rules']];
                }
            }
        }

        return new self($mine !== [] ? $mine : $star);
    }

    public function allows(string $url): bool
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?: '/');
        $query = parse_url($url, PHP_URL_QUERY);
        $target = $path.($query !== null && $query !== false ? '?'.$query : '');

        $best = null;
        $bestLength = -1;

        foreach ($this->rules as $rule) {
            if (self::matches($rule['path'], $target)) {
                $length = strlen($rule['path']);

                if ($length > $bestLength || ($length === $bestLength && $rule['allow'])) {
                    $best = $rule['allow'];
                    $bestLength = $length;
                }
            }
        }

        return $best ?? true;
    }

    /** @return list<array{allow: bool, path: string}> */
    public function rules(): array
    {
        return $this->rules;
    }

    /** @param  list<array{allow: bool, path: string}>  $rules */
    public static function fromRules(array $rules): self
    {
        return new self($rules);
    }

    private static function matches(string $pattern, string $target): bool
    {
        $anchored = str_ends_with($pattern, '$');
        $pattern = $anchored ? substr($pattern, 0, -1) : $pattern;
        $regex = '#^'.str_replace('\*', '.*', preg_quote($pattern, '#')).($anchored ? '$' : '').'#';

        return (bool) preg_match($regex, $target);
    }
}
