<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\StaffDigest;
use App\Support\Alerts\StaffPreferences;
use App\Support\Digest\DigestBuilder;
use App\Support\Notifier;
use Illuminate\Console\Command;

/** Hourly (docs/digest-alerts.md): each person's digest, at their hour, once a day. */
class SendDigests extends Command
{
    protected $signature = 'technoware:send-digests';

    protected $description = 'Send each staff member their digest when it is due';

    public function handle(): int
    {
        $sent = 0;
        foreach (User::query()->where('is_active', true)->with(['roles', 'staffPreference'])->get() as $user) {
            $prefs = StaffPreferences::for($user);
            if (! DigestBuilder::due($prefs, now()) || $prefs->last_digest_at?->isSameDay(now())) {
                continue;
            }
            $digest = DigestBuilder::build($user, $prefs->last_digest_figures);
            $prefs->last_digest_at = now();
            if (! ($digest->allZero && $prefs->digest_skip_quiet)) {
                Notifier::send($user, new StaffDigest($digest));
                $prefs->last_digest_figures = $digest->figures();
                $sent++;
            }
            $prefs->save(); // stamped first time round too: saving an unsaved default row is how "once a day" holds
        }
        $this->info("{$sent} digests sent.");

        return self::SUCCESS;
    }
}
