<?php

namespace App\Support\Alerts;

use App\Enums\MessageChannel;
use App\Models\StaffPushSubscription;
use App\Models\User;
use App\Support\Messaging\Providers\Fcm;
use App\Support\Messaging\Providers\ProviderException;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * A staff member's browser notifications (docs/digest-alerts.md), through the
 * FCM provider messaging already configures. It never throws: a failed push
 * must never stop the email.
 */
final class StaffPush
{
    /**
     * @param  list<string>  $lines
     * @return int how many browsers took it
     */
    public static function send(User $user, string $title, array $lines, string $href): int
    {
        if (! MessageChannel::Push->ready()) {
            return 0;
        }
        $sent = 0;
        foreach (StaffPushSubscription::query()->where('user_id', $user->id)->get() as $sub) {
            try {
                (new Fcm)->pushTo($sub->token, $title, implode("\n", array_slice($lines, 0, 3)), $href);
                $sub->forceFill(['failed_at' => null])->save();
                $sent++;
            } catch (ProviderException $e) {
                // A dead browser never delivers again; anything else may be passing.
                $e->revoke ? $sub->delete() : $sub->forceFill(['failed_at' => now()])->save();
            } catch (Throwable $e) {
                Log::warning('Staff push failed', ['user' => $user->id, 'error' => $e->getMessage()]);
                $sub->forceFill(['failed_at' => now()])->save();
            }
        }

        return $sent;
    }
}
