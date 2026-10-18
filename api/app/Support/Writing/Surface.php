<?php

namespace App\Support\Writing;

use App\Models\User;

/** One place writing help can be asked from. Refusals are `WritingRefused` (code 404 for a missing `ref`). */
interface Surface
{
    public function key(): string;

    /** False is a 403. */
    public function authorise(User $user, WritingInput $input): bool;

    /** @throws WritingRefused */
    public function prepare(WritingInput $input): Prepared;

    /**
     * @param  array<string, mixed>  $answer
     *
     * @throws WritingRefused
     */
    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string;
}
