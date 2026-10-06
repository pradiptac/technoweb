<?php

namespace App\Models;

use App\Enums\EventRegistrationStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One person's — or one party's — place at an event (0.118.0,
 * `docs/events.md`).
 *
 * **One row per address per event.** The unique index on
 * `(event_id, email)` is the rule. Registering again with an address that
 * holds a live registration changes nothing; a cancelled one is revived as
 * if it were new, under a new token (`EventActions::register()`).
 *
 * **`seats` is what capacity counts**, never rows: a registration for four
 * holds four.
 *
 * The registrant reaches their own registration through `token`: 64 hex
 * characters sent **only in the emails to the address that registered** —
 * not in the register response, which goes to whoever typed the address —
 * compared with `hash_equals`, hidden from every serialisation and named by
 * no resource. It is rotated when a cancelled registration is revived.
 *
 * @property EventRegistrationStatus $status
 * @property Carbon|null $waitlisted_at
 * @property Carbon|null $reminded_at
 * @property Carbon|null $cancelled_at
 */
class EventRegistration extends Model
{
    public const SOURCE_PUBLIC = 'public';

    public const SOURCE_STAFF = 'staff';

    protected $fillable = [
        'event_id', 'customer_id', 'name', 'email', 'phone', 'company', 'seats', 'note', 'staff_note',
        'status', 'source', 'token', 'lead_id',
        'waitlisted_at', 'reminded_at', 'cancelled_at',
        'source_url', 'source_path', 'source_title', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign',
        'ip_address',
    ];

    /** Never serialised by accident. It leaves in an email, and nowhere else. */
    protected $hidden = ['token'];

    protected $attributes = ['seats' => 1, 'source' => self::SOURCE_PUBLIC];

    protected function casts(): array
    {
        return [
            'status' => EventRegistrationStatus::class,
            'seats' => 'integer',
            'waitlisted_at' => 'datetime',
            'reminded_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $registration) {
            $registration->token ??= bin2hex(random_bytes(32));
            $registration->status ??= EventRegistrationStatus::Confirmed;
        });
    }

    /** Whether a presented token is this registration's. Constant-time, and a blank never matches. */
    public function tokenMatches(?string $token): bool
    {
        return is_string($token) && $token !== '' && hash_equals((string) $this->token, $token);
    }

    /**
     * The manage page, as a path; the frontend supplies the origin. On no
     * response: it is what `manageUrl()` is built from, for the emails.
     */
    public function managePath(): string
    {
        return '/events/registration/'.$this->token;
    }

    /** The same page, absolute, for the confirmation email. */
    public function manageUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->managePath();
    }

    /** Where the desk works this registration. A path, never a URL. */
    public function adminPath(): string
    {
        return '/admin/events/'.$this->event_id.'/registrations';
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Lead, $this> */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
