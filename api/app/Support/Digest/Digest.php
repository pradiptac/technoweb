<?php

namespace App\Support\Digest;

/** One staff member's digest, built and not yet sent. */
final readonly class Digest
{
    /**
     * @param  list<array{key: string, label: string, figure: mixed, sentence: string, href: ?string, change: ?string}>  $items
     * @param  list<string>  $clear
     * @param  list<string>  $zeros  the keys whose figure was 0, stored so 0 → 3 reads "up 3"
     */
    public function __construct(public array $items, public array $clear, public bool $allZero, public array $zeros = []) {}

    /** The whole-number figures, zeros included, for the next digest to compare with. @return array<string, int> */
    public function figures(): array
    {
        $out = [];
        foreach ($this->items as $item) {
            if (is_int($item['figure'])) {
                $out[$item['key']] = $item['figure'];
            }
        }
        foreach ($this->zeros as $key) {
            $out[$key] = 0;
        }

        return $out;
    }
}
