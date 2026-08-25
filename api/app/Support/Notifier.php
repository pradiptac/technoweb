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
            fn () => NotificationFacade::send($notifiable, $notification),
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
            fn () => NotificationFacade::route('mail', $address)->notify($notification),
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
            fn () => NotificationFacade::route('mail', $address)->notify($notification),
            $notification::class,
        );
    }

    public static function setting(string $key): ?string
    {
        $value = Setting::where('key', $key)->value('value');

        return blank($value) ? null : $value;
    }

    private static function guard(callable $send, string $notification): void
    {
        try {
            $send();
        } catch (\Throwable $e) {
            // Deliberately swallowed. The caller has already committed its
            // work; a mail failure must not undo it or surface as a 500.
            Log::error('Notification failed to send', [
                'notification' => $notification,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
