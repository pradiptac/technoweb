<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\QueueHealth;
use Illuminate\Support\Collection;

final class MailStalled implements AlertRule
{
    public function key(): string
    {
        return 'mail_stalled';
    }

    public function role(): Role
    {
        return Role::Admin;
    }

    public function label(): string
    {
        return 'Email not leaving';
    }

    public function thresholdLabel(): string
    {
        return 'after '.AlertSettings::threshold('alert_mail_minutes').' minutes';
    }

    /** The oldest waiting job's age, the figure QueueHealth itself calls the one that matters. */
    public function current(): Collection
    {
        $oldest = QueueHealth::read()['oldest_seconds'] ?? null;
        $limit = AlertSettings::threshold('alert_mail_minutes') * 60;

        return collect(is_int($oldest) && $oldest >= $limit
            ? [new AlertHit('system', 'The oldest email has waited '.intdiv($oldest, 60).' minutes to leave. Check the scheduler.', '/admin/system/status')]
            : []);
    }
}
