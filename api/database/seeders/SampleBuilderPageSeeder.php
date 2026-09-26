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

        $picture = Media::query()->where('mime', 'like', 'image/%')->where('mime', 'not like', '%svg%')->orderBy('id')->value('path')
            ?? Media::query()->where('mime', 'like', 'image/%')->orderBy('id')->value('path');
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
                'media' => 'image', 'image_path' => $picture, 'side' => 'right',
                'primary' => ['label' => 'Read more', 'href' => '/about'],
            ] : [
                'heading' => 'A video beside the words',
                'body' => '<p>The video plays only when somebody presses it.</p>',
                'media' => 'youtube', 'youtube' => 'aqz-KE-bpKQ', 'side' => 'right',
            ]),
            $this->section('cards', ['heading' => 'A live list', 'lede' => 'Whatever is published, as the theme draws its grids.', 'source' => 'solutions', 'limit' => 3, 'columns' => 3]),
            $this->section('testimonial', ['quote' => 'A customer’s words go here, with their permission.', 'name' => 'A customer', 'role' => 'Their role, their company', 'photo_path' => $picture]),
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
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>|null  $background
     * @return array<string, mixed>
     */
    private function section(string $type, array $data, ?array $background = null): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => $background, 'data' => array_filter($data, fn ($v) => $v !== null)];
    }
}
