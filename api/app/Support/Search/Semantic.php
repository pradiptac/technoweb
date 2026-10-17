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

    /**
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}>
     */
    public static function match(string $phrase, array $aliases, int $limit = 50): array
    {
        $best = [];
        foreach (self::scored($phrase, $aliases) as $hit) {
            $key = $hit['subject_type'].':'.$hit['subject_id'];
            if (! isset($best[$key]) || $hit['score'] > $best[$key]['score']) {
                $best[$key] = $hit;
            }
        }

        usort($best, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($best, 0, $limit);
    }

    /**
     * The best passages themselves, for the assistant.
     *
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int, heading: string|null, text: string}>
     */
    public static function passages(string $phrase, array $aliases, int $limit): array
    {
        $hits = self::scored($phrase, $aliases);
        usort($hits, fn ($a, $b) => $b['score'] <=> $a['score']);
        $hits = array_slice($hits, 0, $limit);

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
     * @param  list<string>  $aliases
     * @return list<array{subject_type: string, subject_id: int, score: float, passage_id: int}>
     */
    private static function scored(string $phrase, array $aliases): array
    {
        $normal = self::normalise($phrase);

        if (! SemanticSettings::enabled() || mb_strlen(str_replace(['-', ' '], '', $normal)) < self::MIN_LENGTH || self::looksLikePartNumber($phrase) || $aliases === []) {
            return [];
        }

        $passages = SearchFile::load();
        if ($passages === []) {
            return [];
        }

        $query = self::queryVector($normal);
        if ($query === null) {
            return [];
        }

        $floor = SemanticSettings::floor();
        $wanted = array_flip($aliases);
        $hits = [];
        foreach ($passages as [$id, $alias, $subject, $vector]) {
            if (! isset($wanted[$alias])) {
                continue;
            }
            $score = Vectors::dot($query, $vector);
            if ($score >= $floor) {
                $hits[] = ['subject_type' => $alias, 'subject_id' => $subject, 'score' => $score, 'passage_id' => $id];
            }
        }

        return $hits;
    }

    /** @return list<float>|null */
    private static function queryVector(string $normal): ?array
    {
        $model = SemanticSettings::model();
        $hash = sha1($normal.'|'.$model);

        $cached = SearchQueryVector::query()->find($hash);
        if ($cached !== null) {
            $cached->forceFill(['last_used_at' => now()])->save();

            return Vectors::unpack((string) $cached->vector);
        }

        $todayKey = self::TODAY_KEY_PREFIX.now()->toDateString();
        Cache::add($todayKey, 0, now()->endOfDay());
        if ((int) Cache::get($todayKey) >= SemanticSettings::dailyCap()) {
            return null;
        }

        $vectors = Embeddings::embed([$normal], self::TIMEOUT);
        if ($vectors === null || ! isset($vectors[0])) {
            return null;
        }

        Cache::increment($todayKey);
        SearchQueryVector::query()->updateOrCreate(['hash' => $hash], ['model' => $model, 'vector' => Vectors::pack($vectors[0]), 'last_used_at' => now()]);

        return $vectors[0];
    }
}
