<?php

namespace App\Support\Newsletter;

use App\Enums\EnrolmentStatus;
use App\Enums\SubscriberStatus;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSequence;
use App\Models\NewsletterSequenceEnrolment;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Automation sequences: enrolling, and sending each step when it falls due.
 *
 * Two rules shape the whole thing.
 *
 * **A subscriber goes through a sequence once, ever.** The enrolment table is
 * unique per (sequence, subscriber), and `enrol()` reports `already_enrolled`
 * rather than starting again — a welcome series that restarts for somebody
 * re-imported from a spreadsheet, or who left a group and rejoined it, is the
 * failure the index makes impossible rather than merely unlikely. The step
 * campaigns' own recipient index (one row per subscriber per campaign) says
 * the same thing one level down.
 *
 * **The runner is the scheduler, not a listener.** Nothing here sends at the
 * moment of enrolment: `run()` is called every ten minutes by
 * `technoware:run-sequences`, finds the enrolments whose `next_at` has
 * passed, writes a recipient row on the step campaign and dispatches the
 * same `SendCampaignBatch` a campaign uses. A step with a delay of zero
 * therefore goes out within ten minutes of joining, not within the request
 * that joined — which keeps SMTP off the request path (the rule every
 * notification here follows), keeps a paused sequence a matter of one
 * status rather than a queue to drain, and means every send goes through
 * the one job that already knows about suppression, verification and hard
 * bounces.
 */
class Sequences
{
    public const ENROLLED = 'enrolled';

    public const ALREADY_ENROLLED = 'already_enrolled';

    public const NOT_ACTIVE = 'not_active';

    public const SUPPRESSED = 'suppressed';

    public const NO_STEPS = 'no_steps';

