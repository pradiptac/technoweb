<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
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

    /**
     * How long a heartbeat may go unrenewed before the scheduler is reported
     * as stopped.
     *
     * Three minutes for a thing that runs every one: cron can be a few seconds
     * late, a loaded box can miss a tick, and a status that flickers to "not
     * running" on a busy afternoon is one nobody believes the day it is right.
     */
    public const HEARTBEAT_SECONDS = 180;

    /** The cache key `routes/console.php` renews every minute. */
    public const HEARTBEAT_KEY = 'scheduler_heartbeat';

    /** The cache key a running worker renews, from `AppServiceProvider`. */
    public const WORKER_KEY = 'queue_worker_pulse';

    /**
     * How often a worker renews its pulse.
     *
     * The looping event fires on every poll — about once a second — and this
     * is what stops that becoming a cache write a second.
     */
    public const PULSE_SECONDS = 15;

    /**
     * Whether a worker is running right now.
     *
     * The other right answer to "will this be delivered". A bare
     * `php artisan queue:work`, by hand or under supervisor, delivers mail
     * perfectly well and touches the scheduler's heartbeat not at all — so a
     * check that knows only about the scheduler tells somebody with a worker
     * running that nothing is delivering, and sends them to fix a cron entry
     * they may not even need.
     *
     * @return array<string, mixed>
     */
    public static function worker(): array
    {
        try {
            $last = Cache::get(self::WORKER_KEY);
        } catch (\Throwable) {
            return ['known' => false];
        }

        $age = $last === null ? null : max(0, time() - (int) $last);

        return [
            'known' => true,
            'last_seen_seconds' => $age,
            'running' => $age !== null && $age <= self::HEARTBEAT_SECONDS,
        ];
    }

    /**
     * Whether the scheduler itself is running, which the backlog cannot say.
     *
     * A queue with nothing in it is the same picture whether a worker drained
     * it a second ago or no worker has ever existed, so "pending: 0" is not an
     * answer to "will my campaign go out". The heartbeat is, and its absence
     * is reported as **stopped rather than unknown**: on a deployment with no
     * cron entry there is no other evidence to wait for, and the fix is the
     * same line either way. The one honest false alarm is the first minute
     * after this ships, which the screen says out loud.
     *
     * @return array<string, mixed>
     */
    public static function scheduler(): array
    {
        try {
            $last = Cache::get(self::HEARTBEAT_KEY);
        } catch (\Throwable) {
            return ['known' => false];
        }

        $age = $last === null ? null : max(0, time() - (int) $last);

        return [
            'known' => true,
            'last_run_seconds' => $age,
            'running' => $age !== null && $age <= self::HEARTBEAT_SECONDS,
        ];
    }

    /**
     * The verdict the send screen actually asks for.
     *
     * True when a worker is running now, **or** when the scheduler is, since
     * the scheduler starts one within the minute. Either is a mail that will
     * arrive; the panel then says which, because "it is running" and "how" are
     * different questions and only the second is actionable when it stops.
     */
    public static function delivering(): bool
    {
        return (self::worker()['running'] ?? false) || (self::scheduler()['running'] ?? false);
    }

    /** @return array<string, mixed> */
    public static function read(): array
    {
        if (config('queue.default') !== 'database') {
            return [
                'driver' => config('queue.default'),
                'known' => false,
                'scheduler' => self::scheduler(),
                'worker' => self::worker(),
                'delivering' => self::delivering(),
            ];
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
                'scheduler' => self::scheduler(),
                'worker' => self::worker(),
                'delivering' => self::delivering(),
            ];
        } catch (\Throwable) {
            return [
                'driver' => 'database',
                'known' => false,
                'scheduler' => self::scheduler(),
                'worker' => self::worker(),
                'delivering' => self::delivering(),
            ];
        }
    }
}
