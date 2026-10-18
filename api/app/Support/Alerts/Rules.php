<?php

namespace App\Support\Alerts;

use App\Models\User;
use App\Support\Alerts\Rules\BackupFailedRule;
use App\Support\Alerts\Rules\HealthDrop;
use App\Support\Alerts\Rules\LeadHotUntouched;
use App\Support\Alerts\Rules\MailStalled;
use App\Support\Alerts\Rules\OrderNotDispatched;
use App\Support\Alerts\Rules\ReturnWaiting;
use App\Support\Alerts\Rules\TicketCriticalUnassigned;
use App\Support\Alerts\Rules\TicketOverdue;

/** The one list of alerts (docs/digest-alerts.md). Adding one is a class here and two settings rows. */
final class Rules
{
    /** At most this many hits a rule; a rule that returns this many may have more it did not show. */
    public const CAP = 50;

    /** @return list<AlertRule> */
    public static function all(): array
    {
        return [
            new TicketCriticalUnassigned, new TicketOverdue, new LeadHotUntouched, new OrderNotDispatched,
            new ReturnWaiting, new MailStalled, new BackupFailedRule, new HealthDrop,
        ];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_map(fn (AlertRule $r) => $r->key(), self::all());
    }

    /** `hasRole()` does not pass an administrator, so the admin check is explicit. */
    public static function holds(User $user, AlertRule $rule): bool
    {
        return $user->isAdmin() || $user->hasRole($rule->role());
    }

    /** @return list<AlertRule> */
    public static function forUser(User $user): array
    {
        return array_values(array_filter(self::all(), fn (AlertRule $r) => self::holds($user, $r)));
    }
}
