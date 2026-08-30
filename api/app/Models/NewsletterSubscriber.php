<?php

namespace App\Models;

use App\Enums\SubscriberStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class NewsletterSubscriber extends Model
{
    protected $fillable = [
        'customer_id', 'email', 'first_name', 'last_name', 'company', 'phone',
        'status', 'source', 'subscribed_at', 'unsubscribed_at',
        'bounce_count', 'last_bounce_at',
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

        // Normalised on every write, not just on insert: an edit that changes
        // the case of an address must not create a second identity for it.
        static::saving(function (self $subscriber) {
            if ($subscriber->isDirty('email')) {
                $subscriber->email = Str::lower(trim($subscriber->email));
            }
        });
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(NewsletterGroup::class, 'newsletter_group_subscriber')
            ->withTimestamps();
    }

    public function events(): HasMany
    {
        return $this->hasMany(NewsletterEvent::class);
    }

    public function name(): string
    {
        $name = trim(($this->first_name ?? '').' '.($this->last_name ?? ''));

        return $name !== '' ? $name : $this->email;
    }

    /** Active, and not on the suppression list. Both, always. */
    public function canReceive(): bool
    {
        return $this->status->canReceive()
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
            ->orWhere('company', 'like', $like));
    }
}
