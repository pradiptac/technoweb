<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Page;
use Illuminate\Database\Seeder;

/**
 * The pages the footer already links to. Without these, /privacy, /terms,
 * /downloads, /returns and /shipping 404 on every page of the site.
 *
 * The copy is a structurally complete starting point, not legal advice — the
 * privacy and terms pages in particular must be reviewed by someone qualified
 * and populated with the real company details before launch. See the "must not
 * ship" list in CLAUDE.md.
 */
class PageSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->pages() as $page) {
            Page::updateOrCreate(['slug' => $page['slug']], $page);
        }
    }

    private function pages(): array
    {
        return [
            [
                'slug' => 'privacy',
                'title' => 'Privacy policy',
                'template' => 'default',
                'status' => PublishStatus::Published,
                'published_at' => now(),
                'body' => '<p>This policy explains what we collect when you use this website or our support portal, why we collect it, and what we do with it.</p>'
                    .'<h2>What we collect</h2>'
                    .'<ul>'
                    .'<li><strong>Enquiries.</strong> The name, email address, company and message you submit through the contact form.</li>'
                    .'<li><strong>Support tickets.</strong> The content of tickets you raise, including any files you attach.</li>'
                    .'<li><strong>Portal accounts.</strong> Your name, email address, company and phone number.</li>'
                    .'</ul>'
                    .'<h2>Why we collect it</h2>'
                    .'<p>To answer your enquiry, to deliver and support the services you have contracted, and to meet our record-keeping obligations. We do not sell your data and we do not use it for advertising.</p>'
                    .'<h2>Where it is stored</h2>'
                    .'<p>Enquiry and ticket data is held on our own infrastructure. Ticket attachments are stored on a private disk and are only ever served through an authenticated request — they are never publicly addressable.</p>'
                    .'<h2>How long we keep it</h2>'
                    .'<p>Support records are retained for the life of the contract and for a defined period afterwards, so that a recurring fault can be traced against its history.</p>'
                    .'<h2>Your rights</h2>'
                    .'<p>You may ask what we hold about you, ask for it to be corrected, or ask for it to be deleted where we are not required to keep it. Contact us using the details on the contact page.</p>'
                    .'<h2>Cookies</h2>'
                    .'<p>This site sets a session cookie when you sign in to the support portal. It is strictly necessary — without it you cannot stay signed in. We do not use advertising or third-party analytics cookies.</p>',
            ],
            [
                'slug' => 'terms',
                'title' => 'Terms of use',
                'template' => 'default',
                'status' => PublishStatus::Published,
                'published_at' => now(),
                'body' => '<p>These terms cover use of this website and the customer support portal. Contracted services are governed by their own agreement, which takes precedence where the two differ.</p>'
                    .'<h2>Use of this site</h2>'
                    .'<p>You may browse and share this site freely. You may not attempt to gain unauthorised access to any part of it, or use it in a way that disrupts service for anyone else.</p>'
                    .'<h2>Product information</h2>'
                    .'<p>The catalogue is provided for reference. Specifications are those published by the manufacturer and can change without notice; availability is confirmed at the point of quotation, not from this site.</p>'
                    .'<h2>The support portal</h2>'
                    .'<p>Portal accounts are issued to contracted customers. You are responsible for keeping your credentials secure and for activity carried out under your account. Tell us promptly if you believe an account has been compromised.</p>'
                    .'<h2>Service levels</h2>'
                    .'<p>Response targets shown in the portal apply to the contract that account belongs to. They are targets for first response, not for resolution, which depends on the fault.</p>'
                    .'<h2>Liability</h2>'
                    .'<p>Nothing here limits liability that cannot be limited by law. Beyond that, our liability is as set out in your service agreement.</p>'
                    .'<h2>Changes</h2>'
                    .'<p>We may update these terms. Material changes affecting contracted customers are communicated directly rather than only posted here.</p>',
            ],
            [
                'slug' => 'downloads',
                'title' => 'Downloads',
                'template' => 'default',
                'status' => PublishStatus::Published,
                'published_at' => now(),
                'body' => '<p>Remote support tools, datasheets and the documentation we are most often asked for.</p>'
                    .'<h2>Remote support</h2>'
                    .'<p>When an engineer asks you to start a remote session, they will send you the download link directly and stay on the phone while it connects. We will never call unprompted and ask you to install remote-access software — if that happens, it is not us.</p>'
                    .'<h2>Datasheets</h2>'
                    .'<p>Manufacturer datasheets for the hardware we carry are linked from each product page, so you are always reading the current revision rather than a copy that has gone stale here.</p>'
                    .'<h2>Anything else</h2>'
                    .'<p>If you need a document you cannot find — a warranty certificate, an asset register, a network diagram from a past project — raise a ticket in the support portal and we will send it across.</p>',
            ],
            /*
             * The two pages Google Merchant Center requires a shop to have,
             * and which this one did not until the store was checked against
             * its policies: a stated returns and refunds policy, and a stated
             * shipping policy where delivery is promised. Both are reachable
             * from the footer and from every product page.
             *
             * **Neither carries a number that lives in Settings.** The return
             * window is `store_return_days` and the delivery charge is
             * `store_shipping_paise`; both are rendered live on every product
             * page and declared to Google from the same two settings. A figure
             * typed into this prose would be a second copy free to drift from
             * the one the feed makes — so the copy points at the product page
             * for the number rather than restating it.
             *
             * Structurally complete starting points, not legal advice — the
             * same caveat the privacy and terms pages carry, and the same
             * review before launch.
             */
            [
                'slug' => 'returns',
                'title' => 'Returns and refunds',
                'template' => 'default',
                'status' => PublishStatus::Published,
                'published_at' => now(),
                'body' => '<p>This policy covers anything bought from the online store. It does not cover equipment supplied under a project quotation or a support contract, which is governed by that agreement.</p>'
                    .'<h2>What can be returned</h2>'
                    .'<p>Most products can be returned within the return window shown on the product page, counted from the day the parcel is delivered. A product that cannot be returned says so on its page, in the basket and at the checkout before you pay — it is a term of the sale, not a surprise on the receipt.</p>'
                    .'<p>Software licences, activation codes and downloadable products cannot be returned once the code has been revealed, because a key that has been seen cannot be un-issued.</p>'
                    .'<h2>Condition</h2>'
                    .'<p>Hardware must come back complete, in its original packaging with every accessory, cable and manual it shipped with, and in the condition it arrived in. A product that has been installed, configured or registered with the manufacturer is treated as used and may not be accepted, or may be refunded in part.</p>'
                    .'<h2>How to start a return</h2>'
                    .'<p>Open your order from the confirmation email or from your account, and tell us what you are returning and why. We will confirm the return and send collection or dispatch instructions. Please do not send anything back before we have confirmed it.</p>'
                    .'<h2>Who pays for the return</h2>'
                    .'<p>If the product is faulty on arrival, damaged in transit or not what you ordered, we arrange and pay for the collection. If you have changed your mind, the return postage is yours and the product must reach us within the return window.</p>'
                    .'<h2>Refunds</h2>'
                    .'<p>Once the product has arrived and been checked, the refund is issued to the payment method used for the order. Card and UPI payments are refunded through the gateway and usually appear within five to seven working days; bank transfers and cash-on-delivery orders are refunded by bank transfer to an account you give us. Delivery charges are refunded when the return is our fault and not when it is a change of mind.</p>'
                    .'<h2>Faulty products</h2>'
                    .'<p>A fault that appears after the return window is a warranty matter and is handled with the manufacturer. Contact us first: we can often resolve it faster than the manufacturer\'s own process, and every product we sell is sourced from an authorised distributor so the warranty is valid.</p>'
                    .'<h2>Cancelling an order</h2>'
                    .'<p>An order can be cancelled at any time before it is dispatched, for a full refund. Once it has left us it is treated as a return.</p>',
            ],
            [
                'slug' => 'shipping',
                'title' => 'Shipping and delivery',
                'template' => 'default',
                'status' => PublishStatus::Published,
                'published_at' => now(),
                'body' => '<p>This policy covers physical products bought from the online store. Software licences and activation codes are delivered on the order page and by email, and nothing is posted.</p>'
                    .'<h2>Where we deliver</h2>'
                    .'<p>Anywhere in India that a courier serves. We do not currently ship outside India.</p>'
                    .'<h2>What it costs</h2>'
                    .'<p>The delivery charge, if any, is shown on every product page and again at the checkout before you pay. It is the same for every order regardless of size, and there is no minimum spend.</p>'
                    .'<h2>When it leaves</h2>'
                    .'<p>Orders are dispatched within the handling time shown on the product page, counted in working days from the moment payment is confirmed — or, for cash on delivery, from the moment the order is confirmed. Orders placed on a weekend or a public holiday are counted from the next working day.</p>'
                    .'<h2>How long it takes</h2>'
                    .'<p>Delivery time depends on the courier and the destination. Metro addresses usually receive an order within two to four working days of dispatch; other addresses within four to eight. These are the courier\'s estimates, not a guarantee.</p>'
                    .'<h2>Tracking</h2>'
                    .'<p>Every parcel is sent tracked. When your order is dispatched you receive an email with the courier\'s name, the tracking number and a link, and the same details appear on your order page.</p>'
                    .'<h2>If something goes wrong</h2>'
                    .'<p>If a parcel arrives damaged, please photograph it before opening it and contact us within 48 hours. If a parcel has not arrived within the courier\'s estimate, contact us with the order number and we will trace it. A parcel returned to us as undeliverable is refunded less the delivery charge once it arrives back.</p>',
            ],
        ];
    }
}
