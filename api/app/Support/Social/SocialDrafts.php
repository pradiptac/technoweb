<?php

namespace App\Support\Social;

use App\Enums\PublishStatus;
use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus;
use App\Jobs\WriteSocialPost;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\ContentType;
use App\Models\Entry;
use App\Models\Event;
use App\Models\SocialPost;
use App\Models\User;
use App\Support\Writing\Writer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Makes the LinkedIn and X drafts for a published record: on publish, by the sweep, or by hand. */
class SocialDrafts
{
    /** How far back the sweep looks for a post that came due after its save. */
    public const SWEEP_DAYS = 30;

    /** Set while a bulk write runs that must not draft per record (imports, seeders). */
    private static bool $suppressed = false;

    /**
     * Run `$work` with drafting held back, as IndexNow::suppressed does: an import
     * or a seeder writes hundreds of published records that nobody just published.
     *
     * @template T
     *
     * @param  callable(): T  $work
     * @return T
     */
    public static function suppressed(callable $work): mixed
    {
        $previous = self::$suppressed;
        self::$suppressed = true;

        try {
            return $work();
        } finally {
            self::$suppressed = $previous;
        }
    }

    /**
     * The saved-listener entry point. Never throws: a draft that cannot be made must not fail a publish.
     * It drafts on the transition to visible (visible after this save, not before) and, for posts and
     * press releases, only when dated within the sweep's window, so editing old content drafts nothing.
     */
    public static function onSaved(Model $m): void
    {
        if (self::$suppressed) {
            return;
        }

        try {
            // In a saved listener the originals are still the pre-save values (a new model holds only its defaults).
            $status = $m->getOriginal('status');
            // A post or entry that came due after its last save was not visible "before": its first edit drafts it.
            $before = ($status instanceof \BackedEnum ? $status->value : $status) === PublishStatus::Published->value
                && (! ($m instanceof BlogPost || $m instanceof Entry)
                    || self::datedLive($m instanceof Entry, $m->getOriginal('published_at'), $m->getOriginal('updated_at')));
            $stale = ($m instanceof BlogPost || $m instanceof Entry)
                && $m->published_at !== null && $m->published_at->lt(now()->subDays(self::SWEEP_DAYS));

            if (! $before && ! $stale) {
                self::draftIfDue($m);
            }
        } catch (\Throwable $e) {
            Log::warning('Social posts: could not draft', ['type' => $m->getMorphClass(), 'id' => $m->getKey(), 'error' => $e->getMessage()]);
        }
    }

    /** Dated no later than now and no later than the save that stored it; no date counts as live only for an entry. */
    private static function datedLive(bool $nullIsLive, mixed $at, mixed $saved): bool
    {
        if ($at === null) {
            return $nullIsLive;
        }
        $at = Carbon::parse($at);

        return $at->lte(now()) && ($saved === null || $at->lte(Carbon::parse($saved)));
    }

    /**
     * Visible now and no automatic pair yet is the whole test, so it is idempotent.
     * Not locked: two saves racing in the same instant could make two pairs (acceptable; the editor discards one).
     */
    private static function draftIfDue(Model $m): bool
    {
        if (! ($m instanceof BlogPost || $m instanceof CaseStudy || $m instanceof Event || $m instanceof Entry)
            || ! SocialSubjects::isVisible($m)
            || SocialPost::query()->where('subject_type', $m->getMorphClass())->where('subject_id', $m->getKey())->where('source', 'publish')->exists()) {
            return false;
        }
        self::forRecord($m, 'publish', null);

        return true;
    }

    /** @return array{0: SocialPost, 1: SocialPost} the LinkedIn post, then the X post */
    public static function forRecord(Model $m, string $source, ?User $by): array
    {
        if (! ($m instanceof BlogPost || $m instanceof CaseStudy || $m instanceof Event || $m instanceof Entry)) {
            throw new \InvalidArgumentException('Not a record social posts can be about.');
        }
        $pending = Writer::refusal() === null;
        $title = SocialSubjects::title($m);
        $summary = SocialSubjects::summary($m);
        $url = SocialSubjects::publicUrl($m);

        $posts = DB::transaction(fn () => array_map(fn (SocialNetwork $network) => SocialPost::query()->create([
            'network' => $network,
            'status' => SocialPostStatus::Draft,
            'subject_type' => $m->getMorphClass(),
            'subject_id' => $m->getKey(),
            'text' => SocialText::fallback($network, $title, $summary, $url),
            'url' => $url,
            'source' => $source,
            'ai_pending' => $pending,
            'drafted_by' => $by?->id,
        ]), [SocialNetwork::LinkedIn, SocialNetwork::X]));

        if ($pending) {
            foreach ($posts as $post) {
                WriteSocialPost::dispatch($post->id)->afterCommit();
            }
        }

        return [$posts[0], $posts[1]];
    }

    /**
     * Posts and press releases that came due after their save (a future date), published in the last 30 days.
     * Also the backstop for a send whose process died: a post stuck in `sending` for five minutes is
     * moved to `unconfirmed`, so it can be checked and discarded or confirmed.
     */
    public static function sweep(): int
    {
        SocialPost::query()->where('status', SocialPostStatus::Sending->value)->where('updated_at', '<', now()->subMinutes(5))
            ->update(['status' => SocialPostStatus::Unconfirmed->value, 'error' => SocialSender::UNCONFIRMED]);

        $window = [now()->subDays(self::SWEEP_DAYS), now()];
        $without = fn (string $alias) => SocialPost::query()->where('subject_type', $alias)->where('source', 'publish')->select('subject_id');
        $drafted = 0;

        $records = BlogPost::query()->where('status', PublishStatus::Published)->whereBetween('published_at', $window)->whereColumn('published_at', '>', 'updated_at')
            ->whereNotIn('id', $without('blog_post'))->get()
            ->concat(Entry::query()->where('status', PublishStatus::Published)->whereBetween('published_at', $window)->whereColumn('published_at', '>', 'updated_at')
                ->whereIn('content_type_id', ContentType::query()->where('preset', SocialSubjects::PRESET)->select('id'))
                ->whereNotIn('id', $without('entry'))->get());

        foreach ($records as $record) {
            try {
                $drafted += self::draftIfDue($record) ? 1 : 0;
            } catch (\Throwable $e) {
                Log::warning('Social posts: sweep could not draft', ['type' => $record->getMorphClass(), 'id' => $record->getKey(), 'error' => $e->getMessage()]);
            }
        }

        return $drafted;
    }
}
