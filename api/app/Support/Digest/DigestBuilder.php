<?php

namespace App\Support\Digest;

use App\Models\StaffPreference;
use App\Models\User;
use App\Support\Copilot\Questions;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * A staff member's digest (docs/digest-alerts.md): the copilot's figures for
 * their roles, each compared with what their last digest showed. Every figure
 * and sentence is the copilot's; nothing here is written by a model.
 */
final class DigestBuilder
{
    /**
     * A question about "me" (`tickets_mine`) reads the signed-in user, and the
     * scheduler signs nobody in — so the person is signed in for the asking
     * and whoever was before is put back.
     *
     * @param  array<string, int>|null  $previous
     */
    public static function build(User $user, ?array $previous): Digest
    {
        $before = Auth::user();
        Auth::setUser($user);
        try {
            return self::compose($user, $previous);
        } finally {
            $before === null ? Auth::forgetUser() : Auth::setUser($before);
        }
    }

    /** @param array<string, int>|null $previous */
    private static function compose(User $user, ?array $previous): Digest
    {
        $items = [];
        $clear = [];
        $zeros = [];
        foreach (Questions::for($user->roles->pluck('slug')->all()) as $question) {
            try {
                $answer = $question->answer();
            } catch (Throwable $e) {
                Log::warning('Digest question failed', ['question' => $question->key, 'error' => $e->getMessage()]);

                continue;
            }
            $figure = $answer['figure'];
            if ($figure === 0 || $figure === null) {
                $clear[] = $question->label;
                if ($figure === 0) {
                    $zeros[] = $question->key;
                }

                continue;
            }
            $before = $previous[$question->key] ?? null;
            $items[] = [
                'key' => $question->key,
                'label' => $question->label,
                'figure' => $figure,
                'sentence' => $answer['sentence'],
                'href' => $answer['href'],
                'change' => is_int($figure) && is_int($before) && $figure !== $before
                    ? ($figure > $before ? 'up '.($figure - $before) : 'down '.($before - $figure))
                    : null,
            ];
        }

        return new Digest($items, $clear, $items === [], $zeros);
    }

    public static function due(StaffPreference $prefs, CarbonInterface $now): bool
    {
        $local = $now->setTimezone(config('app.timezone'));
        if ($prefs->digest === 'off' || $local->hour !== (int) $prefs->digest_hour) {
            return false;
        }

        return $prefs->digest !== 'weekly' || $local->dayOfWeekIso === (int) $prefs->digest_weekday;
    }
}
