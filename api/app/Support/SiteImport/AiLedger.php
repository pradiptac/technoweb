<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\WordPress\Harvest;
use Illuminate\Support\Facades\Storage;

/**
 * What the AI has already been asked for this import, and what it said.
 *
 * One JSON file beside the harvest (`ai.json`), keyed by the block's hash
 * (`Outline::hash()`). The dry run writes it and the commit reads it, so the
 * review's counts are the commit's counts **and** the commit does not pay for
 * a block the dry run already paid for. A block the model declined, answered
 * unreadably or that the daily cap or the per-import limit stopped is written
 * down too: the review has decided about it, and the commit must not decide
 * differently by being a day later.
 *
 * An entry is `{answer: array|null, why: ?string, used: bool}` — `answer` the
 * model's reply read as JSON (in its own vocabulary: numbers for pictures and
 * links, not paths, so it is true for the dry run's placeholder pictures and
 * the commit's real ones), `used` whether a section was made of it.
 * Entries stopped for a limit (`why: 'cap'`) are forgotten when a fresh dry
 * run starts, so raising the cap and recounting asks again.
 *
 * It lives in the harvest folder, so it is deleted with the harvest.
 */
final class AiLedger
{
    /** @var array<string, array{answer: ?array<string, mixed>, why: ?string, used: bool}> */
    private array $entries = [];

    private function __construct(private readonly SiteImport $import) {}

    public static function for(SiteImport $import): self
    {
        $ledger = new self($import);
        $disk = Storage::disk(Harvest::DISK);
        $path = self::path($import);

        if ($disk->exists($path) && is_array($data = json_decode((string) $disk->get($path), true))) {
            $ledger->entries = $data;
        }

        return $ledger;
    }

    /** @return ?array{answer: ?array<string, mixed>, why: ?string, used: bool} */
    public function get(string $key): ?array
    {
        return $this->entries[$key] ?? null;
    }

    /** @param  ?array<string, mixed>  $answer */
    public function put(string $key, ?array $answer, ?string $why = null, bool $used = false): void
    {
        $this->entries[$key] = ['answer' => $answer, 'why' => $why, 'used' => $used];
        $this->save();
    }

    public function markUsed(string $key): void
    {
        if (isset($this->entries[$key]) && ! $this->entries[$key]['used']) {
            $this->entries[$key]['used'] = true;
            $this->save();
        }
    }

    /** How many times a model has been asked this import. */
    public function asked(): int
    {
        return count(array_filter($this->entries, fn (array $e) => $e['why'] !== 'cap' && $e['why'] !== 'limit'));
    }

    /** A fresh dry run asks again about what a limit stopped. */
    public function forgetStopped(): void
    {
        $kept = array_filter($this->entries, fn (array $e) => ! in_array($e['why'], ['cap', 'limit'], true));

        if (count($kept) !== count($this->entries)) {
            $this->entries = $kept;
            $this->save();
        }
    }

    private function save(): void
    {
        Storage::disk(Harvest::DISK)->put(self::path($this->import), (string) json_encode($this->entries, JSON_INVALID_UTF8_SUBSTITUTE));
    }

    private static function path(SiteImport $import): string
    {
        return Harvest::dir($import).'/ai.json';
    }
}
