<?php

namespace App\Support\Mail;

use App\Notifications\ActivationProcedureIssued;
use App\Notifications\ApplicationAcknowledged;
use App\Notifications\ChatLeadCaptured;
use App\Notifications\ChatQuestionUnanswered;
use App\Notifications\CommentAwaitingModeration;
use App\Notifications\CustomerApproved;
use App\Notifications\CustomerRegistered;
use App\Notifications\CustomerRejected;
use App\Notifications\EnquiryReceived;
use App\Notifications\FormSubmitted;
use App\Notifications\JobApplicationReceived;
use App\Notifications\OrderDispatched;
use App\Notifications\OrderPaid;
use App\Notifications\OrderPlaced;
use App\Notifications\OrderReceived;
use App\Notifications\RegistrationAttempted;
use App\Notifications\ResetPassword;
use App\Notifications\SignInCodeIssued;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use App\Notifications\VerifyCustomerEmail;

/**
 * The 23 entries, kept out of `MessageCatalogue` so that class stays readable.
 *
 * Twenty-three for twenty-two classes: `TicketReplied` is two messages. Its
 * customer and desk versions differ in greeting, action label *and* recipient,
 * and one template cannot say both without lying about one of them.
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

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return array_merge(self::tickets(), self::orders(), self::accounts(), self::enquiries());
    }

    /** @return array<string, array<string, mixed>> */
    private static function tickets(): array
    {
        $reference = ['about' => 'The ticket reference, which is what people search their mailbox for.', 'sample' => 'TW-2026-00042'];
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
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.technoware.in/admin/tickets/TW-2026-00042'],
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
                    'url' => ['about' => 'The ticket in the customer portal.', 'sample' => 'https://www.technoware.in/portal/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] We have your ticket: {{subject}}',
                'body' => '<p>Thanks — this is logged.</p>'
                    .'<p>Your reference is <strong>{{reference}}</strong>. Quote it if you call.</p>'
                    .'<p><strong>{{subject}}</strong></p>'
                    .'<p>An engineer will respond by {{due_at}}.</p>'
                    .'<p><a href="{{url}}">Track this ticket</a></p>'
                    .'<p>Replying to this email will not reach us — use the portal so the conversation stays on the ticket.</p>',
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
                    'url' => ['about' => 'The conversation in the portal.', 'sample' => 'https://www.technoware.in/portal/tickets/TW-2026-00042'],
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
                    'url' => ['about' => 'The ticket in the console.', 'sample' => 'https://www.technoware.in/admin/tickets/TW-2026-00042'],
                ],
                'subject' => '[{{reference}}] New reply: {{subject}}',
                'body' => '<p>A customer has replied.</p>'
                    .'<p>{{body}}</p>'
                    .'<p><a href="{{url}}">Open it in the console</a></p>',
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function orders(): array
    {
        $number = ['about' => 'The order number.', 'sample' => 'TWO-2026-0117'];
        $customer = ['about' => 'The name on the order.', 'sample' => 'Priya Sharma'];
        $total = ['about' => 'The total, formatted.', 'sample' => '₹1,18,000.10'];

        return [
            'order_placed' => [
                'label' => 'Order placed, not yet paid — to the customer',
                'description' => 'Sent when an order is saved before any payment has been taken.',
                'audience' => self::CUSTOMER,
                'class' => OrderPlaced::class,
                'variables' => [
                    'order_number' => $number,
                    'customer_name' => $customer,
                    'total' => $total,
                    'gst' => ['about' => 'The GST included in the total.', 'sample' => '₹18,000.02'],
                    'url' => ['about' => 'The order page, reached by the link in this email.', 'sample' => 'https://www.technoware.in/order/TWO-2026-0117?token=…'],
                ],
                'subject' => 'Your order {{order_number}} — payment not yet made',
                'body' => '<p>Thanks, {{customer_name}}.</p>'
                    .'<p>Your order <strong>{{order_number}}</strong> is saved, and <strong>nothing has been charged</strong>.</p>'
                    .'<p>Total: {{total}} (including GST of {{gst}}).</p>'
                    .'<p><a href="{{url}}">Pay for this order</a></p>'
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
                    'url' => ['about' => 'The order page.', 'sample' => 'https://www.technoware.in/order/TWO-2026-0117?token=…'],
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
                    'url' => ['about' => 'The order in the console.', 'sample' => 'https://www.technoware.in/admin/store/orders/TWO-2026-0117'],
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
                    'url' => ['about' => 'The order page, where the code is revealed.', 'sample' => 'https://www.technoware.in/order/TWO-2026-0117?token=…'],
                ],
                'subject' => 'How to activate your purchase — {{order_number}}',
                'body' => '<p>Hello {{customer_name}},</p>'
                    .'<p>Your activation code for {{products}} is ready.</p>'
                    .'<p>For your security the code is not included in this email. Open your order to reveal it — we record each time it is shown, which is what lets us help if it is ever disputed.</p>'
                    .'<p><a href="{{url}}">Open your order</a></p>'
                    .'{{steps}}'
                    .'<p>If anything does not work, reply to this message and we will pick it up.</p>',
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
                    'url' => ['about' => 'The portal sign-in page.', 'sample' => 'https://www.technoware.in/portal/login'],
                ],
                'subject' => 'Your Technoware support account is active',
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
                    'support_email' => ['about' => 'Where to write back, or blank when none is set.', 'sample' => 'support@technoware.in'],
                ],
                'subject' => 'About your Technoware portal registration',
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
                    'url' => ['about' => 'The account in the console.', 'sample' => 'https://www.technoware.in/admin/customers/23'],
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
                    'url' => ['about' => 'The portal sign-in page.', 'sample' => 'https://www.technoware.in/portal/login'],
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
                'class' => VerifyCustomerEmail::class,
                'variables' => [
                    'url' => ['about' => 'The confirmation link. Works once.', 'sample' => 'https://www.technoware.in/portal/verify-email?token=…'],
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
                'class' => ResetPassword::class,
                'variables' => [
                    'url' => ['about' => 'The reset link. Works once.', 'sample' => 'https://www.technoware.in/portal/reset-password?token=…'],
                    'minutes' => ['about' => 'How long the link lasts.', 'sample' => '60'],
                ],
                'subject' => 'Reset your Technoware password',
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
                'class' => SignInCodeIssued::class,
                'variables' => [
                    'code' => ['about' => 'The six digits. Also in the subject, which is what lets a phone offer it.', 'sample' => '417 302'],
                    'where' => ['about' => 'Which door the code is for.', 'sample' => 'the Technoware support portal'],
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
                    'url' => ['about' => 'The application in the console.', 'sample' => 'https://www.technoware.in/admin/applications/5'],
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
                    'url' => ['about' => 'The moderation queue.', 'sample' => 'https://www.technoware.in/admin/blog-comments'],
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
                    'url' => ['about' => 'The lead, with the whole conversation on it.', 'sample' => 'https://www.technoware.in/admin/leads/42'],
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
                    'url' => ['about' => 'The conversation in the console.', 'sample' => 'https://www.technoware.in/admin/chat/conversations/61'],
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
        ];
    }
}
