<?php

namespace App\Support\Fonts;

/**
 * Google's font families, as committed in resources/google-fonts.json
 * (web/scripts/build-google-fonts.mjs). Read here so an editor's search never
 * calls Google, and so the file never reaches a browser bundle.
 */
final class GoogleFontCatalogue
{
    /** @var list<array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}>|null */
    private static ?array $rows = null;

    /** @return list<array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}> */
    public static function all(): array
    {
        return self::$rows ??= json_decode((string) file_get_contents(resource_path('google-fonts.json')), true) ?: [];
    }

    public static function slug(string $family): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($family)), '-');
    }

    /** @return array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}|null */
    public static function find(string $slug): ?array
    {
        foreach (self::all() as $row) {
            if ($row['slug'] === $slug) {
                return $row;
            }
        }

        return null;
    }

    /** @return array{data: list<array{family:string,slug:string,category:string,weights:list<int>,subsets:list<string>}>, total: int} */
    public static function search(string $q, ?string $category, int $page, int $per = 40): array
    {
        $q = strtolower(trim($q));
        $rows = array_values(array_filter(self::all(), fn (array $r) => ($category === null || $r['category'] === $category)
            && ($q === '' || str_contains(strtolower($r['family']), $q))));

        if ($q !== '') {
            // Prefix matches first, popularity order kept within each group
            // (usort is stable since PHP 8).
            usort($rows, fn (array $a, array $b) => (int) ! str_starts_with(strtolower($a['family']), $q)
                <=> (int) ! str_starts_with(strtolower($b['family']), $q));
        }

        return ['data' => array_slice($rows, ($page - 1) * $per, $per), 'total' => count($rows)];
    }
}
