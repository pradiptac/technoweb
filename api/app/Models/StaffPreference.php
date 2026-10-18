<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A staff member's digest and alert choices (0.185.0, docs/digest-alerts.md). */
class StaffPreference extends Model
{
    protected $fillable = [
        'user_id', 'digest', 'digest_hour', 'digest_weekday', 'digest_skip_quiet', 'alerts',
        'alert_email', 'alert_push', 'quiet_start', 'quiet_end', 'last_digest_at', 'last_digest_figures',
    ];

    /** In step with the migration's defaults: an unsaved row reads the same as a saved one. */
    protected $attributes = [
        'digest' => 'weekly', 'digest_hour' => 8, 'digest_weekday' => 1, 'digest_skip_quiet' => false,
        'alert_email' => true, 'alert_push' => true, 'quiet_start' => '21:00', 'quiet_end' => '08:00',
    ];

    protected function casts(): array
    {
        return [
            'digest_hour' => 'integer', 'digest_weekday' => 'integer', 'digest_skip_quiet' => 'boolean',
            'alerts' => 'array', 'alert_email' => 'boolean', 'alert_push' => 'boolean',
            'last_digest_at' => 'datetime', 'last_digest_figures' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** An absent key is on: a rule added later reaches people who never opened the panel. */
    public function wantsAlert(string $rule): bool
    {
        return ($this->alerts[$rule] ?? true) !== false;
    }

    /** Push only. A window may cross midnight; equal ends mean no quiet hours. */
    public function quietAt(CarbonInterface $at): bool
    {
        $start = (string) $this->quiet_start;
        $end = (string) $this->quiet_end;
        if ($start === $end) {
            return false;
        }
        $now = $at->copy()->setTimezone((string) config('app.timezone'))->format('H:i');

        return $start < $end ? ($now >= $start && $now < $end) : ($now >= $start || $now < $end);
    }
}
