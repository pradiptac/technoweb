<?php

namespace App\Support\Writing;

final class Prepared
{
    /**
     * @param  string  $content  what goes inside the fence (the outline)
     * @param  list<string>  $context  context lines, inside the fence, above the content
     * @param  string  $shape  the JSON shape the model must answer, in words
     * @param  array<string, mixed>  $state  whatever rebuild() needs back (links, locked items, sources…)
     */
    public function __construct(
        public string $content,
        public array $context,
        public string $shape,
        public int $maxTokens,
        public array $state = [],
    ) {}
}
