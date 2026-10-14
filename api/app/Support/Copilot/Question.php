<?php

namespace App\Support\Copilot;

use Closure;

/**
 * One question the console can be asked, and the code that answers it.
 *
 * The whole of the copilot's safety is in this shape. A question is **not**
 * a prompt and not a query template: it is a key, the words a person might
 * type for it, the role entitled to ask it, and a closure that answers it
 * out of this application's own scopes. Nothing a model returns is ever
 * executed, interpolated or shown — the model's entire output is an index
 * into a list of these.
 *
 * `answer` returns `['figure' => …, 'sentence' => …, 'href' => …]`:
 *
 *   - **`figure`** is what it is: an integer, a formatted amount, a span of
 *     time. Null when nothing has been measured, never zero — the rule the
 *     whole store module already follows, because an average over nothing
 *     is not an average of nothing.
 *   - **`sentence`** is written in PHP. A model never writes a word of what
 *     a person reads here, so there is no path by which a figure and the
 *     sentence around it can disagree.
 *   - **`href`** is the console list that produced the figure, **filtered
 *     the way it was counted** — the dashboard tile's rule. An answer
 *     somebody cannot open is a number they have to take on trust.
 */
final readonly class Question
{
    /**
     * @param  string  $key  Stable; it is what the model answers with, and what a test pins.
     * @param  string  $role  The role entitled to ask. An administrator passes every one.
     * @param  string  $label  The question as a person would put it — shown as a suggestion.
     * @param  string  $words  Everything people type for it, for the rules pass. Never shown.
     * @param  Closure():array{figure: mixed, sentence: string, href: ?string}  $answer
     */
    public function __construct(
        public string $key,
        public string $role,
        public string $label,
        public string $words,
        public Closure $answer,
    ) {}

    /** @return array{figure: mixed, sentence: string, href: ?string} */
    public function answer(): array
    {
        return ($this->answer)();
    }

    /** What the model is shown, and what the drawer lists. Never the closure. */
    public function toArray(): array
    {
        return ['key' => $this->key, 'label' => $this->label];
    }
}
