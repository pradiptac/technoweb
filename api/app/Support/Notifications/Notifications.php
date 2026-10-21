<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\Setting;
use App\Models\StaffNotification;
use App\Models\Ticket;
use App\Models\User;
use App\Notifications\StaffAssigned;
use App\Notifications\StaffMentioned;
use App\Support\Alerts\StaffPreferences;
use App\Support\Alerts\StaffPush;
use App\Support\Notifier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * The one writer of the console's bell (C2, docs/notifications.md). Never to
 * the actor, never to an inactive account, never about a screen the person
 * cannot open, and never a failure for the caller — the `Notifier` rule.
 */
final class Notifications
{
    public static function send(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): ?StaffNotification
    {
        try {
            if ($actor !== null && $actor->is($to)) {
                return null;
            }
            if (! $to->is_active || $path === null || ! ScreenAccess::can($to, $path)) {
                return null;
            }

            $row = StaffNotification::create([
                'user_id' => $to->id,
                'kind' => $kind,
                'line' => Str::limit($line, 237),
                'path' => $path,
                'subject_type' => $subject?->getMorphClass(),
                'subject_id' => $subject?->getKey(),
                'actor_id' => $actor?->id,
                'actor_name' => $actor?->name,
            ]);

            if ($deliver && $kind->delivers()) {
                self::deliver($to, $row);
            }

            return $row;
        } catch (Throwable $e) {
            Log::warning('Staff notification failed', ['kind' => $kind->value, 'user' => $to->id, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /** `send()` once the caller's transaction commits — at once when there is none. */
    public static function later(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): void
    {
        DB::afterCommit(fn () => self::send($to, $kind, $line, $path, $subject, $actor, $deliver));
    }

    /** "{actor} assigned {what} to you." — told only when the new assignee is not the actor. */
    public static function assigned(?int $toId, StaffNotificationKind $kind, string $what, string $path, Model $subject, ?User $actor): void
    {
        if ($toId !== null && ($to = User::find($toId)) !== null) {
            self::later($to, $kind, ($actor->name ?? 'Somebody')." assigned {$what} to you.", $path, $subject, $actor);
        }
    }

    /** A customer wrote on a ticket; its engineer hears of it. */
    public static function customerReplied(Ticket $ticket): void
    {
        if ($ticket->assigned_to !== null && ($to = User::find($ticket->assigned_to)) !== null) {
            self::later($to, StaffNotificationKind::TicketCustomerReply, "The customer replied on {$ticket->reference}.", "/admin/tickets/{$ticket->reference}", $ticket);
        }
    }

    private static function deliver(User $to, StaffNotification $row): void
    {
        // The site switch silences delivery for everybody; the bell still fills.
        if (Setting::get('alerts_mentions_enabled') === false) {
            return;
        }

        $prefs = StaffPreferences::for($to);
        if (! $prefs->notify_mentions) {
            return;
        }

        if ($prefs->alert_email) {
            Notifier::send($to, $row->kind->group() === 'mention' ? new StaffMentioned($row) : new StaffAssigned($row));
        }
        if ($prefs->alert_push && ! $prefs->quietAt(now())) {
            StaffPush::send($to, $row->line, [$row->line], (string) $row->path);
        }
    }
}
