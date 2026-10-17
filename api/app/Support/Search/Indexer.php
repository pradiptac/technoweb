<?php

namespace App\Support\Search;

use App\Models\SearchPassage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Keeps one record's passages current (docs/semantic-search.md). A passage
 * whose text hash is unchanged keeps its vector; a new or changed one waits
 * (`embedded_at` null) and is embedded in the same pass when the call works;
 * passages past the new count go. A record no longer published loses them all.
 */
final class Indexer
{
    public static function index(Model $model): void
    {
        if (! SemanticSettings::enabled()) {
            return;
        }

        $alias = $model->getMorphClass();
        $id = (int) $model->getKey();

        // Before the record is read: Document reads FAQs with no status check, so a draft owner's questions must never get this far.
        if (! Indexable::isIndexed($model)) {
            self::forget($alias, $id);

            return;
        }

        $passages = Passages::split(Indexable::title($model), Document::sections($model));
        $model->unsetRelations();

        DB::transaction(function () use ($alias, $id, $passages) {
            $existing = SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->get()->keyBy('position');

            foreach ($passages as $position => $passage) {
                $hash = sha1($passage['text']);
                $row = $existing->get($position);

                if ($row !== null && $row->hash === $hash) {
                    continue;
                }

                SearchPassage::updateOrCreate(
                    ['subject_type' => $alias, 'subject_id' => $id, 'position' => $position],
                    ['heading' => $passage['heading'], 'text' => $passage['text'], 'hash' => $hash, 'model' => null, 'vector' => null, 'embedded_at' => null],
                );
            }

            SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->where('position', '>=', count($passages))->delete();
        });

        self::embedWaiting($alias, $id);
    }

    public static function forget(string $alias, int $id): void
    {
        if (SearchPassage::query()->where('subject_type', $alias)->where('subject_id', $id)->delete() > 0) {
            SearchFile::markStale();
        }
    }

    /** Embeds waiting passages (of one record, or any), in batches. @return int how many were embedded */
    public static function embedWaiting(?string $alias = null, ?int $id = null, int $limit = Embeddings::BATCH): int
    {
        if (! SemanticSettings::enabled()) {
            return 0;
        }

        $rows = SearchPassage::query()
            ->whereNull('embedded_at')
            ->when($alias !== null, fn ($q) => $q->where('subject_type', $alias)->where('subject_id', $id))
            ->orderBy('id')
            ->limit($limit)
            ->get();

        if ($rows->isEmpty()) {
            return 0;
        }

        $vectors = Embeddings::embed($rows->pluck('text')->all());

        if ($vectors === null) {
            return 0;
        }

        $model = SemanticSettings::model();
        foreach ($rows->values() as $i => $row) {
            $row->forceFill(['model' => $model, 'vector' => Vectors::pack($vectors[$i]), 'embedded_at' => now()])->save();
        }
        SearchFile::markStale();

        return $rows->count();
    }

    public static function markAllWaiting(): void
    {
        SearchPassage::query()->update(['embedded_at' => null]);
        SearchFile::markStale();
    }
}
