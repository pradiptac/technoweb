<?php

namespace App\Support\Social;

use App\Enums\SocialNetwork;
use App\Enums\SocialPostStatus as Status;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\SocialPost;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;

/**
 * Approving and discarding a post. X is never sent by API: the person gets
 * x.com's pre-filled intent address. LinkedIn is posted through the API once
 * connected, else the share page is opened. The claim is a conditional update,
 * so two presses can send once.
 */
class SocialSender
{
    /** What a post says when we cannot tell whether LinkedIn took it. */
    public const UNCONFIRMED = "We couldn't confirm LinkedIn received this. Check the page before trying again.";

    public function __construct(private LinkedInPoster $linkedin) {}

    /** `$manual`: skip the API and open the share page even when LinkedIn is connected. */
    public function approve(SocialPost $p, string $text, User $by, bool $confirm = false, bool $manual = false): SendOutcome
    {
        $network = $p->network;

        $tooLong = $network === SocialNetwork::X
            ? ! SocialText::xFits($text, $p->url)
            : mb_strlen($text) > $network->limit();
        if ($tooLong) {
            return $this->refuse($p, $network === SocialNetwork::X ? 'That is too long for X.' : 'LinkedIn allows up to 3,000 characters.');
        }

        $allowed = [Status::Draft, Status::Failed];
        if ($confirm) {
            $allowed[] = Status::Unconfirmed;
        }
        if (! in_array($p->status, $allowed, true)) {
            return $this->refuse($p, match ($p->status) {
                Status::Discarded => 'Discarded posts cannot be sent.',
                Status::Unconfirmed => 'Check LinkedIn first — confirm to send it again.',
                default => 'This post has already been sent.',
            });
        }

        $was = $p->status;
        $claimed = SocialPost::query()->whereKey($p->id)
            ->whereIn('status', array_map(fn (Status $s) => $s->value, $allowed))
            ->update(['status' => Status::Sending->value, 'text' => $text]);
        if ($claimed === 0) {
            return $this->refuse($p->refresh(), 'This post has already been sent.');
        }
        $p->refresh();

        // Past the claim the post is `sending`; whatever goes wrong, it must not stay there.
        try {
            return $this->deliver($p, $was, $text, $by, $manual);
        } catch (\Throwable $e) {
            Log::warning('Social posts: send failed', ['id' => $p->id, 'error' => $e::class]);

            return $this->unconfirmed($p);
        }
    }

    private function deliver(SocialPost $p, Status $was, string $text, User $by, bool $manual): SendOutcome
    {
        $network = $p->network;
        $subject = SocialSubjects::find((string) $p->subject_type, (int) $p->subject_id);
        if (! ($subject instanceof BlogPost || $subject instanceof CaseStudy || $subject instanceof Event || $subject instanceof Entry)
            || ! SocialSubjects::isVisible($subject)) {
            $p->update(['status' => $was]); // an unconfirmed post must stay one

            return $this->refuse($p, 'That page is no longer published.');
        }

        $url = SocialSubjects::publicUrl($subject);
        $p->url = $url;
        $approved = ['approved_by' => $by->id, 'approved_at' => now()];

        if ($network === SocialNetwork::X) {
            $p->update(['status' => Status::SharedManually, 'error' => null] + $approved);

            return new SendOutcome($p, 'https://x.com/intent/post?text='.urlencode($text).'&url='.urlencode($url));
        }

        if ($manual || ! $this->linkedin->ready()) {
            $p->update(['status' => Status::SharedManually, 'error' => null] + $approved);

            return new SendOutcome($p, 'https://www.linkedin.com/sharing/share-offsite/?url='.urlencode($url));
        }

        try {
            $sent = $this->linkedin->post($text, $url, SocialSubjects::title($subject));
        } catch (SocialRefused $e) {
            if ($e->status === 401) {
                $this->linkedin->connection()->fail($e->getMessage());
            }
            // A 5xx may have made the post before failing; only a 4xx is a plain refusal.
            if ($e->status >= 500) {
                return $this->unconfirmed($p);
            }
            $p->update(['status' => Status::Failed, 'error' => $e->getMessage()]);

            return new SendOutcome($p, null, $e->getMessage());
        } catch (ConnectionException) {
            return $this->unconfirmed($p);
        }

        $p->update([
            'status' => Status::Sent, 'remote_id' => $sent['id'] ?: null, 'remote_url' => $sent['url'] ?: null,
            'sent_at' => now(), 'error' => null,
        ] + $approved);

        return new SendOutcome($p);
    }

    /** @return ?string why it could not be discarded */
    public function discard(SocialPost $p): ?string
    {
        $done = SocialPost::query()->whereKey($p->id)
            ->whereIn('status', [Status::Draft->value, Status::Failed->value, Status::Unconfirmed->value])
            ->update(['status' => Status::Discarded->value]);
        $p->refresh();

        return $done === 0 ? 'Only a post that has not been sent can be discarded.' : null;
    }

    private function unconfirmed(SocialPost $p): SendOutcome
    {
        $p->update(['status' => Status::Unconfirmed, 'error' => self::UNCONFIRMED]);

        return new SendOutcome($p);
    }

    private function refuse(SocialPost $p, string $message): SendOutcome
    {
        return new SendOutcome($p, null, $message);
    }
}