    /**
     * Enrol one subscriber in one sequence.
     *
     * Only an active subscriber not on the suppression list; the first step's
     * delay decides when they get it. A sequence with no steps enrols nobody
     * — an enrolment with nowhere to go would sit `active` for ever and read
     * on the console as somebody waiting.
     *
     * @return string one of the outcome constants
     */
    public static function enrol(NewsletterSequence $sequence, NewsletterSubscriber $subscriber): string
    {
        if ($subscriber->status !== SubscriberStatus::Active) {
            return self::NOT_ACTIVE;
        }

        if (NewsletterSuppression::has($subscriber->email)) {
            return self::SUPPRESSED;
        }

        $first = $sequence->steps()->first();

        if ($first === null) {
            return self::NO_STEPS;
        }

        if ($sequence->enrolments()->where('newsletter_subscriber_id', $subscriber->id)->exists()) {
            return self::ALREADY_ENROLLED;
        }

        try {
            $sequence->enrolments()->create([
                'newsletter_subscriber_id' => $subscriber->id,
                'next_position' => $first->sequence_position,
                'next_at' => now()->addDays((int) $first->delay_days),
                'status' => EnrolmentStatus::Active,
                'enrolled_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Two enrolments at once — an import and the group hook, say.
            // The index decided; the answer is the same as the check above.
            return self::ALREADY_ENROLLED;
        }

        return self::ENROLLED;
    }

    /**
     * The group trigger: a subscriber has just joined these groups.
     *
     * Called from `SubscriberIntake::join()` and from the group screen's
     * bulk add, with the ids that were actually attached — every active
     * sequence triggered by one of them enrols. Wrapped so a sequence can
     * never fail the intake that called it: the subscriber was added, and
     * an enrolment that could not be written is a log line, not a refused
     * import.
     *
     * @param  array<int, int>  $groupIds
     */
    public static function onJoined(NewsletterSubscriber $subscriber, array $groupIds): void
    {
        if ($groupIds === []) {
            return;
        }

        self::guard(function () use ($subscriber, $groupIds) {
            NewsletterSequence::query()
                ->where('status', 'active')
                ->whereIn('newsletter_group_id', $groupIds)
                ->get()
                ->each(fn (NewsletterSequence $s) => self::enrol($s, $subscriber));
        });
    }

    /**
     * The group-less trigger: a subscriber has just been created active.
     *
     * Every active sequence with no group enrols them, whichever group (or
     * none) they arrived in. Called once, from the one place a subscriber is
     * born — `SubscriberIntake::take()` — so a row updated by a later import
     * is not "new" a second time.
     */
    public static function onActivated(NewsletterSubscriber $subscriber): void
    {
        self::guard(function () use ($subscriber) {
            NewsletterSequence::query()
                ->where('status', 'active')
                ->whereNull('newsletter_group_id')
                ->get()
                ->each(fn (NewsletterSequence $s) => self::enrol($s, $subscriber));
        });
    }

    /**
     * Send every step that is due.
     *
     * For each active enrolment past its `next_at` in an active sequence: if
     * the subscriber can no longer be mailed — gone, not active, suppressed
     * — the enrolment is cancelled with the reason and nothing is sent;
     * otherwise a recipient row is written on the step campaign (the shape
     * `AudienceResolver` writes, the model minting the tracking token) and
     * the cursor moves to the next step's position and time, or to
     * `completed` after the last. The rows are then dispatched per step in
     * batches of `CampaignSender::batchSize()`, through the same job a
     * campaign uses.
     *
     * A step that would be refused as a campaign — a blocking health check,
     * an unsubscribe link missing — is not sent as a step either: its
     * enrolments are left where they are and counted as `held`, and the
     * console's step list says which check. A paused sequence's enrolments
     * simply wait.
     *
     * @return array{sent: int, cancelled: int, completed: int, held: int}
     */
    public static function run(): array
    {
        $tally = ['sent' => 0, 'cancelled' => 0, 'completed' => 0, 'held' => 0];
        /** @var array<int, Collection<int, NewsletterCampaign>> $stepsBySequence */
        $stepsBySequence = [];
        /** @var array<int, bool> $blocked keyed by step campaign id */
        $blocked = [];
        /** @var array<int, array<int, int>> $toDispatch step campaign id => recipient ids */
        $toDispatch = [];

        NewsletterSequenceEnrolment::query()
            ->with('subscriber')
            ->where('status', EnrolmentStatus::Active->value)
            ->where('next_at', '<=', now())
            ->whereHas('sequence', fn ($q) => $q->where('status', 'active'))
            ->chunkById(200, function (Collection $chunk) use (&$tally, &$stepsBySequence, &$blocked, &$toDispatch) {
                foreach ($chunk as $enrolment) {
                    /** @var NewsletterSequenceEnrolment $enrolment */
                    $subscriber = $enrolment->subscriber;

                    $reason = match (true) {
                        $subscriber === null => 'The subscriber was deleted.',
                        $subscriber->status !== SubscriberStatus::Active => 'The subscriber is '.$subscriber->status->label().'.',
                        NewsletterSuppression::has($subscriber->email) => 'The address is on the do-not-mail list.',
                        default => null,
                    };

                    if ($reason !== null) {
                        $enrolment->update(['status' => EnrolmentStatus::Cancelled, 'cancelled_reason' => $reason]);
                        $tally['cancelled']++;

                        continue;
                    }

                    $steps = $stepsBySequence[$enrolment->newsletter_sequence_id]
                        ??= NewsletterCampaign::query()
                            ->where('sequence_id', $enrolment->newsletter_sequence_id)
                            ->where('status', 'automation')
                            ->orderBy('sequence_position')
                            ->get();

                    $step = $steps->firstWhere('sequence_position', $enrolment->next_position);

                    // The position was removed (a step deleted, the rest
                    // renumbered below it): nothing more to send.
                    if ($step === null) {
                        $enrolment->update(['status' => EnrolmentStatus::Completed, 'completed_at' => now()]);
                        $tally['completed']++;

                        continue;
                    }

                    $blocked[$step->id] ??= self::prepare($step) === false;

                    if ($blocked[$step->id]) {
                        $tally['held']++;

                        continue;
                    }

                    $recipient = $step->recipients()->firstOrCreate(
                        ['newsletter_subscriber_id' => $subscriber->id],
                        ['email' => $subscriber->email, 'status' => 'pending'],
                    );

                    if ($recipient->wasRecentlyCreated) {
                        $toDispatch[$step->id][] = $recipient->id;
                        $tally['sent']++;
                    }

                    $next = $steps->first(fn (NewsletterCampaign $c) => $c->sequence_position > $enrolment->next_position);

                    if ($next === null) {
                        $enrolment->update(['status' => EnrolmentStatus::Completed, 'completed_at' => now()]);
                        $tally['completed']++;
                    } else {
                        $enrolment->update([
                            'next_position' => $next->sequence_position,
                            'next_at' => now()->addDays((int) $next->delay_days),
                        ]);
                    }
                }
            });

        $size = CampaignSender::batchSize();

        foreach ($toDispatch as $campaignId => $recipientIds) {
            foreach (array_chunk($recipientIds, $size) as $batch) {
                SendCampaignBatch::dispatch($campaignId, $batch);
            }
        }

        return $tally;
    }

    /**
     * Make a step's stored HTML the thing that will be sent.
     *
     * A campaign is prepared once, by `queue()`, at the moment it is sent. A
     * step is sent a person at a time for months, so it is prepared when it
     * is saved (the campaign controller calls this for a step), when its
     * sequence is switched on, and again here before the runner uses it —
     * idempotently, because `TrackingRewriter::prepare()` leaves a link that
     * already points at the tracker alone and adds no second pixel.
     *
     * Returns whether the step may be sent: false when a blocking health
     * check fails, which the runner treats as "hold".
     */
    public static function prepare(NewsletterCampaign $step): bool
    {
        $prepared = TrackingRewriter::prepare($step, (string) $step->html_content);

        $health = HealthCheck::run($step);

        $changes = ['health_score' => $health['score']];

        if ($prepared !== (string) $step->html_content) {
            $changes['html_content'] = $prepared;
        }

        $step->forceFill($changes)->saveQuietly();

        return $health['blocking'] === [];
    }

    /**
     * Resolve a manual enrolment's subscribers: ids, a group's active members,
     * pasted addresses — and enrol each, counting the outcomes.
     *
     * @param  array<int, int>  $subscriberIds
     * @param  array<int, string>  $emails
     * @return array<string, int>
     */
    public static function enrolMany(NewsletterSequence $sequence, array $subscriberIds, ?int $groupId, array $emails): array
    {
        $tally = [
            self::ENROLLED => 0, self::ALREADY_ENROLLED => 0, self::NOT_ACTIVE => 0,
            self::SUPPRESSED => 0, self::NO_STEPS => 0, 'unknown' => 0,
        ];

        $query = NewsletterSubscriber::query()->where(function ($q) use ($subscriberIds, $groupId, $emails) {
            $q->whereIn('id', $subscriberIds === [] ? [0] : $subscriberIds);

            if ($groupId !== null) {
                $q->orWhereHas('groups', fn ($g) => $g->where('newsletter_groups.id', $groupId));
            }

            if ($emails !== []) {
                $q->orWhereIn('email', $emails);
            }
        });

        $found = [];

        $query->chunkById(500, function (Collection $chunk) use ($sequence, &$tally, &$found) {
            foreach ($chunk as $subscriber) {
                $found[] = $subscriber->email;
                $tally[self::enrol($sequence, $subscriber)]++;
            }
        });

        // Addresses typed that are not on the list at all — said, rather
        // than silently counted as nothing.
        $tally['unknown'] = count(array_diff($emails, $found));

        return $tally;
    }

    private static function guard(callable $work): void
    {
        try {
            $work();
        } catch (\Throwable $e) {
            Log::warning('Sequence enrolment failed', ['error' => $e->getMessage()]);
        }
    }
}
