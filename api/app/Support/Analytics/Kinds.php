<?php

namespace App\Support\Analytics;

/** The kinds a hit may be, and what the console calls them (C3). */
final class Kinds
{
    public const EVENTS = ['pageview', 'outbound', 'download', 'contact', 'search'];

    public const CONVERSIONS = ['enquiry', 'order_placed', 'order_paid', 'visit_requested', 'meeting_booked', 'event_registered', 'newsletter_signup'];

    /** What "Conversions" counts: a paid order is the conversion, an unpaid placed one is not (and is never counted beside its payment). */
    public const COUNTED = ['enquiry', 'order_paid', 'visit_requested', 'meeting_booked', 'event_registered', 'newsletter_signup'];

    public const CHANNELS = ['search' => 'Search', 'social' => 'Social', 'email' => 'Email', 'referral' => 'Other websites', 'campaign' => 'Campaigns', 'direct' => 'Direct'];

    private const LABELS = [
        'pageview' => 'Page views', 'outbound' => 'Links to other sites', 'download' => 'Downloads', 'contact' => 'Calls, emails and WhatsApp',
        'search' => 'Searches', 'enquiry' => 'Enquiries', 'order_placed' => 'Orders placed', 'order_paid' => 'Orders paid',
        'visit_requested' => 'Visits requested', 'meeting_booked' => 'Meetings booked', 'event_registered' => 'Event registrations',
        'newsletter_signup' => 'Newsletter sign-ups',
    ];

    public static function label(string $kind): string
    {
        return self::LABELS[$kind] ?? $kind;
    }

    public static function valid(string $kind): bool
    {
        return in_array($kind, self::EVENTS, true) || in_array($kind, self::CONVERSIONS, true);
    }
}
