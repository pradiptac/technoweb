<?php

namespace Database\Seeders;

use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Enquiry;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * A worked support desk: a customer who can sign in, tickets across every
 * status, a conversation with an internal note in it, and a couple of
 * enquiries.
 *
 * Without this the admin dashboard is a wall of zeros and the ticket queue,
 * the SLA colouring and the internal-note treatment cannot be looked at at
 * all. All of it is invented and must go before launch — see the must-not-ship
 * list in CLAUDE.md.
 *
 * Idempotent: keyed on the customer's email and each ticket's subject, so
 * re-running tops up rather than duplicating.
 */
class DemoSupportSeeder extends Seeder
{
    public const CUSTOMER_EMAIL = 'neil@example.in';

    public const CUSTOMER_PASSWORD = 'Portal-Demo-2026';

    public function run(): void
    {
        $customer = $this->customer();
        $engineer = User::whereHas('roles', fn ($r) => $r->where('slug', 'support_engineer'))->first()
            ?? User::first();

        foreach ($this->tickets() as $spec) {
            $this->ticket($customer, $engineer, $spec);
        }

        $this->enquiries();
    }

    private function customer(): Customer
    {
        return Customer::updateOrCreate(
            ['email' => self::CUSTOMER_EMAIL],
            [
                'name' => 'Neil Basu',
                'company' => 'Meridian Foods',
                'phone' => '+91 98200 11223',
                // Known, and printed by the seeder run, because this account
                // exists to be signed into while looking at the portal.
                'password' => Hash::make(self::CUSTOMER_PASSWORD),
                'is_active' => true,
            ],
        );
    }

    private function ticket(Customer $customer, ?User $engineer, array $spec): void
    {
        $category = TicketCategory::where('slug', $spec['category'])->first()
            ?? TicketCategory::first();

        $existing = Ticket::where('customer_id', $customer->id)
            ->where('subject', $spec['subject'])
            ->first();

        if ($existing) {
            return;
        }

        $ticket = $customer->tickets()->make([
            'subject' => $spec['subject'],
            'description' => $spec['description'],
            'ticket_category_id' => $category?->id,
            'priority' => $spec['priority'],
            'status' => $spec['status'],
            'assigned_to' => $spec['assigned'] ? $engineer?->id : null,
        ]);
        $ticket->save();

        // Backdated so the queue has a spread of ages and the overdue filter
        // has something to find.
        $ticket->forceFill([
            'created_at' => now()->subHours($spec['age_hours']),
            'updated_at' => now()->subHours(max(0, $spec['age_hours'] - 2)),
        ])->save();

        $ticket->logEvent('created', null, TicketStatus::Open->value);

        foreach ($spec['messages'] ?? [] as $message) {
            $author = $message['from'] === 'customer' ? $customer : $engineer;

            if (! $author) {
                continue;
            }

            $row = $ticket->messages()->make([
                'body' => $message['body'],
                'is_internal' => $message['internal'] ?? false,
            ]);
            // associate(), never a literal author_type — the morph map holds
            // "customer" and "user", not class names.
            $row->author()->associate($author);
            $row->save();
        }
    }

    private function enquiries(): void
    {
        foreach ([
            [
                'name' => 'Priya Shah',
                'email' => 'priya.shah@example.in',
                'company' => 'Aurora Diagnostics',
                'phone' => '+91 99300 44556',
                'subject' => 'Wi-Fi for a new clinic floor',
                'message' => 'We are fitting out a third floor and need around fourteen access points with proper segmentation for the clinical devices. Can someone visit to survey?',
            ],
            [
                'name' => 'Rahul Menon',
                'email' => 'rahul@example.in',
                'company' => 'Kelvin Cold Chain',
                'phone' => '+91 90040 22118',
                'subject' => 'AMC renewal and a firewall refresh',
                'message' => 'Our AMC is up in two months and the FortiGate is end of support. Interested in quoting both together?',
            ],
        ] as $enquiry) {
            Enquiry::firstOrCreate(
                ['email' => $enquiry['email'], 'subject' => $enquiry['subject']],
                $enquiry + ['source' => 'contact', 'status' => 'new'],
            );
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function tickets(): array
    {
        return [
            [
                'subject' => 'Switch in the packing hall drops its uplink every afternoon',
                'description' => 'Since the firmware update last Tuesday the switch in the packing hall loses its uplink for about a minute, usually between 2 and 4pm. It comes back on its own. Twelve handhelds go offline with it, so picking stops.',
                'category' => 'network-connectivity', 'priority' => TicketPriority::High, 'status' => TicketStatus::InProgress,
                'assigned' => true, 'age_hours' => 30,
                'messages' => [
                    ['from' => 'staff', 'body' => 'Thanks Neil — we can see the port flapping in the logs. Can you confirm whether the UPS in that cabinet was also replaced during the works?'],
                    ['from' => 'customer', 'body' => 'It was, yes. New APC unit went in the same week.'],
                    ['from' => 'staff', 'internal' => true, 'body' => 'Almost certainly the SFP, not the firmware — same batch as the two we replaced at Kelvin. Bring a spare to site rather than debugging remotely.'],
                    ['from' => 'staff', 'body' => 'We would like to swap the optic on that uplink. Would Thursday morning suit for a short visit?'],
                ],
            ],
            [
                'subject' => 'Request: add three users to the VPN',
                'description' => 'Three new starters in accounts need remote access — details attached in the previous thread. No rush, before month end is fine.',
                'category' => 'new-request-change', 'priority' => TicketPriority::Low, 'status' => TicketStatus::PendingCustomer,
                'assigned' => true, 'age_hours' => 74,
                'messages' => [
                    ['from' => 'staff', 'body' => 'Happy to set these up. Could you confirm which of the three need access to the finance share as well as the desktop?'],
                ],
            ],
            [
                'subject' => 'Backup job failing on the NAS since Sunday',
                'description' => 'The nightly job reports "target volume unavailable" every night since Sunday. Nothing changed that we know of. The volume itself mounts fine when we look at it.',
                'category' => 'backup-recovery', 'priority' => TicketPriority::Critical, 'status' => TicketStatus::Open,
                'assigned' => false, 'age_hours' => 5,
            ],
            [
                'subject' => 'Quote for replacing the boardroom access point',
                'description' => 'The boardroom AP is the old 802.11ac unit and struggles with more than about fifteen people. Can we get a like-for-like Wi-Fi 6 replacement quoted?',
                'category' => 'wi-fi', 'priority' => TicketPriority::Normal, 'status' => TicketStatus::Resolved,
                'assigned' => true, 'age_hours' => 190,
                'messages' => [
                    ['from' => 'staff', 'body' => 'Quote sent over this morning — one U6-Pro plus the mount and an hour on site. Let us know and we will schedule it.'],
                    ['from' => 'customer', 'body' => 'Received, thank you. Approved on our side.'],
                ],
            ],
            [
                'subject' => 'Old ticket: printer on the second floor',
                'description' => 'Printer kept dropping off the network. Resolved by giving it a static reservation.',
                'category' => 'hardware-fault', 'priority' => TicketPriority::Low, 'status' => TicketStatus::Closed,
                'assigned' => true, 'age_hours' => 700,
            ],
        ];
    }
}
