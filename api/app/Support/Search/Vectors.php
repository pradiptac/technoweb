<?php

namespace App\Support\Search;

/**
 * Embedding vectors as stored and compared (docs/semantic-search.md). Stored
 * unit-normalised as little-endian float32, so cosine similarity is a dot
 * product. Two vectors of different lengths (different models) score 0 rather
 * than throwing.
 */
final class Vectors
{
    /** @param  list<float>  $v  @return list<float> */
    public static function normalise(array $v): array
    {
        $length = sqrt(array_sum(array_map(fn (float $x) => $x * $x, $v)));

        return $length > 0 ? array_map(fn (float $x) => $x / $length, $v) : array_map(fn () => 0.0, $v);
    }

    /** @param  list<float>  $v */
    public static function pack(array $v): string
    {
        return pack('g*', ...$v);
    }

    /** @return list<float> */
    public static function unpack(string $bytes): array
    {
        return $bytes === '' ? [] : array_values(unpack('g*', $bytes));
    }

    /** @param  list<float>  $a  @param  list<float>  $b */
    public static function dot(array $a, array $b): float
    {
        if (count($a) !== count($b)) {
            return 0.0;
        }

        $sum = 0.0;
        foreach ($a as $i => $x) {
            $sum += $x * $b[$i];
        }

        return $sum;
    }
}
