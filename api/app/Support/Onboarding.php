<?php

namespace App\Support;

use App\Models\Page;
use App\Models\Setting;
use App\Models\User;
use App\Support\Backups\BackupSettings;

/**
 * "Getting started": what a new install still has to do before it is the
 * client's own site (2026-10-05, the dashboard's checklist).
 *
 * Every step is answered from the install's real state, never from a box
 * somebody ticked — a checklist that can be ticked without doing the thing is
 * a checklist that says "done" over the invented phone number. Most of them
 * are the "must not ship" placeholders in CLAUDE.md, recognised by the exact
 * values the seeders write, so a step goes green the moment the sample is
 * replaced and not before.
 *
 * Each step names the console path that fixes it. Paths, never URLs: the
 * console and the site are one origin (the SEO overview's rule).
 */
final class Onboarding
{
    /** The values the seeders write, which are what "still a placeholder" means. */
    private const SAMPLE_PHONE = '+91 98765 43210';

    private const SAMPLE_ADDRESS = 'Lakeview Industrial Estate';

    private const SAMPLE_STAT = '340+|Sites under AMC';

    private const SAMPLE_SOCIAL = [
        'https://www.linkedin.com/company/technoware',
        'https://x.com/technoware',
        'https://wa.me/919876543210',
    ];

    /** @return list<array{key:string,label:string,hint:string,href:string,done:bool}> */
    public static function steps(): array
    {
        $s = fn (string $key) => trim((string) Setting::get($key, ''));

        $socials = array_filter(array_map($s, [
            'social_linkedin', 'social_facebook', 'social_x', 'social_instagram',
            'social_youtube', 'social_whatsapp', 'social_reddit',
        ]));

        $legal = Page::query()->whereIn('slug', ['privacy', 'terms'])->get(['created_at', 'updated_at']);

        return [
            [
                'key' => 'logo',
                'label' => 'Add your logo',
                'hint' => 'Until one is uploaded the header spells the company name in text.',
                'href' => '/admin/settings?tab=general#setting__logo_path',
                'done' => $s('logo_path') !== '',
            ],
            [
                'key' => 'contact',
                'label' => 'Replace the sample phone number and address',
                'hint' => 'The seeded number and the Mumbai address are invented, and both are on every page.',
                'href' => '/admin/settings?tab=contact',
                'done' => $s('phone') !== '' && $s('phone') !== self::SAMPLE_PHONE
                    && ! str_contains($s('address'), self::SAMPLE_ADDRESS),
            ],
            [
                'key' => 'figures',
                'label' => 'Put your own figures on the homepage',
                'hint' => '“340+ sites under AMC” and the rest are samples written to show the layout.',
                'href' => '/admin/site/settings?tab=homepage',
                'done' => ! str_contains(str_replace("\r", '', $s('hero_stats')), self::SAMPLE_STAT),
            ],
            [
                'key' => 'social',
                'label' => 'Check the social links',
                'hint' => 'The sample profiles probably belong to somebody else. Blank hides an icon.',
                'href' => '/admin/settings?tab=social',
                'done' => array_intersect($socials, self::SAMPLE_SOCIAL) === [],
            ],
            [
                'key' => 'look',
                'label' => 'Choose a look',
                'hint' => 'A theme and a palette under Site → Themes and Site → Settings.',
                'href' => '/admin/themes',
                'done' => $s('theme') !== 'technoware' || ($s('site_theme') !== '' && $s('site_theme') !== 'classic') || $s('site_theme_options') !== '',
            ],
            [
                'key' => 'mail',
                'label' => 'Send a test email',
                'hint' => 'Choose how mail leaves, then send yourself one — receipts and sign-in codes depend on it.',
                'href' => '/admin/settings?tab=mail',
                'done' => $s('mail_transport') !== '' && $s('mail_error') === '',
            ],
            [
                'key' => 'scheduler',
                'label' => 'Add the scheduler’s cron line',
                'hint' => 'It delivers the mail and runs the backups; without it both stop silently.',
                'href' => '/admin/system/status#scheduler',
                'done' => (bool) (QueueHealth::scheduler()['running'] ?? false),
            ],
            [
                'key' => 'backups',
                'label' => 'Turn on backups',
                'hint' => 'The database and the uploads, on a schedule, somewhere other than this server.',
                'href' => '/admin/backups/settings',
                'done' => BackupSettings::enabled(),
            ],
            [
                'key' => 'team',
                'label' => 'Invite your team',
                'hint' => 'A login each, with only the roles they need.',
                'href' => '/admin/users/new',
                'done' => User::query()->where('is_active', true)->count() > 1,
            ],
            [
                'key' => 'legal',
                'label' => 'Have the privacy and terms pages reviewed',
                'hint' => 'They are placeholder copy that reads like real policy. Done once both have been edited.',
                'href' => '/admin/pages',
                'done' => $legal->count() === 2 && $legal->every(
                    fn (Page $p) => $p->updated_at !== null && $p->created_at !== null && $p->updated_at->diffInSeconds($p->created_at, true) > 60,
                ),
            ],
        ];
    }
}
