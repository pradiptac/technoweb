<?php

namespace App\Support\Mail;

use App\Notifications\ActivationProcedureIssued;
use App\Notifications\ApplicationAcknowledged;
use App\Notifications\BackInStock;
use App\Notifications\BackupFailed;
use App\Notifications\BlockLeadCaptured;
use App\Notifications\CartReminder;
use App\Notifications\ChatLeadCaptured;
use App\Notifications\ChatQuestionUnanswered;
use App\Notifications\CommentAwaitingModeration;
use App\Notifications\CustomerApproved;
use App\Notifications\CustomerRegistered;
use App\Notifications\CustomerRejected;
use App\Notifications\EnquiryAcknowledged;
use App\Notifications\EnquiryReceived;
use App\Notifications\FormAcknowledged;
use App\Notifications\FormSubmitted;
use App\Notifications\JobApplicationReceived;
use App\Notifications\MeetingBooked;
use App\Notifications\MeetingCancelled;
use App\Notifications\MeetingLinkReady;
use App\Notifications\MeetingReminder;
use App\Notifications\MeetingRescheduled;
use App\Notifications\MeetingScheduled;
use App\Notifications\MeetingSyncFailed;
use App\Notifications\NewsletterRejoinRequested;
use App\Notifications\OrderDispatched;
use App\Notifications\OrderPaid;
use App\Notifications\OrderPlaced;
use App\Notifications\OrderReceived;
use App\Notifications\RegistrationAttempted;
use App\Notifications\ResetPassword;
use App\Notifications\ReviewRequested;
use App\Notifications\SignInCodeIssued;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketMerged;
use App\Notifications\TicketReplied;
use App\Notifications\TicketSurveyRequested;
use App\Notifications\VerifyCustomerEmail;
use App\Notifications\VisitCancelled;
use App\Notifications\VisitConfirmed;
use App\Notifications\VisitReminder;
use App\Notifications\VisitRequested;
use App\Notifications\VisitRequestReceived;
use App\Notifications\WishlistBackInStock;
use App\Notifications\WishlistPriceDrop;

/**
 * The 49 entries, kept out of `MessageCatalogue` so that class stays readable.
 *
 * Forty-nine for forty-five classes (the online meetings, 2026-09-29, are
 * seven messages for seven classes): `TicketReplied` is two messages — its
 * customer and desk versions differ in greeting, action label *and* recipient,
 * and one template cannot say both without lying about one of them —
 * `CartReminder` is two, the first basket reminder and the second, and the
 * engineer visits (2026-09-26) add two more pairs: `VisitRequestReceived`
 * (a new request, and a customer changing one) and `VisitConfirmed` (booked,
 * and moved).
 *
 * **Four are `locked`.** The address verification, the password reset and
 * the sign-in code each carry a credential somebody is waiting for at a form,
 * with no other way in: switching one off locks people out, and a CC or BCC
 * on one sends a sign-in code to a second inbox, which is an account takeover.
 * The fourth, the newsletter rejoin (2026-09-28), carries the one thing that
 * may reverse somebody's unsubscribe — their own consent. A copy of that link
 * in a second inbox is the power the suppression screen refuses staff, and
 * switching the message off would leave the signup form's way back silently
 * gone.
 * The flag lives here beside the message rather than as a list of keys
 * in the controller and another in the console, and both read it from the
 * API. Their wording and their sender stay editable — the lock is about
 * delivery and copies, not identity.
 *
 * A `details` variable marked `html` is how a message with a **variable number
 * of lines** is expressed — a labelled fact per detail that happens to be
 * present, an order's items, a form's answers. A subject-and-body template
 * cannot hold a loop, so the loop's output is one placeholder the application
 * builds. Everything else is escaped; that direction must never be reversed.
 */
class MessageCatalogueEntries
{
    private const CUSTOMER = MessageCatalogue::CUSTOMER;

    private const INTERNAL = MessageCatalogue::INTERNAL;

    /** A labelled block the application renders, offered as one placeholder. */
    private static function details(string $about, string $sample): array
    {
        return ['about' => $about, 'sample' => $sample, 'html' => true];
    }

