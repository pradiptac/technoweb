<?php

namespace App\Models;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingSource;
use App\Enums\MeetingStatus;
use App\Support\References;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * An online meeting, held on Google Meet, with a staff host (2026-09-29,
 * docs/meetings.md).
 *
 * Booked into a free slot and given a host in one transaction
 * (`App\Support\Meetings\MeetingActions`, the one place a meeting changes),
 * so a host is never double-booked. `blocked_from`/`blocked_until` are the
 * meeting widened by its type's buffers and are what the overlap check reads;
 * they are written here, on save, whenever the time or the type changes —
 * and only then, so editing a type's buffers later never moves an existing
 * block, and saving a staff note never re-reads them.
 *
 * A guest reaches their meeting through `access_token`, the visit's and the
 * order's rule: the reference is read out on the phone and printed in email
 * subjects, so it identifies a meeting and never authorises anything.
 *
 * @property MeetingStatus $status
 * @property MeetingSource $source
 * @property MeetingGoogleStatus $google_status
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 * @property Carbon $blocked_from
 * @property Carbon $blocked_until
 */
class Meeting extends Model
{
    protected $fillable = [
        'reference', 'meeting_type_id', 'host_id', 'host_name',
        'customer_id', 'name', 'email', 'phone', 'company', 'agenda',
        'starts_at', 'ends_at', 'blocked_from', 'blocked_until',
        'status', 'cancel_reason', 'cancelled_at', 'completed_at', 'reschedule_count',
        'created_by', 'source',
        'google_event_id', 'google_event_seq', 'google_calendar_id', 'google_account', 'meet_url',
        'google_status', 'google_attempts', 'google_error',
        'access_token', 'staff_note', 'lead_id',
        'source_url', 'source_path', 'source_title', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign',
        'ip_address',
    ];

    /** Never serialised by accident; the create response hands it out once, by name. */
    protected $hidden = ['access_token'];

    protected function casts(): array
    {
        return [
            'status' => MeetingStatus::class,
            'source' => MeetingSource::class,
            'google_status' => MeetingGoogleStatus::class,
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'blocked_from' => 'datetime',
            'blocked_until' => 'datetime',
            'cancelled_at' => 'datetime',
            'completed_at' => 'datetime',
            'reschedule_count' => 'integer',
            'google_event_seq' => 'integer',
            'google_attempts' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $meeting) {
            $meeting->reference ??= self::nextReference();
            $meeting->access_token ??= bin2hex(random_bytes(32));
            $meeting->status ??= MeetingStatus::Scheduled;
            $meeting->source ??= MeetingSource::Site;
            $meeting->google_status ??= MeetingGoogleStatus::Pending;
        });

        static::saving(function (self $meeting) {
            if ($meeting->getAttribute('blocked_from') === null || $meeting->getAttribute('blocked_until') === null
                || $meeting->isDirty(['starts_at', 'ends_at', 'meeting_type_id'])) {
                $meeting->computeBlock();
            }
        });
    }

    /**
     * The meeting widened by its type's buffers.
     *
     * Read from the type as it is now — this runs only when the time or the
     * type changes, which is the one moment the current buffers are the
     * right ones. A type gone missing (it cannot be deleted while it has
     * meetings, but a bare row could be written) blocks the meeting alone.
     */
    public function computeBlock(): void
    {
        if ($this->getAttribute('starts_at') === null || $this->getAttribute('ends_at') === null) {
            return;
        }

        $type = null;

        if ($this->meeting_type_id) {
            $loaded = $this->relationLoaded('meetingType') ? $this->getRelation('meetingType') : null;
            $type = $loaded instanceof MeetingType && $loaded->id === (int) $this->meeting_type_id
                ? $loaded
                : MeetingType::query()->find($this->meeting_type_id);
        }

        $before = $type instanceof MeetingType ? $type->buffer_before : 0;
        $after = $type instanceof MeetingType ? $type->buffer_after : 0;

        $this->blocked_from = $this->starts_at->copy()->subMinutes($before);
        $this->blocked_until = $this->ends_at->copy()->addMinutes($after);
    }

    /**
     * MT-2026-00001 — the ticket reference's shape, sequential within a year.
     *
     * Concurrent inserts could pick the same number; the unique index turns
     * that into a failed insert, which `MeetingActions::book()` regenerates
     * up to three times.
     */
    public static function nextReference(): string
    {
        $year = now()->year;
        $prefix = References::meeting();

        $last = self::query()
            ->where('reference', 'like', "{$prefix}-{$year}-%")
            ->orderByDesc('id')
            ->value('reference');

        $n = $last ? ((int) Str::afterLast($last, '-')) + 1 : 1;

        return sprintf('%s-%d-%05d', $prefix, $year, $n);
    }

    public function getRouteKeyName(): string
    {
        return 'reference';
    }

    /** Whether a presented token is this meeting's. Constant-time, and a blank never matches. */
    public function tokenMatches(?string $token): bool
    {
        return is_string($token) && $token !== '' && hash_equals((string) $this->access_token, $token);
    }

    /** @param  Builder<Meeting>  $query */
    public function scopeScheduled(Builder $query): Builder
    {
        return $query->where('status', MeetingStatus::Scheduled->value);
    }

    /**
     * Still to come: scheduled and not yet started.
     *
     * @param  Builder<Meeting>  $query
     */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where('status', MeetingStatus::Scheduled->value)->where('starts_at', '>', now());
    }

    /**
     * Over and still owed an outcome — the "Needs outcome" filter and the
     * dashboard tile. Nothing is marked a no-show by itself.
     *
     * @param  Builder<Meeting>  $query
     */
    public function scopeNeedsOutcome(Builder $query): Builder
    {
        return $query->where('status', MeetingStatus::Scheduled->value)->where('ends_at', '<=', now());
    }

    /**
     * The guest's way back in: a route handler on the frontend that swaps the
     * token for a cookie and redirects to the clean page. Never put into a
     * Google event — Google mails the event to whatever address was typed.
     */
    public function manageUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')
            .'/meeting/'.$this->reference.'/open?token='.$this->access_token;
    }

    /** The clean page, with no secret in it: what the calendar event links to. */
    public function publicUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/meeting/'.$this->reference;
    }

    public function portalUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/portal/meetings/'.$this->reference;
    }

    /** A path, never a URL — see CLAUDE.md on `frontend_url` in the console. */
    public function adminPath(): string
    {
        return '/admin/meetings/'.$this->reference;
    }

    /** Append a line to the trail. */
    public function record(string $type, ?User $by = null, ?string $from = null, ?string $to = null, ?string $note = null): MeetingEvent
    {
        return $this->events()->create([
            'user_id' => $by?->id,
            'type' => $type,
            'from_value' => $from,
            'to_value' => $to,
            'note' => $note,
        ]);
    }

    /** @return BelongsTo<MeetingType, $this> */
    public function meetingType(): BelongsTo
    {
        return $this->belongsTo(MeetingType::class);
    }

    /** @return BelongsTo<User, $this> */
    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<Lead, $this> */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /** @return HasMany<MeetingEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(MeetingEvent::class)->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<MeetingReminder, $this> */
    public function reminders(): HasMany
    {
        return $this->hasMany(MeetingReminder::class);
    }
}
