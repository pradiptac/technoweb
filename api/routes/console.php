<?php

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

/*
 * Candidate data retention. Same reasoning, higher stakes: this deletes CVs.
 */
Schedule::command('technoware:prune-applications')->dailyAt('03:25');

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
