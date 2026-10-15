<?php

namespace App\Support\WordPress;

/**
 * One block while `GutenbergSections::parse()` reads it: its own markup and
 * its children in the order WordPress saved them (`seq` — a string is the
 * block's own markup, an integer the index of a child).
 */
final class BlockFrame
{
    /** @var list<array<string, mixed>> */
    public array $children = [];

    /** @var list<int|string> */
    public array $seq = [];

    /** @param  array<string, mixed>  $attrs */
    public function __construct(public string $name, public array $attrs = []) {}

    /** @param  array<string, mixed>  $block */
    public function add(array $block): void
    {
        $this->seq[] = count($this->children);
        $this->children[] = $block;
    }

    public function own(string $markup): void
    {
        $this->seq[] = $markup;
    }

    /**
     * The finished block; `html` is its own markup, without its children's.
     *
     * @return array{name: string, attrs: array<string, mixed>, html: string, children: list<array<string, mixed>>, seq: list<int|string>}
     */
    public function block(): array
    {
        return [
            'name' => $this->name,
            'attrs' => $this->attrs,
            'html' => implode('', array_filter($this->seq, 'is_string')),
            'children' => $this->children,
            'seq' => $this->seq,
        ];
    }
}
