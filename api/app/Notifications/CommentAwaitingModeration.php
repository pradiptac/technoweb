<?php

namespace App\Notifications;

use App\Models\BlogComment;
use App\Notifications\Concerns\QueuedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * To the desk, when a comment needs reading.
 *
 * **Throttled to one message an hour, not one per comment.** A spam run posts
 * four hundred comments in a few minutes, and four hundred emails is the
 * notification people build a filter for — after which the one that matters
 * arrives in a folder nobody opens. So the first comment in a quiet hour sends,
 * and everything after it is counted rather than mailed: the queue is the
 * record, this is only the nudge towards it.
 *
 * That is a deliberate difference from the enquiry notifications beside it,
 * where every message is somebody waiting for a reply. Nobody is waiting on a
 * blog comment.
 */
class CommentAwaitingModeration extends Notification implements ShouldQueue
{
    use QueuedMail;

    private const THROTTLE_KEY = 'blog:comment-notice';

    public function __construct(public BlogComment $comment) {}

    /**
     * Whether to send at all.
     *
     * Decided here rather than at the call site, so every future caller gets
     * the throttle for free — the argument `staff` middleware makes against a
     * check at 67 call sites.
     *
     * `add()` is the atomic half: it writes only if the key is absent and
     * reports whether it did, so two comments arriving together cannot both
     * decide they are the first. A read-then-write here would send two.
     */
    public static function shouldSend(): bool
    {
        return Cache::add(self::THROTTLE_KEY, true, now()->addHour());
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $c = $this->comment;
        $post = $c->post;

        return (new MailMessage)
            ->subject('A comment is waiting: '.Str::limit($post?->title ?? 'a post', 60))
            ->greeting('A comment is waiting to be read.')
            ->line('**'.$c->author_name.'** commented on *'.($post?->title ?? 'a post').'*.')
            /*
             * The body is quoted, and it is plain text by construction — the
             * column stores no markup at all, so there is nothing here to
             * escape or sanitise. A rich-text field would have had to go
             * through `HtmlSanitiser::toText()`, the way the activation
             * procedure does.
             */
            ->line('> '.Str::limit($c->body, 300))
            ->line('Score '.$c->score.'/100 — a hint only. Nothing is filed automatically.')
            ->action('Read it in the console', rtrim((string) config('app.frontend_url'), '/').'/admin/blog-comments')
            ->line('Further comments in the next hour will not send another email; they are all in the queue.');
    }
}
