<?php

namespace App\Support\Search;

use App\Models\SearchPassage;
use App\Models\SearchQueryVector;
use Illuminate\Support\Facades\Cache;

/**
 * Search by meaning at search time (docs/semantic-search.md): the one entry
 * point. It answers [] — words only — whenever it should not or cannot help:
 * switched off, no key, nothing embedded, a short phrase or a part number, the
 * day's cap, a slow or refused call. The phrase is embedded once and cached
 * per model; each record keeps its best passage; anything under the floor is
 * noise.
 */
final class Semantic
{
    public const TIMEOUT = 1.5;

    public const MIN_LENGTH = 3;

    public const TODAY_KEY_PREFIX = 'search:phrases:';

    /** Set for a minute after the embeddings call fails, so an outage costs one wait, not one per search. */
    public const BACKOFF_KEY = 'search:embed-backoff';

    /**
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}>
     */
    public static function match(string $phrase, array $aliases, int $limit = 50): array
    {
        return self::scored($phrase, $aliases, $limit, true);
    }

    /**
     * The best passages themselves, for the assistant.
     *
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int, heading: string|null, text: string}>
     */
    public static function passages(string $phrase, array $aliases, int $limit): array
    {
        $hits = self::scored($phrase, $aliases, $limit, false);
        if ($hits === []) {
            return [];
        }

        $rows = SearchPassage::query()->whereKey(array_column($hits, 'passage_id'))->get(['id', 'heading', 'text'])->keyBy('id');

        $out = [];
        foreach ($hits as $h) {
            if (isset($rows[$h['passage_id']])) {
                $out[] = $h + ['heading' => $rows[$h['passage_id']]->heading, 'text' => (string) $rows[$h['passage_id']]->text];
            }
        }

        return $out;
    }

    public static function normalise(string $phrase): string
    {
        return trim(preg_replace('/\s+/u', ' ', preg_replace('/[^\p{L}\p{N}\s-]+/u', ' ', mb_strtolower($phrase)) ?? '') ?? '');
    }

    public static function looksLikePartNumber(string $phrase): bool
    {
        $phrase = trim($phrase);

        return ! str_contains($phrase, ' ') && preg_match('/\d/', $phrase) === 1 && preg_match('/[a-z]/i', $phrase) === 1;
    }

    /**
     * The best `$limit` hits, best first — one per record when `$perRecord`.
     * Scored in place over the file's bytes, one vector unpacked at a time,
     * keeping only the best few.
     *
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}>
     */
    private static function scored(string $phrase, array $aliases, int $limit, bool $perRecord): array
    {
        $normal = self::normalise($phrase);

        if (! SemanticSettings::enabled() || mb_strlen(str_replace(['-', ' '], '', $normal)) < self::MIN_LENGTH || self::looksLikePartNumber($phrase) || $aliases === [] || $limit < 1) {
            return [];
        }

        try {
            $bytes = SearchFile::load();
        } catch (\Throwable $e) {
            report($e);

            return [];
        }
        if ($bytes === '') {
            return [];
        }

        $query = self::queryVector($normal);
        if ($query === null) {
            return [];
        }

        $query = array_combine(range(1, count($query)), $query); // unpack() counts from 1
        $dims = count($query);
        $threshold = SemanticSettings::floor();
        $wanted = array_flip($aliases);
        $hits = [];

        foreach (SearchFile::records($bytes) as [$id, $alias, $subject, $offset, $length]) {
            if (! isset($wanted[$alias]) || $length !== $dims) {
                continue; // a vector of another length is another model's: it scores nothing
            }
            $vector = unpack('g'.$length, $bytes, $offset);
            $score = 0.0;
            for ($i = 1; $i <= $length; $i++) {
                $score += $vector[$i] * $query[$i];
            }
            if ($score < $threshold) {
                continue;
            }

            $key = $perRecord ? $alias.':'.$subject : $id;
            if (! isset($hits[$key]) || $score > $hits[$key]['score']) {
                $hits[$key] = ['subject_type' => $alias, 'subject_id' => $subject, 'score' => $score, 'passage_id' => $id];
            }

            // Pruned to the best `$limit` now and then; the bar only rises, so nothing pruned could come back into it.
            if (count($hits) >= $limit * 4) {
                $hits = self::best($hits, $limit);
                $threshold = max($threshold, end($hits)['score']);
            }
        }

        return array_values(self::best($hits, $limit));
    }

    /**
     * @param  array<array-key, array{subject_type: string, subject_id: int, score: float, passage_id: int}>  $hits
     * @return array<array-key, array{subject_type: string, subject_id: int, score: float, passage_id: int}>
     */
    private static function best(array $hits, int $limit): array
    {
        uasort($hits, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($hits, 0, $limit, true);
    }

    /** @return list<float>|null */
    private static function queryVector(string $normal): ?array
    {
        $model = SemanticSettings::model();
        $hash = sha1($normal.'|'.$model);

        $cached = SearchQueryVector::query()->find($hash);
        if ($cached !== null) {
            if ($cached->last_used_at->lt(now()->subHour())) {
                SearchQueryVector::query()->whereKey($hash)->update(['last_used_at' => now()]);
            }

            return Vectors::unpack((string) $cached->vector);
        }

        if (Cache::has(self::BACKOFF_KEY)) {
            return null;
        }

        $todayKey = self::TODAY_KEY_PREFIX.now()->toDateString();
        Cache::add($todayKey, 0, now()->endOfDay());
        if ((int) Cache::get($todayKey) >= SemanticSettings::dailyCap()) {
            return null;
        }

        $vectors = Embeddings::embed([$normal], self::TIMEOUT);
        if ($vectors === null || ! isset($vectors[0])) {
            Cache::put(self::BACKOFF_KEY, 1, 60);

            return null;
        }

        Cache::increment($todayKey);
        // Two first searches of one phrase can race; the loser's insert is ignored, never thrown.
        SearchQueryVector::query()->insertOrIgnore([['hash' => $hash, 'model' => $model, 'vector' => Vectors::pack($vectors[0]), 'last_used_at' => now()]]);

        return $vectors[0];
    }
}
