<?php

namespace App\Models;

use App\Enums\EmailVerification;
use App\Enums\SubscriberStatus;
use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class NewsletterSubscriber extends Model
{
    protected $fillable = [
        'customer_id', 'email', 'first_name', 'last_name', 'company', 'phone',
        'industry', 'location', 'website', 'source_url',
        'status', 'source', 'subscribed_at', 'unsubscribed_at',
        'bounce_count', 'last_bounce_at',
        'verification', 'verification_result', 'verification_score',
        'verification_attempts', 'verification_at',
    ];

    /**
     * The column's default, in memory too. `canReceive()` reads the enum
     * on a row created and asked about in one breath, which a null cast
     * would throw on — the trap `StoreProduct` records for `track_stock`.
     */
    protected $attributes = [
        // `status` too: `Sequences::enrol()` asks a row created and enrolled
        // in one breath, and the column's default is not on the model until
        // it is re-read. Null there read as "not active" and enrolled nobody.
        'status' => 'active',
        'verification' => 'unverified',
        'verification_attempts' => 0,
    ];

    protected function casts(): array
    {
        return [
            'customer_id' => 'integer',
            'status' => SubscriberStatus::class,
            'subscribed_at' => 'datetime',
            'unsubscribed_at' => 'datetime',
            'last_bounce_at' => 'datetime',
            'bounce_count' => 'integer',
            'verification' => EmailVerification::class,
            'verification_score' => 'integer',
            'verification_attempts' => 'integer',
            'verification_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $subscriber) {
            /*
             * The token is minted here rather than by every caller.
             *
             * There are five ways a subscriber is created — the signup form,
             * a manual add, a CSV import, the customer import and the seeder —
             * and a row without a token is one whose unsubscribe link 404s.
             * That is not a bug anybody notices until somebody who wants to
             * leave cannot, which is the worst moment to find it.
             */
            $subscriber->unsubscribe_token ??= Str::random(48);
            $subscriber->subscribed_at ??= now();
        });

        /*
         * `subscriber.joined` on the row being created. `SubscriberIntake`
         * creates a subscriber exactly once per address — an existing row is
         * enriched, never re-created — so this fires once however the address
         * arrived: the signup form, a paste, a file, a mailbox scan, the
         * customer group. An address that unsubscribed and came back is an
         * update, not a join, and is deliberately silent.
         */
        static::created(function (self $subscriber) {
            Webhooks::emit(WebhookEvent::SubscriberJoined, fn () => WebhookPayload::subscriber($subscriber));
        });

        // Normalised on every write, not just on insert: an edit that changes
        // the case of an address must not create a second identity for it.
        static::saving(function (self $subscriber) {
            if ($subscriber->isDirty('email')) {
                $subscriber->email = Str::lower(trim($subscriber->email));
            }
        });
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsToMany<NewsletterGroup, $this> */
    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(NewsletterGroup::class, 'newsletter_group_subscriber')
            ->withTimestamps();
    }

    /** @return HasMany<NewsletterEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(NewsletterEvent::class);
    }

    /** @return HasMany<NewsletterVerification, $this> */
    public function verifications(): HasMany
    {
        return $this->hasMany(NewsletterVerification::class);
    }

    /** @return HasMany<NewsletterSequenceEnrolment, $this> */
    public function enrolments(): HasMany
    {
        return $this->hasMany(NewsletterSequenceEnrolment::class);
    }

    public function name(): string
    {
        $name = trim(($this->first_name ?? '').' '.($this->last_name ?? ''));

        return $name !== '' ? $name : $this->email;
    }

    /**
     * Active, not on the suppression list, and not an address Hunter is sure
     * does not exist. All three, always — and the third is a prediction, so
     * it lives on the row where Re-check can overrule it rather than on the
     * suppression list, which records decisions and bounces.
     */
    public function canReceive(): bool
    {
        return $this->status->canReceive()
            && $this->verification->isSendable()
            && ! NewsletterSuppression::has($this->email);
    }

    public function scopeSearch($query, ?string $term)
    {
        if (blank($term)) {
            return $query;
        }

        $like = '%'.$term.'%';

        return $query->where(fn ($q) => $q
            ->where('email', 'like', $like)
            ->orWhere('first_name', 'like', $like)
            ->orWhere('last_name', 'like', $like)
            ->orWhere('company', 'like', $like)
            ->orWhere('website', 'like', $like));
    }
}
