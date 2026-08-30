<?php

namespace Database\Seeders;

use App\Models\NewsletterTemplate;
use App\Support\Newsletter\CustomerGroupSync;
use App\Support\Newsletter\EmailRenderer;
use Illuminate\Database\Seeder;

/**
 * Ten starting points.
 *
 * Stored as **blocks**, not as HTML. The editor reads blocks back, so a
 * template shipped as a slab of markup would be one an editor could only edit
 * in the source view — which is exactly the "add-on CRUD page" the
 * specification asks this not to feel like. The HTML is rendered from the
 * blocks and stored alongside, so a preview needs no render step.
 *
 * The sample copy is deliberately real rather than lorem ipsum: a template
 * gallery full of placeholder text is one nobody can judge, and the point of
 * the gallery is choosing between them at a glance. It is also all about this
 * business, so what an editor changes is the specifics rather than the whole
 * thing.
 *
 * `is_system` marks these as shipped. Re-running the seeder refreshes a system
 * template that nobody has touched and **leaves an edited one alone** — the
 * same rule `DemoContentSeeder` follows for a brand logo, and for the same
 * reason: a deploy must not undo somebody's afternoon.
 */
class NewsletterTemplateSeeder extends Seeder
{
    public function run(): void
    {
        /*
         * The standing customers group, so a fresh install has it before
         * anybody opens the screen.
         *
         * Created rather than seeded with members: `CustomerGroupSync` fills
         * it from the customer table, and inventing subscribers here would put
         * addresses on a mailing list nobody agreed to.
         */
        CustomerGroupSync::group();

        foreach ($this->templates() as $template) {
            $existing = NewsletterTemplate::where('slug', $template['slug'])->first();

            // Touched by a person: leave it entirely alone.
            if ($existing !== null && ! $existing->is_system) {
                continue;
            }

            NewsletterTemplate::updateOrCreate(
                ['slug' => $template['slug']],
                [
                    'name' => $template['name'],
                    'description' => $template['description'],
                    'category' => $template['category'],
                    'blocks' => $template['blocks'],
                    'html' => EmailRenderer::render($template['blocks'], ['company' => 'Technoware']),
                    'is_system' => true,
                ],
            );
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function templates(): array
    {
        $header = ['type' => 'header', 'company' => 'Technoware'];
        $footer = [
            'type' => 'footer',
            'company' => 'Technoware',
            'text' => 'You are receiving this because you asked us to keep you up to date.',
        ];

        return [
            [
                'slug' => 'corporate-newsletter',
                'name' => 'Corporate newsletter',
                'description' => 'The general-purpose layout: a lead story, two supporting items and a call to action.',
                'category' => 'newsletter',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'Infrastructure notes for {{first_name}}', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>A short round-up of what we have been working on this month, and one or two things worth knowing about if you run a network of any size.</p>'],
                    ['type' => 'divider'],
                    ['type' => 'heading', 'text' => 'The lead story', 'level' => 2],
                    ['type' => 'text', 'html' => '<p>Replace this with the piece you actually want read. One idea, three or four sentences, and a link to the full article — a newsletter that tries to say everything gets skimmed and closed.</p>'],
                    ['type' => 'button', 'label' => 'Read the full article', 'href' => 'https://www.technoware.in/blog'],
                    ['type' => 'divider'],
                    ['type' => 'columns', 'columns' => [
                        ['heading' => 'Also this month', 'text' => 'A second item, shorter than the lead. Two columns stack on a phone.', 'href' => 'https://www.technoware.in/blog', 'link_label' => 'Read more'],
                        ['heading' => 'From the workshop', 'text' => 'A third item. Keep each to a couple of sentences and let the link do the rest.', 'href' => 'https://www.technoware.in/case-studies', 'link_label' => 'Read more'],
                    ]],
                    ['type' => 'spacer', 'height' => 16],
                    $footer,
                ],
            ],
            [
                'slug' => 'product-announcement',
                'name' => 'Product announcement',
                'description' => 'A single piece of hardware, with the specification that matters and one action.',
                'category' => 'product',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'New in the catalogue', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name}} — we have added something worth a look if you are planning a refresh.</p>'],
                    ['type' => 'product', 'name' => 'Cisco CBS350-24T-4G', 'sku' => 'CBS350-24T-4G', 'text' => '24 gigabit ports, four SFP uplinks, full layer-3 static routing. The switch we specify most often for a floor of forty to sixty users.', 'href' => 'https://www.technoware.in/products', 'link_label' => 'View the specification'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Stock, lead times and installation are all things we can confirm the same day — reply to this email and it reaches an engineer rather than a mailbox.</p>'],
                    ['type' => 'button', 'label' => 'Request information', 'href' => 'https://www.technoware.in/contact'],
                    $footer,
                ],
            ],
            [
                'slug' => 'technology-update',
                'name' => 'Technology update',
                'description' => 'For networking and infrastructure news — explanatory rather than promotional.',
                'category' => 'newsletter',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'What changed, and whether it affects you', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>{{first_name}}, this is the kind of update that is worth two minutes: what has changed, who it affects, and what — if anything — you need to do.</p>'],
                    ['type' => 'heading', 'text' => 'What changed', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>Describe the change plainly. Assume the reader is technical but busy.</p>'],
                    ['type' => 'heading', 'text' => 'Who it affects', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>Be specific about versions, models and dates. Vagueness here is what makes a notice get ignored.</p>'],
                    ['type' => 'heading', 'text' => 'What to do', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>One clear instruction, or an honest "nothing, we have handled it".</p>'],
                    ['type' => 'button', 'label' => 'Talk to an engineer', 'href' => 'https://www.technoware.in/contact'],
                    $footer,
                ],
            ],
            [
                'slug' => 'service-promotion',
                'name' => 'Service promotion',
                'description' => 'Hosting, domains, business email, SSL and VPS — three services side by side.',
                'category' => 'promotion',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'Services that keep the lights on', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>The unglamorous half of an IT estate, {{first_name}} — the parts nobody thinks about until they stop.</p>'],
                    ['type' => 'columns', 'columns' => [
                        ['heading' => 'Business email', 'text' => 'Hosted mail on your own domain, with the SPF and DKIM records set up properly.', 'href' => 'https://www.technoware.in/services', 'link_label' => 'Details'],
                        ['heading' => 'Hosting', 'text' => 'Sites and applications on infrastructure that is monitored rather than merely rented.', 'href' => 'https://www.technoware.in/services', 'link_label' => 'Details'],
                        ['heading' => 'SSL and domains', 'text' => 'Certificates that renew before they expire, on domains that stay yours.', 'href' => 'https://www.technoware.in/services', 'link_label' => 'Details'],
                    ]],
                    ['type' => 'button', 'label' => 'See every service', 'href' => 'https://www.technoware.in/services'],
                    $footer,
                ],
            ],
            [
                'slug' => 'special-offer',
                'name' => 'Special offer',
                'description' => 'A single offer with a deadline. Deliberately restrained — shouting reads as spam.',
                'category' => 'promotion',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'An offer worth a look', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>{{first_name}}, this one runs until the end of the month.</p><p>State the offer in one sentence, say plainly who it is for, and give the date it ends. An offer that reads as urgent without being specific is the shape filters distrust — and readers do too.</p>'],
                    ['type' => 'button', 'label' => 'See what is included', 'href' => 'https://www.technoware.in/contact'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Not relevant right now? Nothing to do — this is the only email about it.</p>'],
                    $footer,
                ],
            ],
            [
                'slug' => 'monthly-company-newsletter',
                'name' => 'Monthly company newsletter',
                'description' => 'Several stories in sequence, for a longer round-up.',
                'category' => 'newsletter',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'This month at Technoware', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name}} — four things from the last few weeks.</p>'],
                    ['type' => 'article', 'heading' => 'A project we finished', 'text' => 'What the client needed, what we installed, and what changed for them afterwards. Two or three sentences.', 'href' => 'https://www.technoware.in/case-studies', 'link_label' => 'Read the case study'],
                    ['type' => 'divider'],
                    ['type' => 'article', 'heading' => 'Something we learned', 'text' => 'A short technical note. These are the items that get forwarded.', 'href' => 'https://www.technoware.in/knowledge-base', 'link_label' => 'Read the article'],
                    ['type' => 'divider'],
                    ['type' => 'article', 'heading' => 'New in the catalogue', 'text' => 'One or two products, with a line each on why they are here.', 'href' => 'https://www.technoware.in/products', 'link_label' => 'Browse the catalogue'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p><strong>And finally</strong> — anything else worth a sentence.</p>'],
                    $footer,
                ],
            ],
            [
                'slug' => 'case-study',
                'name' => 'Case study',
                'description' => 'One project told properly: the problem, the work, the result.',
                'category' => 'story',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'How we solved it', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>{{first_name}}, this is the sort of problem we are called about most often — so it is worth showing what the answer looked like.</p>'],
                    ['type' => 'heading', 'text' => 'The problem', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>What was actually wrong, in the client\'s words rather than ours.</p>'],
                    ['type' => 'heading', 'text' => 'What we did', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>The work, specifically. Name the hardware; this audience reads specifications.</p>'],
                    ['type' => 'heading', 'text' => 'The result', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>Numbers if you have them, and only if they are real.</p>'],
                    ['type' => 'button', 'label' => 'Read the full case study', 'href' => 'https://www.technoware.in/case-studies'],
                    $footer,
                ],
            ],
            [
                'slug' => 'security-alert',
                'name' => 'Cybersecurity alert',
                'description' => 'A security bulletin. Sober by design — an alert that looks like marketing is one nobody acts on.',
                'category' => 'alert',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'Security notice', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>{{first_name}} — a short notice about something that may affect your network.</p>'],
                    ['type' => 'heading', 'text' => 'What we know', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>State the issue and its severity. Link to the vendor advisory rather than paraphrasing it.</p>'],
                    ['type' => 'heading', 'text' => 'Whether you are affected', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>Name the affected versions and models exactly.</p>'],
                    ['type' => 'heading', 'text' => 'What we are doing', 'level' => 3],
                    ['type' => 'text', 'html' => '<p>If you are on a support contract with us, say what has already been done and by when the rest will be.</p>'],
                    ['type' => 'button', 'label' => 'Raise a ticket', 'href' => 'https://www.technoware.in/portal'],
                    $footer,
                ],
            ],
            [
                'slug' => 'event-invitation',
                'name' => 'Event or webinar invitation',
                'description' => 'Date, time, place and one action — the four things an invitation must not bury.',
                'category' => 'event',
                'blocks' => [
                    $header,
                    ['type' => 'heading', 'text' => 'You are invited', 'level' => 1],
                    ['type' => 'text', 'html' => '<p>{{first_name}}, we are running a session you might find useful.</p><p><strong>Date:</strong> replace this<br /><strong>Time:</strong> replace this<br /><strong>Where:</strong> replace this</p>'],
                    ['type' => 'text', 'html' => '<p>Two or three sentences on what will be covered and who it is aimed at. Be honest about the level — an audience that arrives expecting the wrong thing does not come back.</p>'],
                    ['type' => 'button', 'label' => 'Reserve a place', 'href' => 'https://www.technoware.in/contact'],
                    ['type' => 'divider'],
                    ['type' => 'text', 'html' => '<p>Cannot make it? Reply and we will send the recording.</p>'],
                    $footer,
                ],
            ],
            [
                'slug' => 'minimal-executive',
                'name' => 'Minimal executive',
                'description' => 'Text only, no images, no buttons. The one that reads like a personal email.',
                'category' => 'plain',
                'blocks' => [
                    ['type' => 'spacer', 'height' => 12],
                    ['type' => 'text', 'html' => '<p>Hello {{first_name}},</p><p>Write this one as though it were a note to a single person, because that is how it will be read. No images, no buttons, no headings — the whole effect depends on it looking unproduced.</p><p>Three short paragraphs is usually the limit. Then a sign-off with a real name.</p><p>Best regards,<br />The team at Technoware</p>'],
                    ['type' => 'spacer', 'height' => 8],
                    $footer,
                ],
            ],
        ];
    }
}
