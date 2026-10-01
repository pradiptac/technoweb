<?php

namespace App\Models;

use App\Enums\VisitStatus;
use App\Support\References;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Somebody asking for an engineer to come to their site (2026-09-26).
 *
 * The client's decision was "request a time, staff confirm": the customer
 * offers up to three preferred dates with a part of the day each, and the
 * desk chooses the real appointment. So `preferred` is what was asked and
 * `scheduled_start_at` is what was agreed, and neither overwrites the other.
 *
 * A guest reaches their request through `access_token`, the order's rule:
 * the reference is printed in an email subject and read out on the phone,
 * so it identifies a request and never authorises anything.
 *
 * @property VisitStatus $status
 * @property array<int, array<string, mixed>> $preferred
 * @property array<string, string|null> $site_address
 */
class VisitRequest extends Model
{
    protected $fillable = [
        'reference', 'customer_id', 'name', 'email', 'phone', 'company', 'site_address',
        'service_id', 'solution_id', 'location_id', 'notes', 'preferred',
        'status', 'scheduled_start_at', 'scheduled_end_at', 'assigned_to', 'staff_note', 'cancel_reason',
        'confirmed_at', 'completed_at', 'cancelled_at', 'reminded_at',
        'access_token', 'lead_id',
        'source_url', 'source_path', 'source_title', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign',
        'ip_address',
    ];

    /** Never serialised by accident; the create response hands it out once, by name. */
    protected $hidden = ['access_token'];

    protected function casts(): array
    {
        return [
            'status' => VisitStatus::class,
            // A list, and JSON arrays keep their order — the ranking is content.
            'preferred' => 'array',
            'site_address' => 'array',
            'scheduled_start_at' => 'datetime',
            'scheduled_end_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'reminded_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $visit) {
            $visit->reference ??= self::nextReference();
            $visit->access_token ??= bin2hex(random_bytes(32));
            $visit->status ??= VisitStatus::Requested;
        });
    }

    /**
     * TV-2026-00001 — the ticket reference's shape, sequential within a year.
     *
     * Concurrent inserts could pick the same number; the unique index turns
     * that into a failed insert rather than two requests under one reference,
     * the trade `Ticket::nextReference()` makes.
     */
    public static function nextReference(): string
    {
        $year = now()->year;
        $prefix = References::visit();

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

    /** Whether a presented token is this request's. Constant-time, and a blank never matches. */
    public function tokenMatches(?string $token): bool
    {
        return is_string($token) && $token !== '' && hash_equals((string) $this->access_token, $token);
    }

    /** @param  Builder<VisitRequest>  $query */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', array_map(fn (VisitStatus $s) => $s->value, VisitStatus::openStates()));
    }

    /**
     * The guest's way back in: a route handler on the frontend that swaps the
     * token for a cookie and redirects to the clean page, so the secret never
     * stays in an address bar or reaches analytics.
     */
    public function manageUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/')
            .'/visit/'.$this->reference.'/open?token='.$this->access_token;
    }

    public function portalUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/portal/visits/'.$this->reference;
    }

    /** A path, never a URL — see CLAUDE.md on `frontend_url` in the console. */
    public function adminPath(): string
    {
        return '/admin/visits/'.$this->reference;
    }

    /** Append a line to the trail. */
    public function record(string $type, ?User $by = null, ?string $from = null, ?string $to = null, ?string $note = null): VisitEvent
    {
        return $this->events()->create([
            'user_id' => $by?->id,
            'type' => $type,
            'from_value' => $from,
            'to_value' => $to,
            'note' => $note,
        ]);
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Service, $this> */
    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    /** @return BelongsTo<Solution, $this> */
    public function solution(): BelongsTo
    {
        return $this->belongsTo(Solution::class);
    }

    /** @return BelongsTo<Location, $this> */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /** @return BelongsTo<User, $this> */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** @return BelongsTo<Lead, $this> */
    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    /** @return HasMany<VisitEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(VisitEvent::class)->orderBy('created_at')->orderBy('id');
    }

    /** What the visit is about, for a subject line: the service, else the solution, else a site survey. */
    public function topic(): string
    {
        // Loaded here rather than assumed: `preventLazyLoading` is on outside
        // production, and every mail and message about a visit reads this.
        $this->loadMissing(['service', 'solution']);

        // Both are nullOnDelete, so either may have gone since the request
        // was made: read as loaded, and checked, rather than assumed.
        $service = $this->getRelation('service');

        if ($service instanceof Service) {
            return $service->title;
        }

        $solution = $this->getRelation('solution');

        return $solution instanceof Solution ? $solution->title : 'Site survey';
    }
}
