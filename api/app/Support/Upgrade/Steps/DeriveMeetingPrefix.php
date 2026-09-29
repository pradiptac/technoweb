<?php

namespace App\Support\Upgrade\Steps;

use App\Models\Setting;
use App\Support\References;
use App\Support\Upgrade\UpgradeStep;

/**
 * An online meeting's reference prefix, derived from the ticket prefix an
 * existing install already carries (2026-09-29, docs/meetings.md).
 *
 * A fresh install gets it from `Branding::apply()` — the company's initials
 * and an M — and is marked as having run this. An install updated to the
 * release that brought meetings has its initials in `ticket_reference_prefix`
 * already, and would otherwise number its meetings under the product's own
 * `MT` beside `AN-…` tickets and `ANV-…` visits. So: the ticket prefix and an
 * M, cut to six — but only while the meeting prefix is still the seeded
 * default or blank. A prefix somebody chose in the console between the
 * update and this step is theirs and is left alone.
 */
final class DeriveMeetingPrefix implements UpgradeStep
{
    public function id(): string
    {
        return '2026-09-29-derive-meeting-prefix';
    }

    public function version(): string
    {
        return '0.98.0';
    }

    public function description(): string
    {
        return 'Number online meetings under the ticket prefix';
    }

    public function run(): void
    {
        $current = strtoupper(trim((string) Setting::query()->where('key', 'meeting_reference_prefix')->value('value')));

        if ($current !== '' && $current !== References::DEFAULTS['meeting_reference_prefix']) {
            return;
        }

        $derived = substr(References::ticket().'M', 0, 6);

        if (preg_match(References::PATTERN, $derived) === 1) {
            // `put` writes only a row the seeder made, which it has: the
            // updater seeds before it runs the steps.
            Setting::put('meeting_reference_prefix', $derived);
            Setting::flushCache();
        }
    }
}