    /**
     * What both basket reminders offer — one list, so the two cannot drift.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function cartReminderVariables(): array
    {
        return [
            'customer_name' => ['about' => 'The account holder\'s name, or "there" for a guest.', 'sample' => 'Priya'],
            'items' => self::details(
                'What is in the basket, one line each, priced today.',
                '<ul><li>1 × Aruba 2930F 24G — ₹98,000.00</li></ul>',
            ),
            'item_count' => ['about' => 'How many things are in it.', 'sample' => '1'],
            'basket_total' => ['about' => 'The total today, formatted.', 'sample' => '₹98,000.00'],
            'basket_url' => ['about' => 'Restores the basket in their browser and opens it.', 'sample' => 'https://www.example.com/store/basket/restore/…'],
            'coupon' => self::details(
                'A sentence offering the reminder coupon — empty when there is none, or the basket cannot use it.',
                '<p>Use the code <strong>COMEBACK10</strong> at the checkout for 10% off.</p>',
            ),
            'coupon_code' => ['about' => 'The reminder coupon\'s code alone, or blank.', 'sample' => 'COMEBACK10'],
            'unsubscribe_url' => ['about' => 'Puts the address on the do-not-mail list.', 'sample' => 'https://www.example.com/newsletter/unsubscribe/…'],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return array_merge(self::tickets(), self::orders(), self::accounts(), self::newsletter(), self::enquiries(), self::visits(), self::meetings());
    }

    /** @return array<string, array<string, mixed>> */
    private static function tickets(): array
    {
        $reference = ['about' => 'The ticket reference, which is what people search their mailbox for.', 'sample' => 'TK-2026-00042'];
        $subject = ['about' => 'What the customer called it.', 'sample' => 'Switch keeps dropping its uplink'];

        return [
            'ticket_created' => [
                'label' => 'New ticket — to the desk',
                'description' => 'Sent to the support address when a customer raises a ticket.',
                'audience' => self::INTERNAL,
                'class' => TicketCreated::class,
                'variables' => [
                    'reference' => $reference,
                    'subject' => $subject,
                    'customer_name' => ['about' => 'Who raised it.', 'sample' => 'Neil Basu'],
                    'company' => ['about' => 'Their company, or blank.', 'sample' => 'Meridian Foods'],
                    'priority' => ['about' => 'Normal, High or Critical.', 'sample' => 'High'],
                    'category' => ['about' => 'The ticket category.', 'sample' => 'Network / connectivity'],
                    'description' => ['about' => 'The first 400 characters of what they wrote.', 'sample' => 'The uplink drops every afternoon, and it started after the last firmware update.'],
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.example.com/admin/tickets/TK-2026-00042'],
                ],
                'subject' => '[{{reference}}] New ticket: {{subject}}',
                'body' => '<p>A new ticket has been raised.</p>'
                    .'<p><strong>{{subject}}</strong></p>'
                    .'<p>From {{customer_name}} at {{company}} · {{priority}} · {{category}}</p>'
                    .'<p>{{description}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],

            'ticket_acknowledged' => [
                'label' => 'Ticket received — to the customer',
                'description' => 'The receipt a customer gets the moment their ticket is logged.',
                'audience' => self::CUSTOMER,
                'class' => TicketAcknowledged::class,
                'variables' => [
                    'reference' => $reference,
                    'subject' => $subject,
                    'due_at' => ['about' => 'When an engineer will respond by, or blank when there is no target.', 'sample' => '14 Sep 2026, 17:00'],
                    'url' => ['about' => 'The ticket in the customer portal.', 'sample' => 'https://www.example.com/portal/tickets/TK-2026-00042'],
                ],
                'subject' => '[{{reference}}] We have your ticket: {{subject}}',
                'body' => '<p>Thanks — this is logged.</p>'
                    .'<p>Your reference is <strong>{{reference}}</strong>. Quote it if you call.</p>'
                    .'<p><strong>{{subject}}</strong></p>'
                    .'<p>An engineer will respond by {{due_at}}.</p>'
                    .'<p><a href="{{url}}">Track this ticket</a></p>'
                    .'<p>Quote {{reference}} in any reply, or use the portal, so the conversation stays on the ticket.</p>',
            ],

            'ticket_replied_customer' => [
                'label' => 'Ticket reply — to the customer',
                'description' => 'Sent when an engineer replies. An internal note never triggers this.',
                'audience' => self::CUSTOMER,
                'class' => TicketReplied::class,
                'variables' => [
                    'reference' => $reference,
                    'subject' => $subject,
                    'body' => ['about' => 'The first 600 characters of the reply.', 'sample' => 'We have rolled that switch back a firmware version — please watch it this afternoon.'],
                    'url' => ['about' => 'The conversation in the portal.', 'sample' => 'https://www.example.com/portal/tickets/TK-2026-00042'],
                ],
                'subject' => '[{{reference}}] New reply: {{subject}}',
                'body' => '<p>There is a reply on your ticket.</p>'
                    .'<p>{{body}}</p>'
                    .'<p><a href="{{url}}">Read and reply</a></p>',
            ],

            'ticket_replied_desk' => [
                'label' => 'Ticket reply — to the desk',
                'description' => 'Sent to the support address when a customer replies to their own ticket.',
                'audience' => self::INTERNAL,
                'class' => TicketReplied::class,
                'variables' => [
                    'reference' => $reference,
                    'subject' => $subject,
                    'body' => ['about' => 'The first 600 characters of the reply.', 'sample' => 'It dropped again at 3pm, same as before.'],
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.example.com/admin/tickets/TK-2026-00042'],
                ],
                'subject' => '[{{reference}}] New reply: {{subject}}',
                'body' => '<p>A customer has replied.</p>'
                    .'<p>{{body}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],

            'ticket_merged' => [
                'label' => 'Tickets merged — to the customer',
                'description' => 'Sent when the desk merges one of their tickets into another, so they know which reference to quote.',
                'audience' => self::CUSTOMER,
                'class' => TicketMerged::class,
                'variables' => [
                    'reference' => ['about' => 'The ticket the conversation now lives on.', 'sample' => 'TK-2026-00042'],
                    'subject' => ['about' => 'That ticket\'s subject.', 'sample' => 'Switch keeps dropping its uplink'],
                    'source_reference' => ['about' => 'The ticket that was closed by the merge.', 'sample' => 'TK-2026-00047'],
                    'source_subject' => ['about' => 'Its subject.', 'sample' => 'Same switch, again'],
                    'url' => ['about' => 'The surviving ticket in the customer portal.', 'sample' => 'https://www.example.com/portal/tickets/TK-2026-00042'],
                ],
                'subject' => '[{{reference}}] Your ticket {{source_reference}} has been merged into it',
                'body' => '<p>We have merged two of your tickets.</p>'
                    .'<p><strong>{{source_reference}}</strong> ({{source_subject}}) was about the same thing as <strong>{{reference}}</strong> ({{subject}}), so everything you sent on it is now on the one ticket.</p>'
                    .'<p>Quote {{reference}} from now on. A reply to the old reference still reaches us, and it lands on the right ticket.</p>'
                    .'<p><a href="{{url}}">Open the ticket</a></p>',
            ],

            /*
             * The satisfaction survey, sent once when a ticket is closed. The
             * five ratings are one HTML placeholder built by `Survey`, so the
             * colours and the links stay in code and the editor writes the
             * words around them.
             */
            'ticket_survey' => [
                'label' => 'Satisfaction survey — to the customer',
                'description' => 'Sent once, when a ticket is closed (never for a ticket merged into another): five one-click ratings from Very Bad to Excellent. Switch the survey off under Tickets → Email to ticket → Satisfaction survey.',
                'audience' => self::CUSTOMER,
                'class' => TicketSurveyRequested::class,
                'variables' => [
                    'customer_name' => ['about' => 'Who it is for.', 'sample' => 'Neil Basu'],
                    'reference' => ['about' => 'The ticket that was closed.', 'sample' => 'TK-2026-00042'],
                    'subject' => ['about' => 'Its subject.', 'sample' => 'Switch keeps dropping its uplink'],
                    'rating_buttons' => self::details('The five ratings, Very Bad to Excellent, as buttons. Each opens the survey with that answer chosen.', '<div><a href="https://www.example.com/ticket-survey/0000?rating=1">Very Bad</a> <a href="https://www.example.com/ticket-survey/0000?rating=5">Excellent</a></div>'),
                    'survey_url' => ['about' => 'The survey page, with no answer chosen.', 'sample' => 'https://www.example.com/ticket-survey/0000'],
                ],
                'subject' => '[{{reference}}] How did we do?',
                'body' => '<p>Dear {{customer_name}},</p>'
                    .'<p>Thank you for getting in touch. Your ticket <strong>{{reference}}</strong> ({{subject}}) is now closed, and we would like to hear how it went. Your answer helps us keep improving our support.</p>'
                    .'<p><strong>How would you rate your overall satisfaction with the resolution you received from our support team?</strong></p>'
                    .'{{rating_buttons}}'
                    .'<p>It takes a few seconds, and you can add a comment if you wish.</p>',
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function orders(): array
    {
        $number = ['about' => 'The order number.', 'sample' => 'ORD-2026-00117'];
        $customer = ['about' => 'The name on the order.', 'sample' => 'Priya Sharma'];
        $total = ['about' => 'The total, formatted.', 'sample' => '₹1,18,000.10'];

        return [
            /*
             * The sales order. Its second half follows the payment method —
             * a Pay link for the gateway, our account details for a transfer,
             * the UPI ID for UPI, "pay the courier" for cash on delivery — and
             * that block is read from the same array the order page renders,
             * so the two cannot show different account numbers. `{{payment}}`
             * is the whole of that block; an editor who removes it removes
             * the instructions, which the label says.
             */
            'order_placed' => [
                'label' => 'Order placed — to the customer',
                'description' => 'The sales order, sent the moment an order is saved. The closing block follows how they chose to pay.',
                'audience' => self::CUSTOMER,
                'class' => OrderPlaced::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'total' => $total,
                    'gst' => ['about' => 'The GST included in the total.', 'sample' => '₹18,000.02'],
                    'items' => self::details(
                        'What was ordered, one line each.',
                        '<ul><li>2 × Aruba 2930F 24G — ₹98,000.00</li><li>1 × Installation — ₹20,000.10</li></ul>',
                    ),
                    'payment' => self::details(
                        'How to pay, for the method they chose — the Pay link, our bank details, the UPI ID, or "pay the courier". Remove it and the email carries no instructions.',
                        '<p><strong>Transfer the amount to this account</strong></p><p>Quote the order number as the reference so we can match the payment.</p><p>Amount due: <strong>₹1,18,000.10</strong></p><pre>Your Company Pvt Ltd
HDFC Bank, A/c 50200012345678
IFSC HDFC0001234</pre><p>Quote <strong>ORD-2026-00117</strong> as the reference — it is how the payment is matched to this order.</p>',
                    ),
                    'payment_method' => ['about' => 'The method they chose, by name.', 'sample' => 'Bank transfer (NEFT / IMPS / RTGS)'],
                    'payment_status' => ['about' => 'One phrase for the subject line: payment not yet made, confirmed, pay on delivery, awaiting your transfer, or awaiting your UPI payment.', 'sample' => 'awaiting your transfer'],
                    'url' => ['about' => 'The order page, reached by the link in this email.', 'sample' => 'https://www.example.com/order/ORD-2026-00117/open?token=…'],
                ],
                'subject' => 'Your order {{order_number}} — {{payment_status}}',
                'body' => '<p>Thanks, {{customer_name}}.</p>'
                    .'<p>Your order <strong>{{order_number}}</strong> is saved. You chose to pay by {{payment_method}}.</p>'
                    .'{{items}}'
                    .'<p>Total: <strong>{{total}}</strong> (including GST of {{gst}}).</p>'
                    .'{{payment}}'
                    .'<p><a href="{{url}}">View your order</a></p>'
                    .'<p>Keep this link — it is how you come back to the order at any time.</p>',
            ],

            'order_paid' => [
                'label' => 'Payment received — to the customer',
                'description' => 'The receipt, sent the moment a payment settles.',
                'audience' => self::CUSTOMER,
                'class' => OrderPaid::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'total' => $total,
                    'gst' => ['about' => 'The GST included in the total.', 'sample' => '₹18,000.02'],
                    'items' => self::details(
                        'What was bought, one line each.',
                        '<ul><li>2 × Aruba 2930F 24G — ₹98,000.00</li><li>1 × Installation — ₹20,000.10</li></ul>',
                    ),
                    'notes' => self::details(
                        'Anything that applies to this order — an activation code being prepared, tracking to follow, a GST invoice by hand.',
                        '<p>We will email the tracking details as soon as it is dispatched.</p>',
                    ),
                    'url' => ['about' => 'The order page.', 'sample' => 'https://www.example.com/order/ORD-2026-00117/open?token=…'],
                ],
                'subject' => 'Payment received for {{order_number}}',
                'body' => '<p>Thank you, {{customer_name}}.</p>'
                    .'<p>We have your payment of <strong>{{total}}</strong>, which includes GST of {{gst}}.</p>'
                    .'{{items}}{{notes}}'
                    .'<p><a href="{{url}}">View your order</a></p>'
                    .'<p>Keep this link — it is how you come back to the order at any time.</p>',
            ],

            'order_dispatched' => [
                'label' => 'Order dispatched — to the customer',
                'description' => 'Sent when the order status moves to dispatched, not when tracking is typed.',
                'audience' => self::CUSTOMER,
                'class' => OrderDispatched::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'courier' => ['about' => 'The courier, or blank.', 'sample' => 'Blue Dart'],
                    'tracking_number' => ['about' => 'The consignment number, or blank.', 'sample' => '7712 3456 8890'],
                    'notes' => ['about' => 'Anything the desk added about the shipment.', 'sample' => 'Left with building reception.'],
                    'url' => ['about' => 'The courier tracking page when there is one, otherwise the order.', 'sample' => 'https://www.bluedart.com/tracking/7712…'],
                ],
                'subject' => 'Your order {{order_number}} is on its way',
                'body' => '<p>Good news, {{customer_name}}.</p>'
                    .'<p>Order <strong>{{order_number}}</strong> has been dispatched.</p>'
                    .'<p>Courier: <strong>{{courier}}</strong> · Tracking: <strong>{{tracking_number}}</strong></p>'
                    .'<p>{{notes}}</p>'
                    .'<p><a href="{{url}}">Track this shipment</a></p>',
            ],

            'order_received' => [
                'label' => 'Paid order — to the desk',
                'description' => 'Sent to the support address when an order is paid, leading with anything outstanding.',
                'audience' => self::INTERNAL,
                'class' => OrderReceived::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'customer_email' => ['about' => 'Who to reply to.', 'sample' => 'priya@meridianfoods.test'],
                    'total' => $total,
                    'items' => self::details('What was bought, one line each.', '<ul><li>2 × Aruba 2930F 24G</li></ul>'),
                    'notes' => self::details(
                        'What is waiting on somebody — an activation code outstanding, a parcel to dispatch.',
                        '<p><strong>An activation code is outstanding.</strong> The customer is waiting on it.</p>',
                    ),
                    'url' => ['about' => 'The order in the console.', 'sample' => 'https://www.example.com/admin/store/orders/ORD-2026-00117'],
                ],
                'subject' => 'New order {{order_number}} — {{total}}',
                'body' => '<p>A paid order has come in.</p>'
                    .'<p><strong>{{order_number}}</strong> from {{customer_name}} ({{customer_email}}).</p>'
                    .'{{items}}{{notes}}'
                    .'<p><a href="{{url}}">Open the order</a></p>',
            ],

            'activation_procedure_issued' => [
                'label' => 'How to activate a purchase — to the customer',
                'description' => 'Sent when activation codes are issued. The code itself is never in the email.',
                'audience' => self::CUSTOMER,
                'class' => ActivationProcedureIssued::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'products' => ['about' => 'What the code is for.', 'sample' => 'Veeam Backup Essentials'],
                    'steps' => self::details('The activation steps written on the product, as text.', '<p>Sign in at the vendor portal and enter the key under Licences.</p>'),
                    'url' => ['about' => 'The order page, where the code is revealed.', 'sample' => 'https://www.example.com/order/ORD-2026-00117/open?token=…'],
                ],
                'subject' => 'How to activate your purchase — {{order_number}}',
                'body' => '<p>Hello {{customer_name}},</p>'
                    .'<p>Your activation code for {{products}} is ready.</p>'
                    .'<p>For your security the code is not included in this email. Open your order to reveal it — we record each time it is shown, which is what lets us help if it is ever disputed.</p>'
                    .'<p><a href="{{url}}">Open your order</a></p>'
                    .'{{steps}}'
                    .'<p>If anything does not work, reply to this message and we will pick it up.</p>',
            ],

            /*
             * The back-in-stock notice. One message per request, sent by the
             * queued job when the shelf is refilled; the price is the price
             * that day. The cancel link removes this notice alone — it is not
             * an unsubscribe and must not read like one.
             */
            'back_in_stock' => [
                'label' => 'Back in stock — to whoever asked',
                'description' => 'Sent once when a product somebody asked to hear about has stock again.',
                'audience' => self::CUSTOMER,
                'class' => BackInStock::class,
                'variables' => [
                    'product_name' => ['about' => 'The product.', 'sample' => 'Cisco CBS350-24T-4G'],
                    'variation_name' => ['about' => 'The configuration they asked about, or blank.', 'sample' => '48 port'],
                    'price' => ['about' => 'The price now, formatted.', 'sample' => '₹23,600'],
                    'url' => ['about' => 'The product page.', 'sample' => 'https://www.example.com/store/products/cisco-cbs350-24t-4g'],
                    'cancel_url' => ['about' => 'Removes this one notice.', 'sample' => 'https://www.example.com/store/notify/cancel/…'],
                ],
                'subject' => '{{product_name}} is back in stock',
                'body' => '<p>Good news.</p>'
                    .'<p><strong>{{product_name}} {{variation_name}}</strong> is back in stock at {{price}}.</p>'
                    .'<p>You asked us to let you know. This is the one message we will send about it.</p>'
                    .'<p><a href="{{url}}">See the product</a></p>'
                    .'<p>Did not ask for this? <a href="{{cancel_url}}">Cancel the notice</a> and we will not email you about it again.</p>',
            ],

            /*
             * The two abandoned-basket reminders (2026-09-25). One class,
             * `CartReminder`, two messages — the `ticket_replied` shape — so
             * the first and the second are worded and switched off on their
             * own. Sent by `technoware:remind-abandoned-carts` inside the
             * quiet-hours window only, never to an address on the suppression
             * list, and each carries an unsubscribe that puts it there.
             * `{{coupon}}` is empty unless the second reminder has a code the
             * basket could actually use.
             */
            'cart_reminder_1' => [
                'label' => 'Basket reminder, first — to the shopper',
                'description' => 'Sent once, a set number of hours after a basket with an address on it goes quiet. Store → Settings holds the switch and the delay.',
                'audience' => self::CUSTOMER,
                'class' => CartReminder::class,
                'variables' => self::cartReminderVariables(),
                'subject' => 'You left something in your basket',
                'body' => '<p>Hello {{customer_name}},</p>'
                    .'<p>You started an order with us and did not finish it. Your basket is saved:</p>'
                    .'{{items}}'
                    .'<p>Total: <strong>{{basket_total}}</strong> including GST.</p>'
                    .'<p><a href="{{basket_url}}">Return to your basket</a></p>'
                    .'<p>Prices and stock are checked again when you order, so the basket shows today\'s figures.</p>'
                    .'<p>Rather not hear about baskets? <a href="{{unsubscribe_url}}">Unsubscribe</a> and we will not email you about one again.</p>',
            ],

            'cart_reminder_2' => [
                'label' => 'Basket reminder, second — to the shopper',
                'description' => 'The last one, a set number of days after the basket went quiet. Carries the reminder coupon from Store → Settings when one is set and the basket can use it.',
                'audience' => self::CUSTOMER,
                'class' => CartReminder::class,
                'variables' => self::cartReminderVariables(),
                'subject' => 'Your basket is still waiting',
                'body' => '<p>Hello {{customer_name}},</p>'
                    .'<p>The things you chose are still in your basket, and we have kept it for you.</p>'
                    .'{{items}}'
                    .'<p>Total: <strong>{{basket_total}}</strong> including GST.</p>'
                    .'{{coupon}}'
                    .'<p><a href="{{basket_url}}">Return to your basket</a></p>'
                    .'<p>This is the last reminder we will send about it.</p>'
                    .'<p>Rather not hear about baskets? <a href="{{unsubscribe_url}}">Unsubscribe</a> and we will not email you about one again.</p>',
            ],

            'wishlist_back_in_stock' => [
                'label' => 'Wishlist item back in stock — to whoever saved it',
                'description' => 'Sent once when something on a wishlist that had run out has stock again, and again only after it runs out once more. Promotional: held until the quiet-hours window opens.',
                'audience' => self::CUSTOMER,
                'class' => WishlistBackInStock::class,
                'variables' => [
                    'product_name' => ['about' => 'The product, and the option saved if there was one.', 'sample' => 'Cisco CBS350-24T-4G — 48 port'],
                    'price' => ['about' => 'The price now, formatted.', 'sample' => '₹23,600'],
                    'url' => ['about' => 'The product page.', 'sample' => 'https://www.example.com/store/products/cisco-cbs350-24t-4g'],
                    'wishlist_url' => ['about' => 'Their wishlist — the portal’s for an account, the shop’s for a guest.', 'sample' => 'https://www.example.com/portal/wishlist'],
                    'stop_url' => ['about' => 'Stops wishlist emails. Not a newsletter unsubscribe; the list stays.', 'sample' => 'https://www.example.com/store/wishlist/stop/…'],
                ],
                'subject' => '{{product_name}} is back in stock',
                'body' => '<p>Good news.</p>'
                    .'<p><strong>{{product_name}}</strong>, on your wishlist, is back in stock at {{price}}.</p>'
                    .'<p><a href="{{url}}">See the product</a></p>'
                    .'<p><a href="{{wishlist_url}}">Your wishlist</a> · <a href="{{stop_url}}">Stop these emails</a> — your list stays as it is.</p>',
            ],
            'wishlist_price_drop' => [
                'label' => 'Wishlist price drop — to whoever saved it',
                'description' => 'Sent once per drop when something on a wishlist costs at least the Store setting’s percentage less than when it was saved or last announced. Promotional: held until the quiet-hours window opens.',
                'audience' => self::CUSTOMER,
                'class' => WishlistPriceDrop::class,
                'variables' => [
                    'product_name' => ['about' => 'The product, and the option saved if there was one.', 'sample' => 'Cisco CBS350-24T-4G'],
                    'old_price' => ['about' => 'What it cost when saved, or when they were last told.', 'sample' => '₹25,000'],
                    'new_price' => ['about' => 'What it costs now.', 'sample' => '₹22,500'],
                    'saving_percent' => ['about' => 'How much less, as a whole percentage.', 'sample' => '10'],
                    'url' => ['about' => 'The product page.', 'sample' => 'https://www.example.com/store/products/cisco-cbs350-24t-4g'],
                    'wishlist_url' => ['about' => 'Their wishlist.', 'sample' => 'https://www.example.com/portal/wishlist'],
                    'stop_url' => ['about' => 'Stops wishlist emails. Not a newsletter unsubscribe; the list stays.', 'sample' => 'https://www.example.com/store/wishlist/stop/…'],
                ],
                'subject' => '{{product_name}} is now {{new_price}}',
                'body' => '<p>A price came down.</p>'
                    .'<p><strong>{{product_name}}</strong>, on your wishlist, was {{old_price}} and is now {{new_price}} — {{saving_percent}}% less.</p>'
                    .'<p><a href="{{url}}">See the product</a></p>'
                    .'<p><a href="{{wishlist_url}}">Your wishlist</a> · <a href="{{stop_url}}">Stop these emails</a> — your list stays as it is.</p>',
            ],

            /*
             * "How was it?" — once per order, a few days after delivery, by
             * `technoware:request-reviews`. The list holds only the products
             * the customer has not reviewed yet, each linking to its page
             * with the review dialog open.
             */
            'review_request' => [
                'label' => 'How was it? — review request to the customer',
                'description' => 'Sent once per order, a few days after it was delivered (Store → Settings says how many), asking for a review of each product.',
                'audience' => self::CUSTOMER,
                'class' => ReviewRequested::class,
                'variables' => [
                    'customer_name' => $customer,
                    'order_number' => $number,
                    'products' => self::details('A link to review each product still to be reviewed, as a list.', '<ul><li><a href="https://www.example.com/store/products/cisco-cbs350-24t-4g?review=1">Cisco CBS350-24T-4G</a></li></ul>'),
                ],
                'subject' => 'How was your order {{order_number}}?',
                'body' => '<p>Hello {{customer_name}},</p>'
                    .'<p>We hope everything arrived as it should. A line or two about what you bought helps the next person decide — and tells us what to keep doing.</p>'
                    .'{{products}}'
                    .'<p>Every review is read by a person before it appears. Thank you for taking the time.</p>',
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function accounts(): array
    {
        return [
            'customer_approved' => [
                'label' => 'Portal account activated — to the customer',
                'description' => 'Sent when staff approve a portal registration.',
                'audience' => self::CUSTOMER,
                'class' => CustomerApproved::class,
                'variables' => [
                    'customer_name' => ['about' => 'Who it is for.', 'sample' => 'Neil Basu'],
                    'url' => ['about' => 'The portal sign-in page.', 'sample' => 'https://www.example.com/portal/login'],
                ],
                'subject' => 'Your '.MailBrand::name().' support account is active',
                'body' => '<p>You are all set, {{customer_name}}.</p>'
                    .'<p>Your support portal account has been approved. You can sign in and raise a ticket whenever you need us.</p>'
                    .'<p><a href="{{url}}">Sign in to the portal</a></p>'
                    .'<p>Before you open a ticket, it is worth a look at the knowledge base — a lot of questions are answered there already.</p>',
            ],

            'customer_rejected' => [
                'label' => 'Registration not accepted — to the customer',
                'description' => 'Sent when staff reject a portal registration. The staff note is never included.',
                'audience' => self::CUSTOMER,
                'class' => CustomerRejected::class,
                'variables' => [
                    'support_email' => ['about' => 'Where to write back, or blank when none is set.', 'sample' => 'support@example.com'],
                ],
                'subject' => 'About your '.MailBrand::name().' portal registration',
                'body' => '<p>Thanks for registering.</p>'
                    .'<p>We were not able to activate a support portal account for this address.</p>'
                    .'<p>This usually means we could not match the address to a current support agreement.</p>'
                    .'<p>If you think that is wrong, reply to {{support_email}} and we will sort it out.</p>',
            ],

            'customer_registered' => [
                'label' => 'Somebody registered — to the desk',
                'description' => 'Sent to the support address when a registration is confirmed.',
                'audience' => self::INTERNAL,
                'class' => CustomerRegistered::class,
                'variables' => [
                    'customer_name' => ['about' => 'Who registered.', 'sample' => 'Neil Basu'],
                    'customer_email' => ['about' => 'Their address.', 'sample' => 'neil@meridianfoods.test'],
                    'status_line' => ['about' => 'Whether it is waiting for approval or already active.', 'sample' => 'A new portal account is waiting for approval.'],
                    'details' => self::details('Their company, phone and whether the address is confirmed, where each is known.', '<p><strong>Company:</strong> Meridian Foods</p>'),
                    'url' => ['about' => 'The account in the console.', 'sample' => 'https://www.example.com/admin/customers/23'],
                ],
                'subject' => 'New portal registration: {{customer_name}}',
                'body' => '<p>Someone has registered.</p>'
                    .'<p>{{status_line}}</p>'
                    .'<p><strong>Name:</strong> {{customer_name}}<br><strong>Email:</strong> {{customer_email}}</p>'
                    .'{{details}}'
                    .'<p><a href="{{url}}">Review the account</a></p>',
            ],

            'registration_attempted' => [
                'label' => 'Somebody used your address — to the account holder',
                'description' => 'Sent to the real account holder when a registration is attempted with their address.',
                'audience' => self::CUSTOMER,
                'class' => RegistrationAttempted::class,
                'variables' => [
                    'url' => ['about' => 'The portal sign-in page.', 'sample' => 'https://www.example.com/portal/login'],
                ],
                'subject' => 'Someone tried to register with your address',
                'body' => '<p>You already have an account.</p>'
                    .'<p>Somebody just filled in the portal registration form using this address. You already have an account, so nothing was created and nothing has changed.</p>'
                    .'<p>If that was you, sign in with your existing password instead.</p>'
                    .'<p><a href="{{url}}">Sign in</a></p>'
                    .'<p>Forgotten it? Use the “Forgotten your password?” link on that page.</p>',
            ],

            'verify_customer_email' => [
                'label' => 'Confirm your email address — to the registrant',
                'description' => 'Sent the moment somebody registers. Goes out during the request, not through the queue.',
                'audience' => self::CUSTOMER,
                'locked' => true,
                'class' => VerifyCustomerEmail::class,
                'variables' => [
                    'url' => ['about' => 'The confirmation link. Works once.', 'sample' => 'https://www.example.com/portal/verify-email?token=…'],
                    'hours' => ['about' => 'How long the link lasts.', 'sample' => '24'],
                ],
                'subject' => 'Confirm your email address',
                'body' => '<p>Almost there.</p>'
                    .'<p>Confirm this address so we know we can reach you about your support tickets.</p>'
                    .'<p><a href="{{url}}">Confirm my address</a></p>'
                    .'<p>This link works once and expires in {{hours}} hours.</p>'
                    .'<p>If you did not ask for this, you can ignore this email — no account will be created.</p>',
            ],

            'reset_password' => [
                'label' => 'Reset your password',
                'description' => 'Sent for both staff and customers. Goes out during the request, not through the queue.',
                'audience' => self::CUSTOMER,
                'locked' => true,
                'class' => ResetPassword::class,
                'variables' => [
                    'url' => ['about' => 'The reset link. Works once.', 'sample' => 'https://www.example.com/portal/reset-password?token=…'],
                    'minutes' => ['about' => 'How long the link lasts.', 'sample' => '60'],
                ],
                'subject' => 'Reset your '.MailBrand::name().' password',
                'body' => '<p>Password reset.</p>'
                    .'<p>Someone asked to reset the password for this address.</p>'
                    .'<p><a href="{{url}}">Choose a new password</a></p>'
                    .'<p>This link works once and expires in {{minutes}} minutes.</p>'
                    .'<p>If you did not ask for this, you can ignore this email — nothing will change.</p>',
            ],

            'sign_in_code_issued' => [
                'label' => 'Your sign-in code',
                'description' => 'The six-digit code, for the portal or the console. Sent during the request — somebody is waiting at a form.',
                'audience' => self::CUSTOMER,
                'locked' => true,
                'class' => SignInCodeIssued::class,
                'variables' => [
                    'code' => ['about' => 'The six digits. Also in the subject, which is what lets a phone offer it.', 'sample' => '417 302'],
                    'where' => ['about' => 'Which door the code is for.', 'sample' => 'the '.MailBrand::name().' support portal'],
                    'minutes' => ['about' => 'How long it lasts.', 'sample' => '10'],
                ],
                'subject' => 'Your sign-in code: {{code}}',
                'body' => '<p>Your sign-in code.</p>'
                    .'<p>Enter this code to sign in to {{where}}:</p>'
                    .'<p><strong>{{code}}</strong></p>'
                    .'<p>It expires in {{minutes}} minutes and can be used once.</p>'
                    .'<p>If you did not ask to sign in, ignore this email — nobody can use the code without it, and it will expire on its own. If codes keep arriving, tell us.</p>',
            ],
        ];
    }

    /**
     * The way back for somebody who unsubscribed (2026-09-28,
     * `docs/newsletter.md` "Rejoining after an unsubscribe"). Echoes nothing
     * the public form was given — not even the name — for the reason the two
     * acknowledgements below give.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function newsletter(): array
    {
        return [
            'newsletter_rejoin' => [
                'label' => 'Confirm rejoining the newsletter — to the address',
                'description' => 'Sent when an address that unsubscribed signs up again through the site. Nothing changes until the link is followed; at most one a day per address.',
                'audience' => self::CUSTOMER,
                'locked' => true,
                'class' => NewsletterRejoinRequested::class,
                'variables' => [
                    'url' => ['about' => 'The confirmation link. Puts this address back on the list.', 'sample' => 'https://www.example.com/newsletter/rejoin/…'],
                    'days' => ['about' => 'How long the link lasts.', 'sample' => '7'],
                ],
                'subject' => 'Confirm you want to rejoin the '.MailBrand::name().' newsletter',
                'body' => '<p>Welcome back?</p>'
                    .'<p>Somebody asked to sign this address up to our newsletter. You unsubscribed earlier, so we will not add you back unless you confirm it.</p>'
                    .'<p><a href="{{url}}">Yes, add me back</a></p>'
                    .'<p>The link expires in {{days}} days.</p>'
                    .'<p>If you did not ask for this, ignore this email — nothing changes, and you stay unsubscribed.</p>',
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function enquiries(): array
    {
        return [
            'enquiry_received' => [
                'label' => 'Website enquiry — to the sales inbox',
                'description' => 'Sent when somebody uses the contact form. Replying goes to the enquirer.',
                'audience' => self::INTERNAL,
                'class' => EnquiryReceived::class,
                'variables' => [
                    'name' => ['about' => 'Who wrote in.', 'sample' => 'Priya Sharma'],
                    'company' => ['about' => 'Their company, or blank.', 'sample' => 'Meridian Foods'],
                    'email' => ['about' => 'Their address.', 'sample' => 'priya@meridianfoods.test'],
                    'phone' => ['about' => 'Their number, or blank.', 'sample' => '+91 98765 43210'],
                    'subject' => ['about' => 'What they said it was about.', 'sample' => 'Firewall replacement'],
                    'message' => ['about' => 'The first 800 characters of the message.', 'sample' => 'We are replacing two ageing firewalls across our Mumbai and Pune sites.'],
                    'lead' => self::details('The lead score and a link to the pipeline record.', '<p><strong>Score:</strong> 78 / 100 — hot</p>'),
                ],
                'subject' => 'Website enquiry: {{subject}}',
                'body' => '<p>New enquiry from the website.</p>'
                    .'<p><strong>{{name}}</strong> · {{company}}</p>'
                    .'<p>{{email}} · {{phone}}</p>'
                    .'<p>{{message}}</p>'
                    .'{{lead}}',
            ],

            'form_submitted' => [
                'label' => 'Editor-built form — to the sales inbox',
                'description' => 'Sent when somebody uses a form built in the console. Goes to that form’s address when it has one.',
                'audience' => self::INTERNAL,
                'class' => FormSubmitted::class,
                'variables' => [
                    'form_name' => ['about' => 'Which form it was.', 'sample' => 'Request a site survey'],
                    'answers' => self::details(
                        'Every answer, labelled as the form labels them. A form’s questions are whatever an editor built, so this is one block rather than a fixed set.',
                        '<p><strong>Name:</strong> Priya Sharma</p><p><strong>Sites:</strong> 2</p>',
                    ),
                    'lead' => self::details('The lead score and a link to the pipeline record.', '<p><strong>Score:</strong> 64 / 100 — warm</p>'),
                ],
                'subject' => 'Website form: {{form_name}}',
                'body' => '<p>New submission from {{form_name}}.</p>{{answers}}{{lead}}',
            ],

            'job_application_received' => [
                'label' => 'Job application — to the careers inbox',
                'description' => 'Sent when somebody applies for a vacancy. The CV is never attached.',
                'audience' => self::INTERNAL,
                'class' => JobApplicationReceived::class,
                'variables' => [
                    'job_title' => ['about' => 'The role applied for.', 'sample' => 'Network Engineer'],
                    'name' => ['about' => 'The applicant.', 'sample' => 'Arun Mehta'],
                    'email' => ['about' => 'Their address.', 'sample' => 'arun@example.test'],
                    'details' => self::details('Phone, current employer and years of experience, where each is given.', '<p><strong>Phone:</strong> +91 98765 43210</p>'),
                    'url' => ['about' => 'The application in the console.', 'sample' => 'https://www.example.com/admin/applications/5'],
                ],
                'subject' => 'Application: {{job_title}} — {{name}}',
                'body' => '<p>A new application.</p>'
                    .'<p><strong>Role:</strong> {{job_title}}<br><strong>Name:</strong> {{name}}<br><strong>Email:</strong> {{email}}</p>'
                    .'{{details}}'
                    .'<p><a href="{{url}}">Open the application</a></p>'
                    .'<p>The CV is on the record — it is not attached to this email on purpose.</p>',
            ],

            'application_acknowledged' => [
                'label' => 'Application received — to the applicant',
                'description' => 'The receipt somebody gets after applying for a vacancy.',
                'audience' => self::CUSTOMER,
                'class' => ApplicationAcknowledged::class,
                'variables' => [
                    'name' => ['about' => 'The applicant.', 'sample' => 'Arun Mehta'],
                    'job_title' => ['about' => 'The role applied for.', 'sample' => 'Network Engineer'],
                    'retention_months' => ['about' => 'How long applications are kept.', 'sample' => 'six'],
                ],
                'subject' => 'We have your application — {{job_title}}',
                'body' => '<p>Thank you, {{name}}.</p>'
                    .'<p>Your application for <strong>{{job_title}}</strong> has reached us, along with your CV.</p>'
                    .'<p>A member of the team reads every application. If your experience lines up with what the role needs, we will be in touch to arrange a conversation.</p>'
                    .'<p>We keep applications on file for {{retention_months}} months and then delete them, CV included.</p>',
            ],

            /*
             * The two receipts, which the desk notifications above had no
             * counterpart for until now.
             *
             * Neither echoes what was submitted back. These are messages the
             * server will send to any address typed into a public form, so
             * fixed content is a nuisance to abuse and content the sender
             * supplies is a relay — which is also why an editor customising
             * them is offered the person's name and what they wrote in about,
             * and not the message itself.
             */
            'enquiry_acknowledged' => [
                'label' => 'Enquiry received — to the enquirer',
                'description' => 'The receipt somebody gets after using the contact or enquiry form. Sent to the address they gave.',
                'audience' => self::CUSTOMER,
                'class' => EnquiryAcknowledged::class,
                'variables' => [
                    'name' => ['about' => 'Who wrote in.', 'sample' => 'Priya Sharma'],
                    'subject' => ['about' => 'What they said it was about, or “your enquiry” when they did not say.', 'sample' => 'Firewall replacement'],
                ],
                'subject' => 'We have your enquiry',
                'body' => '<p>Thank you, {{name}}.</p>'
                    .'<p>We have your enquiry about <strong>{{subject}}</strong> and somebody will be in touch.</p>'
                    .'<p>If it is urgent, calling is faster than waiting for a reply to this.</p>',
            ],

            'form_acknowledged' => [
                'label' => 'Form submission received — to the sender',
                'description' => 'The receipt for a form built in the console. Sent only when that form collected an email address — a form that asks for none acknowledges nobody.',
                'audience' => self::CUSTOMER,
                'class' => FormAcknowledged::class,
                'variables' => [
                    'name' => ['about' => 'Who sent it, where the form asked for a name. Blank when it did not.', 'sample' => 'Priya Sharma'],
                    'form_name' => ['about' => 'Which form they used.', 'sample' => 'Request a site survey'],
                ],
                'subject' => 'We have your message',
                'body' => '<p>Thank you, {{name}}.</p>'
                    .'<p>We have your <strong>{{form_name}}</strong> submission and somebody will be in touch.</p>'
                    .'<p>If it is urgent, calling is faster than waiting for a reply to this.</p>',
            ],

            'comment_awaiting_moderation' => [
                'label' => 'Blog comment waiting — to the desk',
                'description' => 'Sent at most once an hour, however many comments arrive.',
                'audience' => self::INTERNAL,
                'class' => CommentAwaitingModeration::class,
                'variables' => [
                    'author' => ['about' => 'Who commented.', 'sample' => 'Rahul'],
                    'post_title' => ['about' => 'Which article.', 'sample' => 'VLAN design that survives the next office move'],
                    'excerpt' => ['about' => 'The first 300 characters of the comment.', 'sample' => 'We hit this exact problem last year.'],
                    'score' => ['about' => 'The spam hint, out of 100. Nothing is filed automatically.', 'sample' => '72'],
                    'url' => ['about' => 'The moderation queue.', 'sample' => 'https://www.example.com/admin/blog-comments'],
                ],
                'subject' => 'A comment is waiting: {{post_title}}',
                'body' => '<p>A comment is waiting to be read.</p>'
                    .'<p><strong>{{author}}</strong> commented on <em>{{post_title}}</em>.</p>'
                    .'<blockquote>{{excerpt}}</blockquote>'
                    .'<p>Score {{score}}/100 — a hint only. Nothing is filed automatically.</p>'
                    .'<p><a href="{{url}}">Read it in the console</a></p>'
                    .'<p>Further comments in the next hour will not send another email; they are all in the queue.</p>',
            ],

            'chat_lead_captured' => [
                'label' => 'Callback asked for in the assistant — to the desk',
                'description' => 'Sent when a visitor asks the website assistant for a call.',
                'audience' => self::INTERNAL,
                'class' => ChatLeadCaptured::class,
                'variables' => [
                    'name' => ['about' => 'Who asked, or “Somebody”.', 'sample' => 'Priya Sharma'],
                    'details' => self::details('Their email, phone, company and what they want, where each was given.', '<p><strong>Email:</strong> priya@meridianfoods.test</p>'),
                    'source_path' => ['about' => 'The page they were on — a callback from a firewall page is a different conversation from one on the careers page.', 'sample' => '/solutions/firewall-utm'],
                    'url' => ['about' => 'The lead, with the whole conversation on it.', 'sample' => 'https://www.example.com/admin/leads/42'],
                ],
                'subject' => 'Callback requested through the website assistant',
                'body' => '<p>A visitor asked us to get in touch.</p>'
                    .'<p><strong>{{name}}</strong> used the assistant on the website and asked for a call.</p>'
                    .'{{details}}'
                    .'<p><strong>Asked from:</strong> {{source_path}}</p>'
                    .'<p><a href="{{url}}">Open this lead</a></p>'
                    .'<p>The whole conversation is on that screen, so you can read what was said before ringing.</p>',
            ],

            'chat_question_unanswered' => [
                'label' => 'The assistant could not answer — to the desk',
                'description' => 'Sent when the website assistant has no grounded answer. Off by default.',
                'audience' => self::INTERNAL,
                'class' => ChatQuestionUnanswered::class,
                'variables' => [
                    'question' => ['about' => 'What they asked, in their own words.', 'sample' => 'Do you supply UPS batteries for a 10kVA APC unit?'],
                    'details' => self::details('Whatever contact details were collected, or a line saying there were none.', '<p><strong>Email:</strong> priya@meridianfoods.test</p>'),
                    'source_path' => ['about' => 'The page they were on.', 'sample' => '/products/ups-power'],
                    'url' => ['about' => 'The conversation in the console.', 'sample' => 'https://www.example.com/admin/chat/conversations/61'],
                ],
                'subject' => 'The website assistant could not answer a question',
                'body' => '<p>A visitor asked something the website does not cover.</p>'
                    .'<p><strong>They asked:</strong></p>'
                    .'<p>{{question}}</p>'
                    .'{{details}}'
                    .'<p><strong>Asked from:</strong> {{source_path}}</p>'
                    .'<p><a href="{{url}}">Read the conversation</a></p>'
                    .'<p>The unanswered list groups this with anyone else who asked the same thing.</p>',
            ],

            /*
             * A backup that did not happen, or did not reach everywhere it
             * was sent (2026-09-27, `docs/backups.md`). The reason is the
             * worker's own sentence, a destination's refusal in its words.
             */
            'backup_failed' => [
                'label' => 'A backup did not complete — to the backups address',
                'description' => 'Sent when a backup fails, or finishes without reaching one of its destinations. Goes to the Backups settings’ alert address, or the support address.',
                'audience' => self::INTERNAL,
                'class' => BackupFailed::class,
                'variables' => [
                    'reason' => ['about' => 'What went wrong, in the worker’s words.', 'sample' => 'The backup of Sun 27 Sep 2026 2:15 AM did not reach Amazon S3. Access Denied (HTTP 403)'],
                    'folder' => ['about' => 'The backup’s folder name, when it got that far.', 'sample' => '20260926-204500-full-3f9c1a2b'],
                    'url' => ['about' => 'The Backups screen.', 'sample' => 'https://www.example.com/admin/backups'],
                ],
                'subject' => 'A backup did not complete',
                'body' => '<p>The website’s backup did not complete.</p>'
                    .'<p>{{reason}}</p>'
                    .'<p><a href="{{url}}">Open Backups</a></p>'
                    .'<p>Until a backup completes, the newest restorable copy is older than you expect.</p>',
            ],

            'block_lead_captured' => [
                'label' => 'Download or webinar sign-up from a banner — to the desk',
                'description' => 'Sent when somebody downloads a gated file or registers for a webinar through a CTA banner.',
                'audience' => self::INTERNAL,
                'class' => BlockLeadCaptured::class,
                'variables' => [
                    'name' => ['about' => 'Who it was, or “Somebody”.', 'sample' => 'Priya Sharma'],
                    'action' => ['about' => '“downloaded” or “registered for”.', 'sample' => 'downloaded'],
                    'banner' => ['about' => 'The banner’s heading — the file or the event.', 'sample' => 'The 2026 network readiness checklist'],
                    'details' => self::details('Their email, phone and company, where each was given.', '<p><strong>Email:</strong> priya@meridianfoods.test</p>'),
                    'source_path' => ['about' => 'The page the banner was on.', 'sample' => '/solutions/networking'],
                    'url' => ['about' => 'The lead in the console.', 'sample' => 'https://www.example.com/admin/leads/42'],
                ],
                'subject' => 'New lead: {{name}} {{action}} “{{banner}}”',
                'body' => '<p>A new lead from a banner on the website.</p>'
                    .'<p><strong>{{name}}</strong> {{action}} “{{banner}}”.</p>'
                    .'{{details}}'
                    .'<p><strong>On the page:</strong> {{source_path}}</p>'
                    .'<p><a href="{{url}}">Open this lead</a></p>',
            ],
        ];
    }

    /**
     * Engineer visit requests (2026-09-26, `docs/visits.md`) — seven messages
     * for five classes.
     *
     * @return array<string, array<string, mixed>>
     */
    private static function visits(): array
    {
        $reference = ['about' => 'The visit reference, which is what people quote on the phone.', 'sample' => 'SV-2026-00012'];
        $topic = ['about' => 'What the visit is about — the service or solution chosen, or “Site survey”.', 'sample' => 'Network installation'];
        $manage = ['about' => 'Their own link to cancel or ask for another time. No sign-in needed.', 'sample' => 'https://www.example.com/visit/SV-2026-00012/open?token=…'];

        // The desk's two share one class, so they offer one list.
        $desk = [
            'reference' => $reference,
            'name' => ['about' => 'Who asked.', 'sample' => 'Priya Sharma'],
            'company' => ['about' => 'Their company, or blank.', 'sample' => 'Meridian Foods'],
            'email' => ['about' => 'Their address. Replying goes here.', 'sample' => 'priya@meridianfoods.test'],
            'phone' => ['about' => 'Their mobile.', 'sample' => '+91 98765 43210'],
            'topic' => $topic,
            'preferred' => self::details('The dates and parts of the day they asked for, in the order they ranked them.', '<ul><li>Tue 6 Oct — Morning (09:00–12:00)</li></ul>'),
            'site_address' => ['about' => 'Where the engineer is going.', 'sample' => '14 Park Street, Kolkata, West Bengal, 700016'],
            'notes' => ['about' => 'The first 800 characters of what they wrote about the site.', 'sample' => 'Two floors, the rack is in the basement.'],
            'change' => ['about' => 'What the customer did — blank on a new request.', 'sample' => 'They asked for other times.'],
            'url' => ['about' => 'The request in the console.', 'sample' => 'https://www.example.com/admin/visits/SV-2026-00012'],
            'lead' => self::details('The lead score and a link to the pipeline record — blank on a change.', '<p><strong>Score:</strong> 64 / 100 — warm</p>'),
        ];

        // Booked, moved and reminded share one list of facts.
        $booked = [
            'name' => ['about' => 'Their first name, or “there”.', 'sample' => 'Priya'],
            'reference' => $reference,
            'topic' => $topic,
            'visit_date' => ['about' => 'The day of the visit.', 'sample' => 'Tue 6 Oct 2026'],
            'visit_time' => ['about' => 'When it starts and ends.', 'sample' => '10:30 – 12:00'],
            'site_address' => ['about' => 'Where the engineer is going.', 'sample' => '14 Park Street, Kolkata, West Bengal, 700016'],
            'manage_url' => $manage,
        ];

        return [
            'visit_request_received' => [
                'label' => 'Visit requested — to the desk',
                'description' => 'Sent to the visits address (else the sales inbox) when somebody requests an engineer visit. Replying goes to the customer.',
                'audience' => self::INTERNAL,
                'class' => VisitRequestReceived::class,
                'variables' => $desk,
                'subject' => '[{{reference}}] Visit requested: {{topic}}',
                'body' => '<p>A site visit has been requested.</p>'
                    .'<p><strong>{{name}}</strong> · {{company}}</p>'
                    .'<p>{{email}} · {{phone}}</p>'
                    .'<p><strong>About:</strong> {{topic}}<br><strong>Site:</strong> {{site_address}}</p>'
                    .'<p><strong>Preferred times:</strong></p>{{preferred}}'
                    .'<p>{{notes}}</p>'
                    .'{{lead}}'
                    .'<p><a href="{{url}}">Confirm a time in the console</a></p>',
            ],

            'visit_request_changed' => [
                'label' => 'Visit changed by the customer — to the desk',
                'description' => 'Sent when a customer cancels their visit or asks for other times, from their own link or the portal.',
                'audience' => self::INTERNAL,
                'class' => VisitRequestReceived::class,
                'variables' => $desk,
                'subject' => '[{{reference}}] Visit changed by the customer',
                'body' => '<p>{{change}}</p>'
                    .'<p><strong>{{name}}</strong> · {{company}} · {{phone}}</p>'
                    .'<p><strong>About:</strong> {{topic}}</p>'
                    .'<p><strong>Times they would like now:</strong></p>{{preferred}}'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],

            'visit_requested' => [
                'label' => 'Visit requested — to the customer',
                'description' => 'The receipt somebody gets after requesting an engineer visit. It repeats the times they chose, never what they typed.',
                'audience' => self::CUSTOMER,
                'class' => VisitRequested::class,
                'variables' => [
                    'name' => ['about' => 'Their first name, or “there”.', 'sample' => 'Priya'],
                    'reference' => $reference,
                    'topic' => $topic,
                    'preferred' => self::details('The dates and parts of the day they asked for.', '<ul><li>Tue 6 Oct — Morning (09:00–12:00)</li></ul>'),
                    'manage_url' => $manage,
                ],
                'subject' => '[{{reference}}] We have your visit request',
                'body' => '<p>Thank you, {{name}}.</p>'
                    .'<p>We have your request for an engineer visit — <strong>{{topic}}</strong>. Your reference is <strong>{{reference}}</strong>.</p>'
                    .'<p>You asked for:</p>{{preferred}}'
                    .'<p>This is a request, not a booking yet. We will confirm the actual time by email once an engineer is free.</p>'
                    .'<p><a href="{{manage_url}}">Cancel or ask for another time</a></p>',
            ],

            'visit_confirmed' => [
                'label' => 'Visit booked — to the customer',
                'description' => 'Sent when the desk confirms a time. Carries a calendar file.',
                'audience' => self::CUSTOMER,
                'class' => VisitConfirmed::class,
                'variables' => $booked,
                'subject' => '[{{reference}}] Your engineer visit is booked for {{visit_date}}, {{visit_time}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>An engineer will visit — <strong>{{topic}}</strong> — on <strong>{{visit_date}}, {{visit_time}}</strong>.</p>'
                    .'<p>At: {{site_address}}</p>'
                    .'<p>The calendar file attached adds it to your diary. We will remind you the day before.</p>'
                    .'<p><a href="{{manage_url}}">Cancel or ask for another time</a></p>',
            ],

            'visit_rescheduled' => [
                'label' => 'Visit moved — to the customer',
                'description' => 'Sent when the desk moves a confirmed visit to a new time. Carries a calendar file that updates the old event.',
                'audience' => self::CUSTOMER,
                'class' => VisitConfirmed::class,
                'variables' => $booked,
                'subject' => '[{{reference}}] Your engineer visit has moved to {{visit_date}}, {{visit_time}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>We have moved your engineer visit — <strong>{{topic}}</strong> — to <strong>{{visit_date}}, {{visit_time}}</strong>.</p>'
                    .'<p>At: {{site_address}}</p>'
                    .'<p>The calendar file attached updates the one we sent before.</p>'
                    .'<p><a href="{{manage_url}}">Cancel or ask for another time</a></p>',
            ],

            'visit_cancelled' => [
                'label' => 'Visit cancelled — to the customer',
                'description' => 'Sent when a visit is cancelled, by the desk or by the customer from their own link.',
                'audience' => self::CUSTOMER,
                'class' => VisitCancelled::class,
                'variables' => [
                    'name' => ['about' => 'Their first name, or “there”.', 'sample' => 'Priya'],
                    'reference' => $reference,
                    'topic' => $topic,
                    'reason' => ['about' => 'The reason the desk gave — blank when the customer cancelled.', 'sample' => 'The engineer is unwell; we will call to rearrange.'],
                    'book_url' => ['about' => 'The request form, to ask again.', 'sample' => 'https://www.example.com/book-a-visit'],
                ],
                'subject' => '[{{reference}}] Your engineer visit is cancelled',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>Your engineer visit — <strong>{{topic}}</strong>, reference {{reference}} — is cancelled.</p>'
                    .'<p>{{reason}}</p>'
                    .'<p>If this is a mistake, or you would still like somebody to come, <a href="{{book_url}}">ask for a new visit</a>.</p>',
            ],

            'visit_reminder' => [
                'label' => 'Visit tomorrow — to the customer',
                'description' => 'Sent once, within the 24 hours before a confirmed visit.',
                'audience' => self::CUSTOMER,
                'class' => VisitReminder::class,
                'variables' => $booked,
                'subject' => '[{{reference}}] Reminder: engineer visit on {{visit_date}}, {{visit_time}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>A reminder that an engineer visits — <strong>{{topic}}</strong> — on <strong>{{visit_date}}, {{visit_time}}</strong>.</p>'
                    .'<p>At: {{site_address}}</p>'
                    .'<p>Please make sure somebody can let them in and show them the equipment.</p>'
                    .'<p><a href="{{manage_url}}">Cancel or ask for another time</a></p>',
            ],
        ];
    }

    /**
     * Online meetings (2026-09-29, `docs/meetings.md`) — seven messages, one
     * class each.
     *
     * The customer's copies never repeat the agenda they typed (the
     * `EnquiryAcknowledged` rule: a message sent to any address typed into a
     * public form); the desk's and the host's copy carries it. `join` is how
     * to join, built by the application — the Meet link when Google has made
     * one, else a line saying it will follow — because a template cannot say
     * "if".
     *
     * @return array<string, array<string, mixed>>
     */
    private static function meetings(): array
    {
        $reference = ['about' => 'The meeting reference, which is what people quote on the phone.', 'sample' => 'MT-2026-00007'];
        $type = ['about' => 'What kind of meeting it is.', 'sample' => 'Product demo'];
        $date = ['about' => 'The day of the meeting.', 'sample' => 'Tue 6 Oct 2026'];
        $time = ['about' => 'When it starts and ends.', 'sample' => '15:30 – 16:00'];
        $zone = ['about' => 'The timezone those times are in.', 'sample' => 'IST'];
        $host = ['about' => 'Who hosts it.', 'sample' => 'Anita Rao'];
        $name = ['about' => 'Their first name, or “there”.', 'sample' => 'Priya'];
        $meet = ['about' => 'The Google Meet link — blank until Google has made one.', 'sample' => 'https://meet.google.com/abc-defg-hij'];
        $manage = ['about' => 'Their own link to cancel or move the meeting. No sign-in needed.', 'sample' => 'https://www.example.com/meeting/MT-2026-00007/open?token=…'];
        $join = self::details('How to join: the Meet link when there is one, else a line saying it will follow.', '<p>Join on Google Meet: <a href="https://meet.google.com/abc-defg-hij">https://meet.google.com/abc-defg-hij</a></p>');
        $url = ['about' => 'The meeting in the console.', 'sample' => 'https://www.example.com/admin/meetings/MT-2026-00007'];

        // Booked and moved offer one list, so the two cannot drift.
        $booked = [
            'name' => $name,
            'reference' => $reference,
            'meeting_type' => $type,
            'meeting_date' => $date,
            'meeting_time' => $time,
            'timezone' => $zone,
            'host_name' => $host,
            'meet_url' => $meet,
            'join' => $join,
            'manage_url' => $manage,
        ];

        return [
            'meeting_scheduled' => [
                'label' => 'Meeting booked — to the customer',
                'description' => 'The confirmation somebody gets after booking an online meeting, or when the desk books one for them. It carries the Meet link when Google has made it, and a calendar file when Google is not sending the invitation.',
                'audience' => self::CUSTOMER,
                'class' => MeetingScheduled::class,
                'variables' => $booked,
                'subject' => '[{{reference}}] Your {{meeting_type}} is booked for {{meeting_date}}, {{meeting_time}} {{timezone}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>Your <strong>{{meeting_type}}</strong> with {{host_name}} is booked for <strong>{{meeting_date}}, {{meeting_time}} {{timezone}}</strong>. Your reference is <strong>{{reference}}</strong>.</p>'
                    .'{{join}}'
                    .'<p>We will remind you before it starts.</p>'
                    .'<p><a href="{{manage_url}}">Cancel or choose another time</a></p>',
            ],

            'meeting_booked_internal' => [
                'label' => 'Meeting booked — to the desk and the host',
                'description' => 'Sent to the meetings address (else the sales inbox) and to the host when a meeting is booked. It carries the agenda the customer typed. Replying goes to the customer.',
                'audience' => self::INTERNAL,
                'class' => MeetingBooked::class,
                'variables' => [
                    'reference' => $reference,
                    'meeting_type' => $type,
                    'meeting_date' => $date,
                    'meeting_time' => $time,
                    'timezone' => $zone,
                    'host_name' => $host,
                    'name' => ['about' => 'Who booked it.', 'sample' => 'Priya Sharma'],
                    'company' => ['about' => 'Their company, or blank.', 'sample' => 'Meridian Foods'],
                    'email' => ['about' => 'Their address. Replying goes here.', 'sample' => 'priya@meridianfoods.test'],
                    'phone' => ['about' => 'Their mobile, or blank.', 'sample' => '+91 98765 43210'],
                    'agenda' => ['about' => 'The first 800 characters of what they want to talk about.', 'sample' => 'We are looking at replacing the core switches across two sites.'],
                    'source' => ['about' => 'Where it was booked: the website, the customer portal or the console.', 'sample' => 'Website'],
                    'meet_url' => $meet,
                    'url' => $url,
                ],
                'subject' => '[{{reference}}] Meeting booked: {{meeting_type}}, {{meeting_date}} {{meeting_time}}',
                'body' => '<p>A <strong>{{meeting_type}}</strong> has been booked with {{host_name}}.</p>'
                    .'<p><strong>{{meeting_date}}, {{meeting_time}} {{timezone}}</strong></p>'
                    .'<p><strong>{{name}}</strong> · {{company}}</p>'
                    .'<p>{{email}} · {{phone}}</p>'
                    .'<p><strong>Agenda:</strong> {{agenda}}</p>'
                    .'<p>Booked from: {{source}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],

            'meeting_rescheduled' => [
                'label' => 'Meeting moved — to the customer',
                'description' => 'Sent when a meeting moves to a new time or a new host, whoever moved it. The Meet link stays the same.',
                'audience' => self::CUSTOMER,
                'class' => MeetingRescheduled::class,
                'variables' => $booked + [
                    'previous' => ['about' => 'When it was before the move.', 'sample' => 'Mon 5 Oct 2026, 11:00 – 11:30 IST'],
                ],
                'subject' => '[{{reference}}] Your {{meeting_type}} has moved to {{meeting_date}}, {{meeting_time}} {{timezone}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>Your <strong>{{meeting_type}}</strong> has moved to <strong>{{meeting_date}}, {{meeting_time}} {{timezone}}</strong>, with {{host_name}}.</p>'
                    .'<p>It was: {{previous}}</p>'
                    .'{{join}}'
                    .'<p><a href="{{manage_url}}">Cancel or choose another time</a></p>',
            ],

            'meeting_cancelled' => [
                'label' => 'Meeting cancelled — to the customer',
                'description' => 'Sent when a meeting is cancelled, by the desk or by the customer from their own link or the portal.',
                'audience' => self::CUSTOMER,
                'class' => MeetingCancelled::class,
                'variables' => [
                    'name' => $name,
                    'reference' => $reference,
                    'meeting_type' => $type,
                    'meeting_date' => $date,
                    'meeting_time' => $time,
                    'timezone' => $zone,
                    'reason' => ['about' => 'The reason the desk gave — blank when the customer cancelled.', 'sample' => 'Our host is unwell; please book another time.'],
                    'book_url' => ['about' => 'The booking page, to choose another time.', 'sample' => 'https://www.example.com/book-a-meeting'],
                ],
                'subject' => '[{{reference}}] Your {{meeting_type}} on {{meeting_date}} is cancelled',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>Your <strong>{{meeting_type}}</strong> on {{meeting_date}}, {{meeting_time}} {{timezone}} — reference {{reference}} — is cancelled.</p>'
                    .'<p>{{reason}}</p>'
                    .'<p>If this is a mistake, or you would still like to talk, <a href="{{book_url}}">book another time</a>.</p>',
            ],

            'meeting_reminder' => [
                'label' => 'Meeting reminder — to the customer',
                'description' => 'Sent at each reminder time in Settings (a day and an hour before, by default). One wording serves every reminder: “starts in” reads right at each.',
                'audience' => self::CUSTOMER,
                'class' => MeetingReminder::class,
                'variables' => $booked + [
                    'starts_in' => ['about' => 'How soon it starts — “in 1 hour”, “in 24 hours”.', 'sample' => 'in 1 hour'],
                ],
                'subject' => '[{{reference}}] Reminder: your {{meeting_type}} starts {{starts_in}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>A reminder that your <strong>{{meeting_type}}</strong> with {{host_name}} starts {{starts_in}} — <strong>{{meeting_date}}, {{meeting_time}} {{timezone}}</strong>.</p>'
                    .'{{join}}'
                    .'<p><a href="{{manage_url}}">Cancel or choose another time</a></p>',
            ],

            'meeting_link_ready' => [
                'label' => 'Meeting link ready — to the customer',
                'description' => 'Sent when the Google Meet link arrives after the confirmation went out without it — Google was not reachable when the meeting was booked.',
                'audience' => self::CUSTOMER,
                'class' => MeetingLinkReady::class,
                'variables' => [
                    'name' => $name,
                    'reference' => $reference,
                    'meeting_type' => $type,
                    'meeting_date' => $date,
                    'meeting_time' => $time,
                    'timezone' => $zone,
                    'meet_url' => $meet,
                    'manage_url' => $manage,
                ],
                'subject' => '[{{reference}}] Your link to join the {{meeting_type}}',
                'body' => '<p>Hello {{name}},</p>'
                    .'<p>Here is the link for your <strong>{{meeting_type}}</strong> on <strong>{{meeting_date}}, {{meeting_time}} {{timezone}}</strong>:</p>'
                    .'<p><a href="{{meet_url}}">{{meet_url}}</a></p>'
                    .'<p><a href="{{manage_url}}">Cancel or choose another time</a></p>',
            ],

            'meeting_sync_failed' => [
                'label' => 'Meeting not in Google Calendar — to the desk',
                'description' => 'Sent to the meetings address (else the sales inbox) when a meeting could not be put into Google Calendar after every retry. The meeting still stands; the customer was sent a calendar file instead.',
                'audience' => self::INTERNAL,
                'class' => MeetingSyncFailed::class,
                'variables' => [
                    'reference' => $reference,
                    'meeting_type' => $type,
                    'meeting_date' => $date,
                    'meeting_time' => $time,
                    'timezone' => $zone,
                    'name' => ['about' => 'Who the meeting is with.', 'sample' => 'Priya Sharma'],
                    'error' => ['about' => 'What Google said, in its own words.', 'sample' => 'Rate Limit Exceeded'],
                    'url' => $url,
                ],
                'subject' => '[{{reference}}] Could not add the meeting to Google Calendar',
                'body' => '<p>The meeting with <strong>{{name}}</strong> — {{meeting_type}}, {{meeting_date}}, {{meeting_time}} {{timezone}} — could not be put into Google Calendar.</p>'
                    .'<p>Google said: {{error}}</p>'
                    .'<p>The meeting still stands, and the customer was sent a calendar file. There is no Meet link until it syncs.</p>'
                    .'<p><a href="{{url}}">Open it in the console to retry</a></p>',
            ],
        ];
    }
}
