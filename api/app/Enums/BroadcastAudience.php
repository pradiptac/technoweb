<?php

namespace App\Enums;

/**
 * Who a broadcast goes to — always narrowed to the people holding an opt-in
 * on the broadcast's channel, whatever the source. A newsletter group or a
 * wishlist says who is *interested*; only a `message_contacts` row says who
 * agreed to be messaged there.
 */
enum BroadcastAudience: string
{
    case OptIns = 'opt_ins';
    case Customers = 'customers';
    case NewsletterGroup = 'newsletter_group';
    case Wishlist = 'wishlist';

    public function label(): string
    {
        return match ($this) {
            self::OptIns => 'Everybody opted in on the channel',
            self::Customers => 'Portal customers opted in',
            self::NewsletterGroup => 'A newsletter group',
            self::Wishlist => 'Wishlist holders of a product',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::OptIns => 'Guests and customers alike: every contact on the channel who opted in and has not opted out.',
            self::Customers => 'Only contacts tied to an active portal account.',
            self::NewsletterGroup => 'The group\'s active subscribers, matched to portal customers by email address, who have opted in on the channel.',
            self::Wishlist => 'Customers holding the product on a wishlist, who have opted in on the channel. Empty until wishlists exist.',
        };
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label(), 'blurb' => $c->blurb()], self::cases());
    }
}
