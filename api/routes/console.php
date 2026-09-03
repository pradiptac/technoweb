<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

// Prune expired Sanctum tokens weekly so the table does not grow forever.
Schedule::command('sanctum:prune-expired --hours=24')->weekly();

/*
 * Activity log retention.
 *
 * Daily rather than weekly: the period is a promise about how long staff
 * actions are kept, and a weekly prune makes "90 days" mean anything up to 97.
 */
Schedule::command('technoware:prune-activity')->dailyAt('03:10');

// Chat transcripts, on the same nightly pass as the other retention prunes and
// for the same reason: a visitor gave this data with no account to come back
// and remove it themselves.
Schedule::command('technoware:prune-chats')->dailyAt('03:20');

/*
 * Candidate data retention. Same reasoning, higher stakes: this deletes CVs.
 */
Schedule::command('technoware:prune-applications')->dailyAt('03:25');

/*
 * Abandoned baskets.
 *
 * The one table that grows from a plain read — `GET /cart` with no token mints
 * a row — so it is the one that most needed this and had it least. Thirty days
 * matches the cart cookie's own life, so nothing is deleted while a browser is
 * still offering to remember it.
 */
Schedule::command('technoware:prune-carts')->dailyAt('03:30');

/*
 * JavaScript failures nobody has seen for a month.
 *
 * This list is about what is broken *now*, so it ages on `last_seen_at`: a bug
 * first reported a year ago and again this morning is current.
 */
Schedule::command('technoware:prune-client-errors')->dailyAt('03:35');

/*
 * Spent and expired sign-in codes.
 *
 * Housekeeping rather than retention — nothing is promised about these and
 * nothing reads them after ten minutes. Hourly rather than daily because the
 * table is written to on every sign-in attempt, including the failed ones,
 * which is exactly the traffic that grows when somebody is working through a
 * list of addresses.
 */
Schedule::command('technoware:prune-sign-in-codes')->hourly();

/*
 * Deliver the queued mail.
 *
 * **A cron drain rather than a daemon, because the scheduler is the only
 * background process this deployment is known to have.** Plesk runs one cron
 * entry for `schedule:run` and the four commands above already depend on it;
 * asking for a supervised `queue:work` as well is a second operational
 * requirement, and mail that silently stops because nobody set it up is
 * strictly worse than mail that is a minute late.
 *
 * `--stop-when-empty` is what makes that safe: the run ends when the queue is
 * drained rather than sitting there, so a missed minute costs nothing and two
 * overlapping runs cannot happen — `withoutOverlapping` covers the case where
 * a slow relay keeps one alive past the minute.
 *
 * `--max-time=50` keeps a run inside its minute. `--tries=3` matches the
 * notifications' own `$tries`, so a queue restarted by hand behaves like the
 * scheduled one rather than retrying for ever.
 *
 * **Each run boots the application fresh**, which matters here: outgoing mail
 * is configured in the console, and `MailSettingsProvider` applies it at boot.
 * A long-running daemon would hold the settings it started with, so changing
 * the SMTP password would take effect for the web requests and not for the
 * queue — the sort of split-brain that is very hard to see from inside the
 * admin. A short-lived worker cannot have that problem.
 *
 * The one thing a person must still do: **run the scheduler**. If it stops,
 * queued mail stops, and `GET /admin/settings/mail` reports the backlog for
 * exactly that reason.
 */
Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=3')
    ->everyMinute()
    ->withoutOverlapping();

/*
 * The scheduler's own heartbeat.
 *
 * "Is anything draining the queue" cannot be answered from the queue. An empty
 * `jobs` table is what a healthy install looks like **and** what an install
 * with no cron entry looks like, right up until somebody presses Send — and
 * the screen that most needs the answer is the one *before* the send, where
 * there is nothing yet to be late. A backlog is a symptom; this is the pulse.
 *
 * One cache write a minute, with no TTL, so the value simply ages when the
 * cron entry stops. That ageing is the signal: `QueueHealth` reads it and the
 * send screen says either how long ago the scheduler last ran or the crontab
 * line to add.
 */
Schedule::call(fn () => Cache::put('scheduler_heartbeat', now()->timestamp))
    ->everyMinute()
    ->name('scheduler-heartbeat')
    ->withoutOverlapping();

/*
 * Scheduled newsletter campaigns.
 *
 * Every minute, so "send at 09:00" means 09:00 rather than up to an hour
 * later. The command only *queues* — the mail itself goes out through the same
 * worker run below, which is what keeps a campaign of fifty thousand off the
 * scheduler's own minute.
 */
/*
 * The customers group, reconciled nightly.
 *
 * The model hook keeps it current minute to minute; this catches whatever
 * reached the table without firing an event, and is the reason the group can be
 * trusted rather than merely usually right.
 */
Schedule::command('technoware:sync-customer-group')->dailyAt('03:40');

Schedule::command('technoware:send-scheduled-campaigns')
    ->everyMinute()
    ->withoutOverlapping();
