<?php

use App\Support\Backups\RestoreMode;
use App\Support\System\UpdateMode;
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

// Guest wishlists, for the same reason: a heart pressed by anybody mints a
// row. Six months, the wishlist cookie's life. Accounts' lists are kept.
Schedule::command('technoware:prune-wishlists')->dailyAt('03:32');

/*
 * Reminders about those baskets, while they are still worth one.
 *
 * Every ten minutes, so a first reminder lands close to the delay the shop
 * chose. The switch and the quiet-hours window are the command's first two
 * questions, so a run outside either costs one settings read; the claim on
 * each basket is a conditional UPDATE, and `withoutOverlapping` is belt to
 * that brace.
 */
Schedule::command('technoware:remind-abandoned-carts')
    ->everyTenMinutes()
    ->withoutOverlapping();

/*
 * JavaScript failures nobody has seen for a month.
 *
 * This list is about what is broken *now*, so it ages on `last_seen_at`: a bug
 * first reported a year ago and again this morning is current.
 */
Schedule::command('technoware:prune-client-errors')->dailyAt('03:35');

// Addresses nobody has asked for in ninety days; ages on `last_seen_at` for the
// same reason as the line above (0.137.0, docs/seo.md "Missing pages").
Schedule::command('technoware:prune-not-found')->dailyAt('03:40');

/*
 * The inbound email ledger, which is what stops a redelivered message
 * opening a second ticket. Six months, so a row outlives any plausible
 * redelivery; see PruneInboundEmails.
 */
Schedule::command('technoware:prune-inbound-emails')->dailyAt('03:37');

/*
 * Mailbox scans for subscribers: a result nobody imported within a day is
 * thrown away with its file of addresses, and a scan whose job chain died
 * is marked failed so the screen stops waiting. Hourly rather than nightly
 * because the stuck case is what somebody is looking at right now.
 */
Schedule::command('technoware:prune-newsletter-scans')->hourly();
Schedule::command('technoware:prune-wordpress-imports')->hourly();

/*
 * Spam and binned comments.
 *
 * Ranges on `updated_at` — when the decision was taken — because a comment
 * posted a year ago and filed this morning has just been read.
 */
Schedule::command('technoware:prune-comments')->dailyAt('03:45');

/*
 * Stored AI SEO suggestions.
 *
 * Ranges on `created_at` rather than `updated_at`, unlike the comments above,
 * and the difference is the point: a suggestion's only update is somebody
 * deciding about it, so ranging on that would keep a rejected draft alive for
 * another ninety days *because* it was rejected.
 */
Schedule::command('technoware:prune-seo-suggestions')->dailyAt('03:50');

/*
 * Webhook deliveries older than thirty days.
 *
 * Each row is a stored payload — an order, a lead — kept so a failed send can
 * be read and resent; a month is longer than any retry and long enough for a
 * quiet hook to be noticed. See PruneWebhookDeliveries.
 */
Schedule::command('technoware:prune-webhook-deliveries')->dailyAt('03:55');

/*
 * "How was it?" — the review request, once per order, a few days after
 * delivery. Hourly, and the command itself waits out the quiet hours, so an
 * order that falls due at 2am is asked at nine. See RequestReviews.
 */
Schedule::command('technoware:request-reviews')->hourly()->withoutOverlapping();

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
 * Blurred loading previews for library pictures that have none (0.123.0).
 *
 * A new picture gets one when its row is created; this works through the
 * library that already existed, 250 an hour, and is one cheap query once
 * nothing is waiting. Scheduled rather than an upgrade step because decoding
 * a few thousand photographs is minutes of work, and nothing waits on it: a
 * picture without a preview loads the way every picture did before.
 */
Schedule::command('technoware:backfill-media-blur')->hourly()->withoutOverlapping();

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

/*
 * The support mailbox, read once a minute while Settings → Ticketing has it
 * switched on; with it off the command returns before touching the network.
 * A minute is the same latency mail already has here — the acknowledgement
 * it triggers leaves through the queue the line above this one drains.
 *
 * `withoutOverlapping(10)`: one run at a time, with the lock expiring after
 * ten minutes so a hung socket cannot stop piping until somebody clears the
 * cache. The client's own timeout is thirty seconds and a run takes at most
 * twenty-five messages, so a healthy run is well inside a minute.
 */
Schedule::command('technoware:pipe-inbound-mail')
    ->everyMinute()
    ->withoutOverlapping(10);

/*
 * Hunter verification, a few addresses a night.
 *
 * After the customer sync so the night's new customers are in the queue.
 * Daily rather than hourly because the month's allowance is spread over its
 * days and one run a day is the whole of "slowly"; a Hunter outage is a
 * banner in the console, never a failed event here.
 */
Schedule::command('technoware:verify-subscribers')->dailyAt('03:55')->withoutOverlapping();

Schedule::command('technoware:send-scheduled-campaigns')
    ->everyMinute()
    ->withoutOverlapping();

// A subject test's held remainder goes out under the better line once its wait
// has passed; `CampaignSender::decide()` is idempotent, so ten minutes is a
// cadence rather than a risk.
Schedule::command('technoware:decide-subject-tests')
    ->everyTenMinutes()
    ->withoutOverlapping();

