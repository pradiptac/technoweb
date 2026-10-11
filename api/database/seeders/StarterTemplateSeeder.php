<?php

namespace Database\Seeders;

use App\Models\SavedSection;
use App\Support\PageSections\SectionRules;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Five starter page templates for the library (0.162.0, docs/page-builder.md
 * "The library"): a landing page, an about page, a services page, a contact
 * page and an event page.
 *
 * Built only from sections that need nothing else to exist — no slider, form,
 * gallery or content block to point at, no picture — so they are valid on a
 * fresh install and on any theme, and every word is a bracketed placeholder
 * for the editor to replace. **Create-only by name**: a template already
 * there, edited or not, is left exactly as it is.
 */
class StarterTemplateSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->templates() as $name => [$category, $description, $sections]) {
            if (SavedSection::query()->where('kind', SavedSection::KIND_TEMPLATE)->where('name', $name)->exists()) {
                continue;
            }

            SavedSection::create([
                'kind' => SavedSection::KIND_TEMPLATE,
                'name' => $name,
                'description' => $description,
                'category' => $category,
                'blocks' => json_decode((string) json_encode(SectionRules::normalise($sections)), true),
            ]);
        }
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: list<array<string, mixed>>}>
     */
    public function templates(): array
    {
        $button = fn (string $label, string $href) => ['label' => $label, 'href' => $href];
        $faq = fn (string $heading) => $this->section('faq', ['heading' => $heading, 'source' => 'custom', 'items' => [
            ['question' => '[A question people ask?]', 'answer' => '[A short, honest answer.]'],
            ['question' => '[Another question?]', 'answer' => '[A short, honest answer.]'],
        ]]);
        $threeSteps = fn (string $heading, string $layout) => $this->section('steps', [
            'heading' => $heading, 'layout' => $layout,
            'items' => [
                ['title' => '[Step one]', 'body' => '[What happens first.]'],
                ['title' => '[Step two]', 'body' => '[What happens next.]'],
                ['title' => '[Step three]', 'body' => '[The result.]'],
            ],
        ]);
        $closing = fn (string $heading, string $tone) => $this->section('cta', [
            'heading' => $heading, 'lede' => '[One sentence on what happens when they get in touch.]', 'tone' => $tone, 'primary' => $button('[Get in touch]', '/contact'),
        ]);
        $checklist = fn (string $heading) => $this->section('checklist', [
            'heading' => $heading, 'columns' => 2,
            'items' => [['text' => '[A point]'], ['text' => '[A point]'], ['text' => '[A point]'], ['text' => '[A point]']],
        ]);
        $timeline = fn (string $heading) => $this->section('timeline', ['heading' => $heading, 'items' => [
            ['date' => '[When]', 'title' => '[What happened]', 'body' => '[A sentence.]'],
            ['date' => '[When]', 'title' => '[What happened]', 'body' => '[A sentence.]'],
            ['date' => '[When]', 'title' => '[What happened]', 'body' => '[A sentence.]'],
        ]]);
        $column = fn (string $heading) => ['heading' => $heading, 'body' => '<p>[A sentence or two about it.]</p>'];

        return [
            'Starter: landing page' => ['landing', 'Headline, three benefits, how it works, figures, questions and a closing call to action.', [
                $this->section('hero', [
                    'kicker' => '[Kicker]', 'heading' => '[Your headline]', 'lede' => '[One or two sentences on what you offer and who it is for.]',
                    'layout' => 'centered', 'primary' => $button('[Main action]', '/contact'),
                ]),
                $this->section('features', [
                    'heading' => '[Why choose us]', 'columns' => 3,
                    'items' => [
                        ['icon' => 'shield', 'title' => '[Benefit one]', 'body' => '[One sentence about it.]'],
                        ['icon' => 'clock', 'title' => '[Benefit two]', 'body' => '[One sentence about it.]'],
                        ['icon' => 'users', 'title' => '[Benefit three]', 'body' => '[One sentence about it.]'],
                    ],
                ]),
                $threeSteps('[How it works]', 'horizontal'),
                $this->section('stats', [
                    'heading' => '[In numbers]', 'display' => 'figures', 'columns' => 3,
                    'items' => [
                        ['value' => '[00]', 'label' => '[What it counts]'],
                        ['value' => '[00]', 'label' => '[What it counts]'],
                        ['value' => '[00]', 'label' => '[What it counts]'],
                    ],
                ]),
                $faq('[Questions]'),
                $closing('[Ready to start?]', 'brand'),
            ]],
            'Starter: about page' => ['about', 'Who you are, what you stand for, your story as a timeline and a way to get in touch.', [
                $this->section('hero', ['heading' => '[About us]', 'lede' => '[One sentence on who you are.]', 'layout' => 'centered']),
                $this->section('rich_text', ['heading' => '[Our story]', 'body' => '<p>[Who you are, when you started and why.]</p><p>[What you do today, and for whom.]</p>']),
                $this->section('columns', [
                    'heading' => '[What we stand for]',
                    'columns' => [$column('[Value one]'), $column('[Value two]'), $column('[Value three]')],
                ]),
                $timeline('[Milestones]'),
                $closing('[Work with us]', 'accent'),
            ]],
            'Starter: services page' => ['services', 'What you do, what is included, how an engagement runs and the questions that come first.', [
                $this->section('hero', [
                    'kicker' => '[Service]', 'heading' => '[What we do]', 'lede' => '[One or two sentences on the service and who it helps.]',
                    'layout' => 'centered', 'primary' => $button('[Ask about it]', '/contact'),
                ]),
                $this->section('features', [
                    'heading' => '[What is included]', 'columns' => 3,
                    'items' => [
                        ['icon' => 'network', 'title' => '[Part one]', 'body' => '[One sentence about it.]'],
                        ['icon' => 'server', 'title' => '[Part two]', 'body' => '[One sentence about it.]'],
                        ['icon' => 'shield', 'title' => '[Part three]', 'body' => '[One sentence about it.]'],
                    ],
                ]),
                $checklist('[What you get]'),
                $threeSteps('[How we work]', 'vertical'),
                $faq('[Questions]'),
                $closing('[Let’s talk about it]', 'brand'),
            ]],
            'Starter: contact page' => ['contact', 'Ways to reach you, what happens after someone writes and a few quick answers.', [
                $this->section('hero', ['heading' => '[Get in touch]', 'lede' => '[One sentence on how quickly you reply.]', 'layout' => 'centered']),
                $this->section('columns', [
                    'columns' => [
                        ['heading' => '[Call]', 'body' => '<p>[Your phone number]</p><p>[Hours you answer]</p>'],
                        ['heading' => '[Email]', 'body' => '<p>[Your email address]</p><p>[How soon you reply]</p>'],
                        ['heading' => '[Visit]', 'body' => '<p>[Your address]</p><p>[Hours you are open]</p>'],
                    ],
                ]),
                $threeSteps('[What happens next]', 'horizontal'),
                $faq('[Quick answers]'),
            ]],
            'Starter: event page' => ['event', 'A countdown, what the day covers, the programme and why to come.', [
                $this->section('hero', [
                    'kicker' => '[Date and place]', 'heading' => '[Event name]', 'lede' => '[One sentence on what the event is and who it is for.]',
                    'layout' => 'centered', 'primary' => $button('[Register]', '/contact'),
                ]),
                // Sixty days on from the seeding: a placeholder the editor sets.
                $this->section('countdown', [
                    'heading' => '[Event name] begins in', 'ends_at' => now()->addDays(60)->format('Y-m-d\T09:00'),
                    'done_text' => '[The event has started.]', 'primary' => $button('[Register]', '/contact'),
                ]),
                $this->section('rich_text', ['heading' => '[About the event]', 'body' => '<p>[What the event is, who it is for and what they will take away.]</p>']),
                $timeline('[Programme]'),
                $checklist('[Why come]'),
                $closing('[Save your place]', 'accent'),
            ]],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function section(string $type, array $data): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data];
    }
}
