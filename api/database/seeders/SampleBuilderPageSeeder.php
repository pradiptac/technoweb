<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\Page;
use App\Models\Slider;
use App\Support\PageSections\SectionRules;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * One sample builder page (2026-09-26, `docs/page-builder.md`) carrying a
 * section of every type this install can draw, so the audits have something
 * to render: the console's edit form and its saved preview
 * (`/admin/pages/{id}/preview`) take it through DISCOVER.
 *
 * **A draft, and create-only.** It is placeholder content, so it is not on
 * the public site until somebody publishes it, and a re-seed never touches a
 * page that already sits at its slug — `PageSeeder` rewrites the policy
 * pages on every run, and this must not be that. Run after the content
 * blocks, sliders and forms, because its references are to whatever of
 * those is published here; a type with nothing to point at is left out
 * rather than seeded broken (a gallery, on a fresh install).
 */
class SampleBuilderPageSeeder extends Seeder
{
    public const SLUG = 'sample-builder-page';

    public function run(): void
    {
        if (Page::query()->where('slug', self::SLUG)->exists()) {
            return;
        }

        // Three pictures where the library has them, never one photo in three
        // sections: next/image's dev LCP check keys its images by URL, so a
        // lazy copy of the hero's photo further down overwrites the eager
        // hero's entry and the audit reports the hero as lazy.
        $pictures = Media::query()->where('mime', 'like', 'image/%')->where('mime', 'not like', '%svg%')->orderBy('id')->limit(4)->pluck('path')->all()
            ?: Media::query()->where('mime', 'like', 'image/%')->orderBy('id')->limit(4)->pluck('path')->all();
        $picture = $pictures[0] ?? null;
        $beside = $pictures[1] ?? $picture;
        $portrait = $pictures[2] ?? $beside;
        // The layout's own picture (0.147.0): a fourth, so no URL repeats on the page.
        $framed = $pictures[3] ?? null;
        $published = fn (string $model) => $model::query()->where('status', PublishStatus::Published)->orderBy('id')->value('id');

        $sections = [
            $this->section('hero', [
                'kicker' => 'Sample page',
                'heading' => 'A page built from sections',
                'lede' => 'Every kind of section the builder offers, in one place, so the look can be judged under each theme. Replace or delete it.',
                'layout' => $picture ? 'split' : 'centered',
                'image_path' => $picture,
                'primary' => ['label' => 'Talk to us', 'href' => '/contact'],
                'secondary' => ['label' => 'See the solutions', 'href' => '/solutions'],
            ]),
            $this->section('rich_text', [
                'heading' => 'Text from the editor',
                'body' => '<p>A section of ordinary text: <strong>bold</strong>, <em>italic</em>, <a href="/about">links</a> and lists.</p><ul><li>One point</li><li>Another point</li></ul>',
            ]),
            $this->section('features', [
                'heading' => 'Short points in columns',
                'lede' => 'Up to twelve, each with an icon.',
                'columns' => 3,
                'items' => [
                    ['icon' => 'shield', 'title' => 'Secure by default', 'body' => 'One sentence about it.'],
                    ['icon' => 'clock', 'title' => 'Fast to respond', 'body' => 'One sentence about it.', 'href' => '/support', 'link_label' => 'Support'],
                    ['icon' => 'users', 'title' => 'People you know', 'body' => 'One sentence about it.'],
                ],
            ], ['kind' => 'page']),
            $this->section('media_text', $picture ? [
                'heading' => 'A picture beside the words',
                'body' => '<p>The picture can sit on either side, or be a video.</p>',
                'media' => 'image', 'image_path' => $beside, 'side' => 'right',
                'primary' => ['label' => 'Read more', 'href' => '/about'],
            ] : [
                'heading' => 'A video beside the words',
                'body' => '<p>The video plays only when somebody presses it.</p>',
                'media' => 'youtube', 'youtube' => 'aqz-KE-bpKQ', 'side' => 'right',
            ]),
            $this->layoutSection($framed),
            $this->section('cards', ['heading' => 'A live list', 'lede' => 'Whatever is published, as the theme draws its grids.', 'source' => 'solutions', 'limit' => 3, 'columns' => 3]),
            $this->section('testimonial', ['quote' => 'A customer’s words go here, with their permission.', 'name' => 'A customer', 'role' => 'Their role, their company', 'photo_path' => $portrait]),
            $this->section('logos', ['heading' => 'Trusted by', 'source' => 'clients']),
            $this->section('video', ['heading' => 'A video', 'source' => 'youtube', 'youtube' => 'aqz-KE-bpKQ', 'caption' => 'Big Buck Bunny, © Blender Foundation, CC BY 3.0 — a placeholder.']),
            $this->section('divider', ['size' => 'medium', 'rule' => true]),
            $this->section('faq', ['heading' => 'Questions', 'source' => 'custom', 'items' => [
                ['question' => 'Can a section be hidden?', 'answer' => 'Yes — hidden sections stay in the page and are left off the public site.'],
                ['question' => 'Can sections be reordered?', 'answer' => 'Yes, with the arrows on each section.'],
            ]]),
        ];

        if ($id = $published(Slider::class)) {
            $sections[] = $this->section('slider', ['heading' => 'A slider', 'slider_id' => $id]);
        }
        if ($id = $published(Gallery::class)) {
            $sections[] = $this->section('gallery', ['heading' => 'A gallery', 'gallery_id' => $id]);
        }
        if ($id = $published(Form::class)) {
            $sections[] = $this->section('form', ['heading' => 'A form', 'lede' => 'Any published form.', 'form_id' => $id]);
        }
        if ($id = $published(ContentBlock::class)) {
            $sections[] = $this->section('content_block', ['block_id' => $id]);
        }

        Page::create([
            'slug' => self::SLUG,
            'title' => 'Sample builder page',
            'template' => 'builder',
            'status' => PublishStatus::Draft,
            'body' => null,
            'blocks' => json_decode((string) json_encode(SectionRules::normalise($sections)), true),
        ]);
    }

