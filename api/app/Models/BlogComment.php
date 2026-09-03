<?php

namespace App\Models;

use App\Enums\CommentStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One comment on one blog post.
 *
 * **The body is plain text and is stored plain.** `HtmlSanitiser` exists and
 * works, but pointing it at anonymous input is a different proposition from
 * pointing it at a content manager's: the allowlist is exactly what the
 * editor's toolbar can produce and what `Prose` styles, and none of that is
 * what a reader needs to say "we hit this too". Storing plain text and
 * rendering it escaped removes stored XSS from this feature rather than
 * defending against it — the same call that made `schema_type` an allowlist
 * instead of free text.
 */
class BlogComment extends Model
{
    protected $fillable = [
        'blog_post_id', 'parent_id', 'customer_id',
        'author_name', 'author_email', 'body', 'status',
        'score', 'score_reasons', 'ip_hash', 'user_agent',
        'approved_at', 'approved_by',
    ];

    /**
     * `status` matches its column default in memory too.
     *
     * The rule the store models had to learn: a model created and asked about
     * in the same breath reads `null` for a column the database would have
     * defaulted, and `isPublic()` on null throws. Nothing in the application
     * does that today and a test did, which is the only reason it was found.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => CommentStatus::Pending->value,
        'score' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => CommentStatus::class,
            'score_reasons' => 'array',
            'approved_at' => 'datetime',
        ];
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(BlogPost::class, 'blog_post_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->oldest('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** What the public site renders, and the only thing it renders. */
    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', CommentStatus::Approved);
    }

    public function scopeWaiting(Builder $query): Builder
    {
        return $query->where('status', CommentStatus::Pending);
    }

    /**
     * Move a comment, stamping who decided and when.
     *
     * `approved_at` is set on arrival at `approved` and **never cleared** —
     * the rule `resolved_at` had to be taught on tickets and `contacted_at` on
     * leads. Un-approving a comment does not un-happen the moment somebody
     * approved it, and every figure anybody quotes about moderation speed reads
     * that column.
     */
    public function moveTo(CommentStatus $status, ?User $by = null): void
    {
        $wasApproved = $this->approved_at !== null;

        $this->status = $status;

        if ($status === CommentStatus::Approved && ! $wasApproved) {
            $this->approved_at = now();
            $this->approved_by = $by?->id;
        }

        $this->save();
    }
}
