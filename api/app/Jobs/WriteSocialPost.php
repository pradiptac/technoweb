<?php

namespace App\Jobs;

use App\Enums\SocialPostStatus;
use App\Enums\WritingMode;
use App\Enums\WritingTone;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\SocialPost;
use App\Support\Social\SocialSubjects;
use App\Support\Social\SocialText;
use App\Support\Writing\Surfaces\SocialSurface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Words a fresh draft through the Writer. The draft already holds the no-model
 * fallback, so any refusal leaves it as it is; the AI text only replaces text
 * nobody has touched since.
 */
class WriteSocialPost implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $postId) {}

    public function handle(Writer $writer): void
    {
        $post = SocialPost::query()->find($this->postId);
        if ($post === null || ! $post->ai_pending) {
            return;
        }

        try {
            $subject = $post->status === SocialPostStatus::Draft ? SocialSubjects::find($post->subject_type, $post->subject_id) : null;
            if ($subject instanceof BlogPost || $subject instanceof CaseStudy || $subject instanceof Event || $subject instanceof Entry) {
                $result = $writer->runSystem(new SocialSurface, new WritingInput(
                    WritingMode::Write, WritingTone::Default, '',
                    'Write the '.$post->network->label().' post for this '.$post->subject_type.'.',
                    ['type' => $post->subject_type, 'id' => $post->subject_id, 'network' => $post->network->value],
                ));
                if ($result->ok) {
                    // Conditional on the text still being the fallback, so an editor's words (or a send) win the race.
                    $fallback = SocialText::fallback($post->network, SocialSubjects::title($subject), SocialSubjects::summary($subject), $post->url);
                    SocialPost::query()->whereKey($post->id)->where('status', SocialPostStatus::Draft->value)
                        ->where('text', $fallback)->update(['text' => $result->output]);
                }
            }
        } finally {
            SocialPost::query()->whereKey($post->id)->update(['ai_pending' => false]);
        }
    }
}
