<?php

namespace App\Enums;

/** What a bell row is about (C2, docs/notifications.md). The console lists none of these; `options()` is sent. */
enum StaffNotificationKind: string
{
    case MentionTicket = 'mention_ticket';
    case MentionLead = 'mention_lead';
    case MentionOrder = 'mention_order';
    case MentionNote = 'mention_note';
    case TicketAssigned = 'ticket_assigned';
    case LeadAssigned = 'lead_assigned';
    case VisitAssigned = 'visit_assigned';
    case MeetingBooked = 'meeting_booked';
    case TicketCustomerReply = 'ticket_customer_reply';
    case JobFinished = 'job_finished';
    case Alert = 'alert';

    public function label(): string
    {
        return match ($this) {
            self::MentionTicket => 'Mentioned on a ticket',
            self::MentionLead => 'Mentioned on a lead',
            self::MentionOrder => 'Mentioned on an order',
            self::MentionNote => 'Mentioned in a team note',
            self::TicketAssigned => 'Ticket assigned to you',
            self::LeadAssigned => 'Lead assigned to you',
            self::VisitAssigned => 'Visit assigned to you',
            self::MeetingBooked => 'Meeting booked with you',
            self::TicketCustomerReply => 'Customer replied',
            self::JobFinished => 'Finished',
            self::Alert => 'Alert',
        };
    }

    public function group(): string
    {
        return match ($this) {
            self::MentionTicket, self::MentionLead, self::MentionOrder, self::MentionNote => 'mention',
            self::Alert => 'alert',
            default => 'assigned',
        };
    }

    /** Whether the row may also go by email and push. An alert already has (B6); a finished job is bell only. */
    public function delivers(): bool
    {
        return $this !== self::Alert && $this !== self::JobFinished;
    }

    /** @return list<array{value: string, label: string, group: string}> */
    public static function options(): array
    {
        return array_map(fn (self $k) => ['value' => $k->value, 'label' => $k->label(), 'group' => $k->group()], self::cases());
    }
}
