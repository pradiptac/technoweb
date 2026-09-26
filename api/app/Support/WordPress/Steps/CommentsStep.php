<?php

namespace App\Support\WordPress\Steps;

use App\Enums\CommentStatus;
use App\Models\BlogComment;
use App\Support\HtmlSanitiser;
use App\Support\WordPress\Context;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * Approved and held comments on blog posts. Spam and binned ones are never
 * read (the scan asks for approved and held only — `prune-comments` would
 * delete them within a month anyway).
 *
 * The blog keeps one level of replies, so a reply to a reply hangs off the
 * top-level comment it descends from — the rule `Comments::record()` applies
 * to a reader's reply. Read oldest first, so a parent is always written
 * before its replies. The body is plain text here, as a reader's is; the IP
 * is hashed with the application key exactly as `Comments` hashes one.
 */
class CommentsStep extends Step
{
    public function key(): string
    {
        return 'comments';
    }

    public function label(): string
    {
        return 'Comments';
    }

    public function section(): string
    {
        return 'content';
    }

    public function mapType(): ?string
    {
        return 'comment';
    }

    public function records(Context $ctx): iterable
    {
        $comments = Harvest::all($ctx->import, 'comments');
        usort($comments, fn ($a, $b) => strcmp((string) ($a['date_gmt'] ?? ''), (string) ($b['date_gmt'] ?? '')) ?: ($a['id'] <=> $b['id']));

        return $comments;
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $author = trim((string) ($record['author_name'] ?? '')) ?: 'Anonymous';
        $label = $author.' on #'.($record['post'] ?? '?');

        if (! in_array($record['status'] ?? '', ['approved', 'approve', 'hold'], true)) {
            return Outcome::skip($label, 'Spam or binned.');
        }

        if (($record['type'] ?? 'comment') !== 'comment') {
            return Outcome::skip($label, 'A pingback or trackback, which the blog does not keep.');
        }

        if ($ctx->record('posts', $record['post'] ?? null) === null || ! $ctx->map->has('post', $record['post'])) {
            return Outcome::skip($label, 'Not on a blog post that is being imported (comments on pages and products are not kept).');
        }

        $existing = $ctx->map->targetId('comment', $record['id']);

        return Outcome::upsert($existing !== null, $label, ['existing' => $existing, 'author' => $author]);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $status = ($record['status'] ?? '') === 'hold' ? CommentStatus::Pending : CommentStatus::Approved;
        $date = self::date($record['date_gmt'] ?? null) ?? now()->toImmutable();

        $values = [
            'blog_post_id' => $ctx->map->targetId('post', $record['post']),
            'parent_id' => $this->rootParent($ctx, $record),
            'author_name' => Str::limit($outcome->data['author'], 120, ''),
            'author_email' => Str::limit(strtolower((string) ($record['author_email'] ?? '')), 190, '') ?: null,
            'body' => HtmlSanitiser::toEmailText(self::rendered($record['content'] ?? '')) ?: '—',
            'status' => $status,
            'score' => 0,
            'ip_hash' => ($ip = (string) ($record['author_ip'] ?? '')) !== '' ? hash_hmac('sha256', $ip, (string) config('app.key')) : null,
            'user_agent' => Str::limit((string) ($record['author_user_agent'] ?? ''), 500, '') ?: null,
            'approved_at' => $status === CommentStatus::Approved ? $date : null,
        ];

        $comment = $outcome->data['existing'] ? BlogComment::query()->find($outcome->data['existing']) : null;
        $comment ??= new BlogComment;
        $comment->fill($values);
        $comment->forceFill(['created_at' => $date, 'updated_at' => $date])->save();

        $ctx->map->put('comment', $record['id'], $comment, $record['link'] ?? null);
    }

    /** The top-level comment a reply descends from, as it exists here. */
    private function rootParent(Context $ctx, array $record): ?int
    {
        $parent = (int) ($record['parent'] ?? 0);
        $guard = 0;

        while ($parent !== 0 && $guard++ < 50) {
            $row = $ctx->record('comments', $parent);
            $up = (int) ($row['parent'] ?? 0);

            if ($row === null || $up === 0) {
                break;
            }

            $parent = $up;
        }

        return $parent === 0 ? null : $ctx->map->targetId('comment', $parent);
    }
}
