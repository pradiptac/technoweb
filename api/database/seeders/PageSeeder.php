<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Page;
use Illuminate\Database\Seeder;

/**
 * The pages the footer already links to. Without these, /privacy, /terms and
 * /downloads 404 on every page of the site.
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
        ];
    }
}
