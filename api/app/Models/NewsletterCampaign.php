<?php

namespace App\Models;

use App\Enums\CampaignStatus;
use App\Support\Newsletter\TrackingRewriter;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class NewsletterCampaign extends Model
{
    protected $fillable = [
        'newsletter_template_id', 'resend_of_id', 'created_by', 'name', 'subject', 'subject_b',
        'ab_test_percent', 'ab_wait_hours', 'ab_winner', 'ab_decided_at', 'preheader',
        'from_name', 'from_email', 'reply_to', 'blocks', 'html_content',
        'text_content', 'status', 'scheduled_at', 'started_at', 'completed_at',
        'recipient_count', 'health_score', 'test_sent_at',
        'attachment_path', 'attachment_name', 'attachment_bytes',
    ];

    protected function casts(): array
    {
        return [
            'blocks' => 'array',
            'status' => CampaignStatus::class,
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'test_sent_at' => 'datetime',
            'ab_decided_at' => 'datetime',
            'ab_test_percent' => 'integer',
            'ab_wait_hours' => 'integer',
            'recipient_count' => 'integer',
            'health_score' => 'integer',
            'attachment_bytes' => 'integer',
        ];
    }

    /**
     * Whether this campaign tests two subject lines. A second subject with a
     * test share is the whole of the switch; the wait defaults in the sender.
     */
    public function testsSubjects(): bool
    {
        return filled($this->subject_b) && (int) $this->ab_test_percent > 0;
    }

    /** The subject a given variant receives; `a`, null and the unknown all get the first. */
    public function subjectFor(?string $variant): string
    {
        return $variant === 'b' && filled($this->subject_b) ? (string) $this->subject_b : (string) $this->subject;
    }

    /** When the held remainder may go: the test's start plus the wait. */
    public function abDecideAt(): ?CarbonInterface
    {
        if (! $this->testsSubjects() || $this->started_at === null) {
            return null;
        }

        return $this->started_at->copy()->addHours(max(1, (int) ($this->ab_wait_hours ?: 4)));
    }

    /**
     * A fresh draft with this campaign's wording and none of its history.
     *
     * The one copy mechanism, shared by "duplicate" and "resend to
     * non-openers" so the two cannot drift about what a copy carries. Cleared:
     * everything a send writes (status, the timestamps, the counts, the
     * score), a subject test's outcome, and the link that makes a row a
     * resend — a copy is a plain campaign whatever it was copied from.
     * Unsaved, so the caller can adjust it before it exists.
     *
     * The HTML is **unprepared** on the way. A sent campaign's stored HTML has
     * been through `TrackingRewriter`: every link points at *this* campaign's
     * click rows and the open pixel is in it. Copied as-is, the copy's clicks
     * would be counted against the original and its message would carry two
     * pixels once it was prepared itself. `queue()` prepares the copy afresh.
     */
    public function replicateAsDraft(string $name): self
    {
        $copy = $this->replicate([
            'status', 'scheduled_at', 'started_at', 'completed_at',
            'recipient_count', 'health_score', 'test_sent_at',
            'ab_winner', 'ab_decided_at', 'resend_of_id',
        ]);

        $copy->name = mb_substr($name, 0, 190);
        $copy->status = CampaignStatus::Draft;
        $copy->html_content = TrackingRewriter::unprepare((string) $this->html_content) ?: null;

        return $copy;
    }

    /** The campaign this one was resent from, when it is a resend. @return BelongsTo<NewsletterCampaign, $this> */
    public function resendOf(): BelongsTo
    {
        return $this->belongsTo(NewsletterCampaign::class, 'resend_of_id');
    }

    /** The one resend of this campaign, when there has been one. @return HasOne<NewsletterCampaign, $this> */
    public function resend(): HasOne
    {
        return $this->hasOne(NewsletterCampaign::class, 'resend_of_id');
    }

    /** @return BelongsTo<NewsletterTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(NewsletterTemplate::class, 'newsletter_template_id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsToMany<NewsletterGroup, $this> */
    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(
            NewsletterGroup::class,
            'newsletter_campaign_groups',
            'newsletter_campaign_id',
            'newsletter_group_id',
        );
    }

    /** @return HasMany<NewsletterCampaignRecipient, $this> */
    public function recipients(): HasMany
    {
        return $this->hasMany(NewsletterCampaignRecipient::class, 'newsletter_campaign_id');
    }

    /** @return HasMany<NewsletterLink, $this> */
    public function links(): HasMany
    {
        return $this->hasMany(NewsletterLink::class, 'newsletter_campaign_id');
    }

    /** @return HasMany<NewsletterEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(NewsletterEvent::class, 'newsletter_campaign_id');
    }
}
