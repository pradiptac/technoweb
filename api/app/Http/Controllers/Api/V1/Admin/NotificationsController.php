<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\StaffPushSubscription;
use App\Models\User;
use App\Notifications\StaffDigest;
use App\Support\Alerts\AlertCheck;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\Rules;
use App\Support\Alerts\StaffPreferences;
use App\Support\Digest\DigestBuilder;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Digest and alert choices (docs/digest-alerts.md). Staff-wide; the caller's
 * own, or, for an administrator, anybody's through `?user=`.
 */
class NotificationsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return $this->answer($request, $this->target($request));
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->target($request);
        $keys = array_map(fn (AlertRule $r) => $r->key(), Rules::forUser($user));
        $data = $request->validate([
            'digest' => ['sometimes', 'in:'.implode(',', AlertSettings::DIGESTS)],
            'digest_hour' => ['sometimes', 'integer', 'between:0,23'],
            'digest_weekday' => ['sometimes', 'integer', 'between:1,7'],
            'digest_skip_quiet' => ['sometimes', 'boolean'],
            'alerts' => ['sometimes', 'array'],
            'alerts.*' => ['boolean'],
            'alert_email' => ['sometimes', 'boolean'],
            'alert_push' => ['sometimes', 'boolean'],
            'notify_mentions' => ['sometimes', 'boolean'],
            'quiet_start' => ['sometimes', 'date_format:H:i'],
            'quiet_end' => ['sometimes', 'date_format:H:i'],
        ]);
        if (isset($data['alerts']) && ($stray = array_diff(array_keys($data['alerts']), $keys)) !== []) {
            throw ValidationException::withMessages(['alerts' => 'These alerts are not this person’s: '.implode(', ', $stray).'.']);
        }

        $prefs = StaffPreferences::for($user);
        if (isset($data['alerts'])) {
            $data['alerts'] = array_merge($prefs->alerts ?? [], array_map('boolval', $data['alerts']));
        }
        $prefs->fill($data)->save();

        return $this->answer($request, $user->fresh(['roles', 'staffPreference']));
    }

    public function sendDigest(Request $request): JsonResponse
    {
        $user = $request->user();
        Notifier::send($user, new StaffDigest(DigestBuilder::build($user, StaffPreferences::for($user)->last_digest_figures)));

        return response()->json(['message' => 'Your digest is on its way.'], 202);
    }

    public function testAlert(Request $request): JsonResponse
    {
        $user = $request->user();
        AlertCheck::deliver($user, StaffPreferences::for($user), [
            ['rule' => 'test', 'hit' => new AlertHit('test', 'This is a test alert. Real ones name a ticket, an order or a lead.', '/admin/profile')],
        ], respectQuiet: false);

        return response()->json(['message' => 'A test alert is on its way.'], 202);
    }

    private function target(Request $request): User
    {
        $me = $request->user();
        if (! $request->filled('user') || (int) $request->query('user') === $me->id) {
            return $me->loadMissing(['roles', 'staffPreference']);
        }
        abort_unless($me->isAdmin(), 403);

        return User::query()->with(['roles', 'staffPreference'])->findOrFail((int) $request->query('user'));
    }

    private function answer(Request $request, User $user): JsonResponse
    {
        $prefs = StaffPreferences::for($user);
        $rules = Rules::forUser($user);

        return response()->json([
            'data' => [
                'digest' => $prefs->digest,
                'digest_hour' => $prefs->digest_hour,
                'digest_weekday' => $prefs->digest_weekday,
                'digest_skip_quiet' => $prefs->digest_skip_quiet,
                'alerts' => (object) collect($rules)->mapWithKeys(fn (AlertRule $r) => [$r->key() => $prefs->wantsAlert($r->key())])->all(),
                'alert_email' => $prefs->alert_email,
                'alert_push' => $prefs->alert_push,
                'notify_mentions' => (bool) $prefs->notify_mentions,
                'quiet_start' => $prefs->quiet_start,
                'quiet_end' => $prefs->quiet_end,
                'last_digest_at' => $prefs->last_digest_at?->toIso8601String(),
            ],
            'meta' => [
                'user' => ['id' => $user->id, 'name' => $user->name],
                'self' => $user->id === $request->user()->id,
                'rules' => array_map(fn (AlertRule $r) => [
                    'key' => $r->key(), 'label' => $r->label(), 'threshold_label' => $r->thresholdLabel(),
                    'site_enabled' => AlertSettings::enabled($r->key()),
                ], $rules),
                'push_live' => MessageChannel::Push->ready(),
                'browsers' => StaffPushSubscription::query()->where('user_id', $user->id)->latest()->get()
                    ->map(fn (StaffPushSubscription $s) => [
                        'id' => $s->id, 'label' => $s->label, 'last_seen_at' => $s->last_seen_at?->toIso8601String(), 'failed' => $s->failed_at !== null,
                    ])->all(),
                'digests' => array_map(fn (array $o) => ['value' => $o['value'], 'label' => $o['label']], AlertSettings::DIGEST_OPTIONS),
            ],
        ]);
    }
}