    /**
     * The custom layout (0.147.0): a picture beside words, then three boxes —
     * the two arrangements the audits and the layout probe check. Without a
     * fourth picture in the library the first row carries an icon box instead.
     *
     * @return array<string, mixed>
     */
    private function layoutSection(?string $picture): array
    {
        return $this->section('layout', [
            'kicker' => 'Custom layout',
            'heading' => 'Rows and columns, arranged by hand',
            'rows' => [
                [
                    'id' => 'sample01', 'split' => 'wide_last', 'valign' => 'center',
                    'columns' => [
                        ['widgets' => [
                            ['id' => 'sample11', 'type' => 'heading', 'text' => 'A picture beside words', 'size' => 'l'],
                            ['id' => 'sample12', 'type' => 'text', 'html' => '<p>Text from the editor, with <strong>bold</strong> and a <a href="/about">link</a>.</p>'],
                            ['id' => 'sample13', 'type' => 'button', 'label' => 'Talk to us', 'href' => '/contact'],
                        ]],
                        ['widgets' => [
                            $picture
                                ? ['id' => 'sample14', 'type' => 'image', 'image_path' => $picture, 'ratio' => '4:3', 'rounded' => 'm', 'caption' => 'A placeholder picture.']
                                : ['id' => 'sample14', 'type' => 'icon_box', 'icon' => 'shield', 'title' => 'Secure by default', 'body' => 'One sentence about it.'],
                        ]],
                    ],
                ],
                [
                    'id' => 'sample02',
                    'columns' => [
                        ['surface' => 'card', 'widgets' => [['id' => 'sample21', 'type' => 'icon_box', 'icon' => 'shield', 'title' => 'Secure by default', 'body' => 'One sentence about it.']]],
                        ['surface' => 'card', 'widgets' => [['id' => 'sample22', 'type' => 'icon_box', 'icon' => 'clock', 'title' => 'Fast to respond', 'body' => 'One sentence about it.']]],
                        ['surface' => 'raised', 'widgets' => [
                            ['id' => 'sample23', 'type' => 'list', 'marker' => 'number', 'items' => [['text' => 'One'], ['text' => 'Two']]],
                            ['id' => 'sample24', 'type' => 'accordion', 'items' => [['question' => 'Can a column be a box?', 'answer' => 'Yes — a card, or a raised card.']]],
                        ]],
                    ],
                ],
                [
                    // 0.149.0: a video in a column (a facade until pressed), the widget the probe checks requests nothing before a press.
                    'id' => 'sample03',
                    'columns' => [
                        ['widgets' => [['id' => 'sample31', 'type' => 'video', 'youtube' => 'aqz-KE-bpKQ', 'caption' => 'Big Buck Bunny, © Blender Foundation, CC BY 3.0 — a placeholder.']]],
                    ],
                ],
            ],
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>|null  $background
     * @return array<string, mixed>
     */
    private function section(string $type, array $data, ?array $background = null): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => $background, 'data' => array_filter($data, fn ($v) => $v !== null)];
    }
}
