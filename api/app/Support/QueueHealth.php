<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Whether anything is actually draining the queue.
 *
 * Mail leaves through the queue, so if nothing is running it nothing throws,
 * nothing is logged and no `mail_error` is written — jobs simply accumulate and
 * every message stops arriving, from a console that looks perfectly healthy.
 * `mail_error` exists because that failure mode is unacceptable; this is the
 * same argument applied to the thing that replaced the send.
 *
 * It lived as a private helper on `MailController` and is shared now because a
 * campaign needs it too: "I pressed Send and nobody received it" is the same
 * question the settings screen already answers, asked from the screen where it
 * actually bites. Two copies of this would be two thresholds and two answers.
 *
 * Reads the `database` queue directly rather than through the Queue facade,
 * which has no "how old is the oldest job" question. Guarded, because a
 * deployment on another driver has no such table and this must degrade to
 * "cannot tell" rather than 500 the screen asking.
 */
class QueueHealth
{
    /**
     * Older than this and something is wrong rather than busy.
     *
     * A short window, because the scheduler runs the worker every minute: two
     * minutes means at least one run has been missed.
     */
    public const STALE_SECONDS = 120;

    /** @return array<string, mixed> */
    public static function read(): array
    {
        if (config('queue.default') !== 'database') {
            return ['driver' => config('queue.default'), 'known' => false];
        }

        try {
            $oldest = DB::table('jobs')->min('available_at');

            return [
                'driver' => 'database',
                'known' => true,
                'pending' => DB::table('jobs')->count(),
                'failed' => DB::table('failed_jobs')->count(),
                /*
                 * The age is the figure that matters, not the count: a hundred
                 * jobs queued in the last ten seconds is a busy minute, and one
                 * job sitting for an hour is a broken deployment.
                 */
                'oldest_seconds' => $oldest === null ? null : max(0, time() - (int) $oldest),
                'stalled' => $oldest !== null && (time() - (int) $oldest) > self::STALE_SECONDS,
            ];
        } catch (\Throwable) {
            return ['driver' => 'database', 'known' => false];
        }
    }
}
