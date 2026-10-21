<?php

namespace App\Support\Alerts;

use App\Enums\StaffNotificationKind;
use App\Models\AlertFire;
use App\Models\StaffPreference;
use App\Models\User;
use App\Notifications\StaffAlerts;
use App\Support\Notifications\Notifications;
use App\Support\Notifier;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The five-minute check (docs/digest-alerts.md). Every enabled rule is read,
 * fires whose subject has gone are cleared, and each person is told — once —
 * about what is new for them, in one email and one push.
 */
final class AlertCheck
{
    /** @return array{people: int, alerts: int} */
    public static function run(): array
    {
        /** @var array<string, array{rule: AlertRule, hits: array<string, AlertHit>}> $live */
        $live = [];
        foreach (Rules::all() as $rule) {
            $key = $rule->key();
            if (! AlertSettings::enabled($key)) {
                AlertFire::query()->where('rule', $key)->whereNull('cleared_at')->update(['cleared_at' => now()]);

                continue;
            }
            try {
                /** @var array<string, AlertHit> $hits */
                $hits = $rule->current()->keyBy('subject')->all();
            } catch (Throwable $e) {
                Log::warning('Alert rule failed', ['rule' => $key, 'error' => $e->getMessage()]);

                continue; // nothing cleared for a rule that could not be read
            }
            // A rule at its cap may have more it did not return; clearing those would re-alert them later.
            if (count($hits) < Rules::CAP) {
                AlertFire::query()->where('rule', $key)->whereNull('cleared_at')
                    ->when($hits !== [], fn ($q) => $q->whereNotIn('subject', array_keys($hits)))
                    ->update(['cleared_at' => now()]);
            }
            $live[$key] = ['rule' => $rule, 'hits' => $hits];
        }

        $people = 0;
        $alerts = 0;
        foreach (User::query()->where('is_active', true)->with(['roles', 'staffPreference'])->get() as $user) {
            $prefs = StaffPreferences::for($user);
            $open = AlertFire::query()->where('user_id', $user->id)->whereNull('cleared_at')->get(['rule', 'subject'])
                ->mapWithKeys(fn (AlertFire $f) => [$f->rule.'|'.$f->subject => true]);
            $batch = [];
            foreach ($live as $key => ['rule' => $rule, 'hits' => $hits]) {
                if (! Rules::holds($user, $rule) || ! $prefs->wantsAlert($key)) {
                    continue;
                }
                foreach ($hits as $subject => $hit) {
                    if (! $open->has($key.'|'.$subject)) {
                        $batch[] = ['rule' => $key, 'hit' => $hit];
                    }
                }
            }
            if ($batch === []) {
                continue;
            }
            // Written first: a failed send must not resend the batch next time.
            foreach ($batch as ['rule' => $key, 'hit' => $hit]) {
                AlertFire::query()->updateOrCreate(
                    ['rule' => $key, 'subject' => $hit->subject, 'user_id' => $user->id],
                    ['fired_at' => now(), 'cleared_at' => null],
                );
            }
            // The bell keeps a row per new fire; the email and push below are its delivery.
            foreach ($batch as ['hit' => $hit]) {
                Notifications::send($user, StaffNotificationKind::Alert, $hit->line, $hit->href, null, null, false);
            }
            self::deliver($user, $prefs, $batch);
            $people++;
            $alerts += count($batch);
        }

        return ['people' => $people, 'alerts' => $alerts];
    }

    /** @param list<array{rule: string, hit: AlertHit}> $batch */
    public static function deliver(User $user, StaffPreference $prefs, array $batch, bool $respectQuiet = true): void
    {
        $lines = array_map(fn (array $b) => ['line' => $b['hit']->line, 'href' => $b['hit']->href], $batch);
        if ($prefs->alert_email) {
            Notifier::send($user, new StaffAlerts($lines));
        }
        if ($prefs->alert_push && ! ($respectQuiet && $prefs->quietAt(now()))) {
            $title = count($lines) === 1 ? $lines[0]['line'] : count($lines).' things need you';
            $href = count($lines) === 1 ? $lines[0]['href'] : '/admin';
            StaffPush::send($user, $title, array_column($lines, 'line'), $href);
        }
    }
}