// Automation sequences: every enrolment whose step has fallen due gets its
// recipient row and a batch job, or is cancelled if the subscriber can no
// longer be mailed. Ten minutes for the same reason as the line above — the
// cursor moves as the row is written and the recipient index holds — and
// the mail itself leaves through the worker the scheduler already drains.
Schedule::command('technoware:run-sequences')
    ->everyTenMinutes()
    ->withoutOverlapping();

// Messaging broadcasts (WhatsApp, RCS, push) whose scheduled time has come.
// `Broadcasts::queue()` claims each with a conditional update, so overlapping
// runs cannot freeze one audience twice; the batches wait for the quiet-hours
// window themselves.
Schedule::command('technoware:send-broadcasts')
    ->everyMinute()
    ->withoutOverlapping();

// Delivery rows are a log of what was attempted, not a record anybody edits;
// ninety days answers "did that customer get the dispatch notice".
Schedule::command('technoware:prune-message-deliveries')->dailyAt('03:58');

/*
 * Engineer visits (2026-09-26, docs/visits.md): the day-before reminder,
 * once per appointment. Every fifteen minutes, so a visit is reminded about
 * a day ahead whatever time it is booked for; each visit is claimed with a
 * conditional UPDATE on `reminded_at` before anything is sent, and
 * `withoutOverlapping` is belt to that brace. Transactional, so no
 * quiet-hours gate.
 */
Schedule::command('technoware:remind-visits')
    ->everyFifteenMinutes()
    ->withoutOverlapping();

/*
 * Events (0.118.0, docs/events.md): one reminder to each confirmed
 * registrant, `event_reminder_hours` before the start (0 sends none). Every
 * fifteen minutes for the visits' reason — the window is "the next N hours",
 * so each registrant is reminded about that long ahead whatever time the
 * event is at. Each one is claimed by a conditional UPDATE on `reminded_at`
 * before anything is sent. Transactional, so no quiet-hours gate.
 */
Schedule::command('technoware:remind-events')
    ->everyFifteenMinutes()
    ->withoutOverlapping();

/*
 * Online meetings (2026-09-29, docs/meetings.md): the reminders before each
 * meeting, one per offset in Settings. Every five minutes, so an hour-before
 * reminder lands within five minutes of the hour; each is claimed by
 * inserting its `(meeting, offset, starts_at)` row, and `withoutOverlapping`
 * is belt to that brace. Transactional, so no quiet-hours gate.
 */
Schedule::command('technoware:remind-meetings')
    ->everyFiveMinutes()
    ->withoutOverlapping();

/*
 * Online meetings (2026-09-29, docs/meetings.md): the Google Calendar
 * sweeper. Every minute it retries what did not reach Google — pending and
 * failed syncs under the retry cap — and fills in Meet links still pending,
 * each meeting claimed with a conditional UPDATE. Above the pause loop, so
 * it waits out an update or a restore like everything else.
 */
Schedule::command('technoware:sync-meetings')
    ->everyMinute()
    ->withoutOverlapping(5);

/*
 * Zoho Books invoices (0.134.0, docs/store.md "Zoho Books invoices"): what
 * the queued job did not get to, and attempts that are due again. Does
 * nothing at all while the integration is off or not fully set up.
 */
Schedule::command('technoware:sync-zoho-invoices')
    ->everyFiveMinutes()
    ->withoutOverlapping(10);

/*
 * Courier tracking (0.143.0, docs/store.md "Shiprocket"): the backstop to
 * the webhook. Asks the platform about booked parcels not yet delivered,
 * oldest check first, a bounded number per run. Does nothing at all while the
 * provider is manual or the sign-in is not saved. Above the pause loop, so
 * it waits out an update or a restore like everything else.
 */
Schedule::command('technoware:track-shipments')
    ->everyThirtyMinutes()
    ->withoutOverlapping(20);

/*
 * Backups (2026-09-27, docs/backups.md). The worker every minute, in the
 * background so its forty seconds do not hold up the queue drain behind it,
 * and never two at once. It works through any restore, then any backup, then
 * starts a scheduled one when a slot is due - so "Back up now" is picked up
 * within the minute. Hourly, the stuck ones are failed and retention applied.
 */
Schedule::command('technoware:backups-work')
    ->everyMinute()
    ->runInBackground()
    ->withoutOverlapping(10)
    ->name('backups-work');
Schedule::command('technoware:prune-backups')->hourly();

/*
 * While a restore is replacing the database, nothing else runs: no queue
 * drain (a campaign batch, a reminder, a webhook would write into tables
 * half-rebuilt), no prune, no reminder. Only the backup worker doing the
 * restore and the heartbeat that says the scheduler is alive. Applied to
 * every event registered above, so a command added later is covered
 * without anybody remembering to.
 *
 * While an update is replacing the application (`UpdateMode`), even the
 * backup worker waits: the updater drives its own safety copy, and a command
 * started half-way through the swap would run a mixture of two releases.
 */
foreach (Schedule::events() as $event) {
    if ($event->description === 'scheduler-heartbeat') {
        continue;
    }

    $event->skip(fn () => UpdateMode::active());

    if ($event->description !== 'backups-work') {
        $event->skip(fn () => RestoreMode::active());
    }
}
