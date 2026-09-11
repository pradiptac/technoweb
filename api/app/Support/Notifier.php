<?php

namespace App\Support;

use App\Models\Setting;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification as NotificationFacade;

/**
 * Sends the transactional mail, and refuses to let it break the request.
 *
 * A ticket that was created must report success even if the mail server is
 * down. Losing the notification is bad; telling a customer their ticket failed
 * when it is sitting in the database is worse, and they will submit it again.
 * So every send here is wrapped, and a failure is logged rather than thrown.
 *
 * Recipients come from the settings table rather than config, because the
 * support and sales addresses are things an administrator changes in the admin
 * without a deploy.
 */
class Notifier
{
    /** Send to a Notifiable model — a customer or a staff user. */
    public static function send(mixed $notifiable, Notification $notification): void
    {
        if ($notifiable === null) {
            return;
        }

        self::guard(
            fn () => self::dispatch($notifiable, $notification),
            $notification::class,
        );
    }

    /**
     * Send to an address chosen per-record rather than per-setting.
     *
     * A form can name its own recipient, so the address is not in settings and
     * not a Notifiable. Same guard as the others: a mail failure is logged and
     * swallowed, because the thing being announced is already saved.
     */
    public static function to(?string $address, Notification $notification): void
    {
        if (blank($address)) {
            return;
        }

        self::guard(
            fn () => self::dispatch(NotificationFacade::route('mail', $address), $notification),
            $notification::class,
        );
    }

    /**
     * Like `to()`, but says whether it worked.
     *
     * The exception is still swallowed — nothing here may break a request —
     * but there is one caller for whom "it failed" is information rather than
     * noise: a sign-in code that was never delivered leaves somebody staring
     * at a form waiting for an email that is not coming, and the response
     * cannot tell them so without revealing whether the address has an account
     * behind it. The boolean is what lets that caller record it instead.
     *
     * Deliberately a second method rather than a return value on `to()`. Every
     * other send in this application is fire-and-forget on purpose, and a
     * caller that starts reading a result is a caller one step away from
     * acting on it.
     */
    public static function attempt(?string $address, Notification $notification): bool
    {
        if (blank($address)) {
            return false;
        }

        return self::guard(
            fn () => self::dispatch(NotificationFacade::route('mail', $address), $notification),
            $notification::class,
        );
    }

    /**
     * Send to a bare address held in settings — the support desk and the sales
     * inbox are shared mailboxes, not accounts.
     */
    public static function route(string $settingKey, Notification $notification, ?string $fallback = null): void
    {
        $address = self::setting($settingKey) ?? $fallback ?? config('mail.from.address');

        if (blank($address)) {
            Log::warning('No recipient for notification', [
                'notification' => $notification::class,
                'setting' => $settingKey,
            ]);

            return;
        }

        self::guard(
            fn () => self::dispatch(NotificationFacade::route('mail', $address), $notification),
            $notification::class,
        );
    }

    public static function setting(string $key): ?string
    {
        $value = Setting::where('key', $key)->value('value');

        return blank($value) ? null : $value;
    }

    /**
     * The key the per-request answer to "is anything draining the queue" is
     * memoised under.
     *
     * The container rather than a static property, deliberately. A static
     * survives the whole PHP process, which is right for a web request and
     * wrong for a test suite — the second test in a file would read the first
     * one's answer. Every test gets a fresh container, so this is memoised for
     * exactly as long as it should be, and needs no reset method existing only
     * for tests.
     */
    private const DRAINING = 'notifier.queue.draining';

    /**
     * Queue it if something will deliver it; otherwise send it now.
     *
     * **Queueing is an optimisation, and this is what stops it losing the
     * message.** Mail was moved off the request path because an unreachable
     * SMTP host took a contact-form submission from 0.2s to 12.5s — a real
     * measurement, and still the right default. What it costs is that a
     * stopped scheduler makes mail vanish in silence: nothing throws, nothing
     * is logged, the console looks healthy, and every receipt simply stops.
     * That is not hypothetical. It happened here, and the first sign of it was
     * somebody asking why the contact form had sent no email for two days
     * while ten jobs sat in the table.
     *
     * So when nothing is draining, the request pays the SMTP round trip. That
     * is the worse of two costs only while the alternative is a message nobody
     * ever receives — and `guard()` below means a slow or failing send still
     * cannot break what the caller has already committed.
     *
     * **Campaigns are not affected and cannot be.** They are dispatched as
     * `SendCampaignBatch` jobs and sent with `Mail::to()->send()`, never
     * through this class, so nothing here can put thousands of recipients on a
     * request path. `QueuedMailTest` pins that rather than trusting it.
     */
    private static function dispatch(mixed $notifiable, Notification $notification): void
    {
        if (self::queueIsDraining()) {
            NotificationFacade::send($notifiable, $notification);

            return;
        }

        /*
         * `sendNow` ignores `ShouldQueue` rather than requiring its absence,
         * so no notification class changes and the split between the nineteen
         * queued messages and the three that have always been synchronous
         * stays exactly where it is.
         */
        NotificationFacade::sendNow($notifiable, $notification);
    }

    /**
     * Whether anything is actually draining the queue.
     *
     * `QueueHealth::delivering()` is the existing answer, and the one the
     * settings screen and the campaign report already show — so there is one
     * definition of "delivering" rather than a second threshold invented here.
     * It is true for either pulse, the scheduler's heartbeat *or* a bare
     * `queue:work` writing its own, because a worker under supervisor delivers
     * mail perfectly well and touches the cron entry not at all.
     *
     * **`sync` counts as draining, and that is not a concession to tests.** On
     * that connection Laravel delivers a queued notification inline, so the
     * queue is drained by definition and there is no backlog to rescue.
     * `delivering()` cannot see this: it reads the two heartbeats and never
     * `queue.default`, so on `sync` it answers false about a connection that
     * has nothing wrong with it.
     */
    private static function queueIsDraining(): bool
    {
        if (app()->bound(self::DRAINING)) {
            return app()->make(self::DRAINING);
        }

        $draining = config('queue.default') === 'sync' || QueueHealth::delivering();

        app()->instance(self::DRAINING, $draining);

        return $draining;
    }

    private static function guard(callable $send, string $notification): bool
    {
        try {
            $send();

            return true;
        } catch (\Throwable $e) {
            // Deliberately swallowed. The caller has already committed its
            // work; a mail failure must not undo it or surface as a 500.
            Log::error('Notification failed to send', [
                'notification' => $notification,
                'error' => $e->getMessage(),
            ]);

            /*
             * And recorded where somebody will see it, which the queued path
             * does through `QueuedMail::failed()` and this one otherwise would
             * not do at all.
             *
             * `sendNow` runs no job, so there is no `failed()` hook and the
             * throw lands here instead. Without this line, making delivery
             * synchronous would have quietly deleted the one signal that
             * survives a swallowed failure: `mail_error` is what the settings
             * screen renders as a banner, and what a successful test send
             * clears. It closes the same hole for the three notifications that
             * have always been synchronous, where a failed sign-in code used
             * to write nothing at all.
             */
            Setting::put('mail_error', 'Mail could not be delivered — '.$e->getMessage()
                .' ('.now()->toDayDateTimeString().')');

            return false;
        }
    }
}
