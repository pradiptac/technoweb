<?php

namespace App\Support\PageSections;

/**
 * "Start from" — three plain starting stacks for a new builder page
 * (2026-09-26), sent as `meta.section_presets`.
 *
 * Plain JSON in the section shape, **without ids**: the console mints a
 * fresh uuid for every section when a preset is applied, so two pages
 * started from one preset share nothing. Only self-contained section types
 * appear here — no reference to a content block, slider, gallery or form,
 * because a preset cannot know which of those an install has, and a section
 * pointing at nothing is refused on save. Every word is a placeholder the
 * editor is expected to replace, written as an instruction rather than as
 * copy that could be mistaken for the real thing.
 */
final class SectionPresets
{
    /** @return list<array{value: string, label: string, blurb: string, sections: list<array<string, mixed>>}> */
    public static function all(): array
    {
        return [
            [
                'value' => 'landing',
                'label' => 'Landing page',
                'blurb' => 'A hero, three reasons, a live list of solutions, questions and a close.',
                'sections' => [
                    self::section('hero', [
                        'kicker' => 'Say what this page is for',
                        'heading' => 'The promise, in one line',
                        'lede' => 'One or two sentences on who this is for and what changes for them.',
                        'layout' => 'centered',
                        'primary' => ['label' => 'Talk to us', 'href' => '/contact'],
                    ]),
                    self::section('features', [
                        'heading' => 'Why it works',
                        'columns' => 3,
                        'items' => [
                            ['icon' => 'shield', 'title' => 'The first reason', 'body' => 'One sentence that proves it.'],
                            ['icon' => 'clock', 'title' => 'The second reason', 'body' => 'One sentence that proves it.'],
                            ['icon' => 'users', 'title' => 'The third reason', 'body' => 'One sentence that proves it.'],
                        ],
                    ]),
                    self::section('cards', ['heading' => 'What we build', 'source' => 'solutions', 'limit' => 6, 'columns' => 3]),
                    self::section('faq', ['heading' => 'Common questions', 'source' => 'custom', 'items' => [
                        ['question' => 'The question people ask first', 'answer' => 'The plain answer.'],
                        ['question' => 'The question people ask next', 'answer' => 'The plain answer.'],
                    ]]),
                ],
            ],
            [
                'value' => 'service',
                'label' => 'Service page',
                'blurb' => 'A split hero, what is included, how it runs, a testimonial and questions.',
                'sections' => [
                    self::section('hero', [
                        'heading' => 'The service, named plainly',
                        'lede' => 'What it covers and who it is for.',
                        'layout' => 'centered',
                        'primary' => ['label' => 'Ask for a quote', 'href' => '/contact'],
                    ]),
                    self::section('rich_text', [
                        'heading' => 'What is included',
                        'body' => '<p>Describe the service: what is done, what is handed over and what is not part of it.</p>',
                    ]),
                    self::section('features', [
                        'heading' => 'How it runs',
                        'columns' => 4,
                        'items' => [
                            ['icon' => 'survey', 'title' => 'Survey', 'body' => 'What happens first.'],
                            ['icon' => 'layers', 'title' => 'Design', 'body' => 'What happens next.'],
                            ['icon' => 'wrench', 'title' => 'Install', 'body' => 'What happens on site.'],
                            ['icon' => 'headset', 'title' => 'Support', 'body' => 'What happens afterwards.'],
                        ],
                    ]),
                    self::section('testimonial', ['quote' => 'A real customer’s words, with their permission.', 'name' => 'Their name', 'role' => 'Their role and company']),
                    self::section('faq', ['heading' => 'Questions about this service', 'source' => 'page']),
                ],
            ],
            [
                'value' => 'about',
                'label' => 'About page',
                'blurb' => 'A hero, the story, what you stand for, who trusts you and the industries you serve.',
                'sections' => [
                    self::section('hero', [
                        'kicker' => 'About us',
                        'heading' => 'Who you are, in one line',
                        'lede' => 'Where the company came from and what it does today.',
                        'layout' => 'centered',
                    ]),
                    self::section('rich_text', [
                        'heading' => 'Our story',
                        'body' => '<p>How the company started, what it has done since, and what it is proud of.</p>',
                    ]),
                    self::section('features', [
                        'heading' => 'What we stand for',
                        'columns' => 3,
                        'items' => [
                            ['icon' => 'checklist', 'title' => 'A principle', 'body' => 'What it means in practice.'],
                            ['icon' => 'checklist', 'title' => 'A principle', 'body' => 'What it means in practice.'],
                            ['icon' => 'checklist', 'title' => 'A principle', 'body' => 'What it means in practice.'],
                        ],
                    ]),
                    self::section('logos', ['heading' => 'Trusted by', 'source' => 'clients']),
                    self::section('cards', ['heading' => 'Industries we serve', 'source' => 'industries', 'limit' => 6, 'columns' => 3]),
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private static function section(string $type, array $data): array
    {
        return ['type' => $type, 'hidden' => false, 'background' => null, 'data' => $data];
    }
}
