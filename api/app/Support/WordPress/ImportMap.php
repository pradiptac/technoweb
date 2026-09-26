<?php

namespace App\Support\WordPress;

use App\Models\WordPressImportMapping;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * Which record here each source record became, for one site.
 *
 * Read in three ways. A step asks it whether a source record has been
 * imported before (a second run *updates* rather than copies). A later step
 * asks where an earlier one put something (an order line's product, a post's
 * featured image). And the link rewriter and redirect writer read every row
 * with a `source_url`, to turn the old site's addresses into ours.
 *
 * **In a dry run nothing is written, so later steps would find nothing.** A
 * step planning a create therefore calls `plan()`, which remembers the
 * source record as *going to exist*; `has()` answers true for both, which is
 * what lets an order line say "the product will be there" in the preview
 * exactly as it will in the commit. `targetId()` answers only for records
 * that really exist.
 *
 * Rows are loaded per source type on first use and held for the run: an
 * order step asks about products thousands of times.
 */
final class ImportMap
{
    /** @var array<string, array<string, array{type: string, id: int, url: ?string}>> */
    private array $rows = [];

    /** @var array<string, array<string, true>> */
    private array $planned = [];

    public function __construct(private readonly string $site, private readonly ?int $importId = null) {}

    /** @return ?array{type: string, id: int, url: ?string} */
    public function get(string $sourceType, int|string $sourceId): ?array
    {
        $this->load($sourceType);

        return $this->rows[$sourceType][(string) $sourceId] ?? null;
    }

    public function targetId(string $sourceType, int|string $sourceId): ?int
    {
        return $this->get($sourceType, $sourceId)['id'] ?? null;
    }

    /**
     * The record a source record became, if it still exists here.
     *
     * @template T of Model
     *
     * @param  class-string<T>  $class
     * @return ?T
     */
    public function model(string $sourceType, int|string $sourceId, string $class): ?Model
    {
        $id = $this->targetId($sourceType, $sourceId);

        return $id === null ? null : $class::query()->find($id);
    }

    public function has(string $sourceType, int|string $sourceId): bool
    {
        return $this->get($sourceType, $sourceId) !== null || isset($this->planned[$sourceType][(string) $sourceId]);
    }

    public function plan(string $sourceType, int|string $sourceId): void
    {
        $this->planned[$sourceType][(string) $sourceId] = true;
    }

    /** @return array<string, list<string>> what a dry run has planned, to carry to its next slice */
    public function planned(): array
    {
        return array_map(fn ($ids) => array_map('strval', array_keys($ids)), $this->planned);
    }

    /** @param  array<string, list<string>>  $planned */
    public function restorePlanned(array $planned): void
    {
        foreach ($planned as $type => $ids) {
            foreach ((array) $ids as $id) {
                $this->planned[(string) $type][(string) $id] = true;
            }
        }
    }

    public function put(string $sourceType, int|string $sourceId, Model $target, ?string $sourceUrl = null): void
    {
        $alias = $target->getMorphClass();

        WordPressImportMapping::query()->updateOrCreate(
            ['site' => $this->site, 'source_type' => $sourceType, 'source_id' => (string) $sourceId],
            [
                'target_type' => $alias,
                'target_id' => (int) $target->getKey(),
                'source_url' => $sourceUrl !== null ? mb_substr($sourceUrl, 0, 2000) : null,
                'wordpress_import_id' => $this->importId,
            ],
        );

        $this->load($sourceType);
        $this->rows[$sourceType][(string) $sourceId] = ['type' => $alias, 'id' => (int) $target->getKey(), 'url' => $sourceUrl];
    }

    /**
     * Every mapped record that had an address on the old site.
     *
     * @return iterable<WordPressImportMapping>
     */
    public function withUrls(): iterable
    {
        return WordPressImportMapping::query()
            ->where('site', $this->site)
            ->whereNotNull('source_url')
            ->lazyById(500);
    }

    /** @return ?Model the record a mapping row points at */
    public static function resolve(WordPressImportMapping $row): ?Model
    {
        $class = Relation::getMorphedModel($row->target_type);

        return $class === null ? null : $class::query()->find($row->target_id);
    }

    private function load(string $sourceType): void
    {
        if (isset($this->rows[$sourceType])) {
            return;
        }

        $this->rows[$sourceType] = [];

        WordPressImportMapping::query()
            ->where('site', $this->site)
            ->where('source_type', $sourceType)
            ->get(['source_id', 'target_type', 'target_id', 'source_url'])
            ->each(function (WordPressImportMapping $row) use ($sourceType) {
                $this->rows[$sourceType][$row->source_id] = [
                    'type' => $row->target_type,
                    'id' => $row->target_id,
                    'url' => $row->source_url,
                ];
            });
    }
}
