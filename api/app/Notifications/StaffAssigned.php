<?php

namespace App\Notifications;

/**
 * Something was put on a staff member's plate (C2, docs/notifications.md):
 * a ticket, a lead or a visit assigned, a meeting booked with them, or a
 * customer replying on their ticket. The same message as a mention, under
 * its own catalogue key so each can be worded and switched apart.
 */
class StaffAssigned extends StaffMentioned
{
    public function templateKey(): string
    {
        return 'staff_assigned';
    }
}
