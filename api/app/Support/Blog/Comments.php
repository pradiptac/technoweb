<?php

namespace App\Support\Blog;

use App\Enums\CommentStatus;
use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Setting;
use Illuminate\Support\Str;

/**
 * Whether a post takes comments, and how one is recorded.
 *
 * One place, because three things need the same answer — the public read, the
 * public write, and the frontend deciding whether to draw a form — and three
 * resolutions of one question is how the newsletter's footer address ended up
 * being read three different ways.
 */
class Comments
{
    /**
     * Is this post open for comment?
     *
     * Three gates, and all three have to agree: the site-wide switch, the
     * post's own, and age.
     *
     * **Closing by age is the one that matters for spam.** An article nobody
     * has read for two years is where comment spam concentrates — there is no
     * conversation left to interrupt and nobody watching — so an unattended
     * blog quietly stops being a target rather than accumulating one.
     */
    public static function openOn(BlogPost $post): bool
    {
        if (! self::enabledSiteWide()) {
            return false;
        }

        if (! $post->comments_enabled) {
            return false;
        }

        $days = (int) (Setting::get('comments_closed_after_days') ?? 0);

        // Zero means never close, which is the honest reading of an empty
        // setting: an operator who has not chosen a window has not asked for
        // one, and defaulting to some number would close comments on a blog
        // whose owner never knew the setting existed.
        if ($days <= 0 || $post->published_at === null) {
            return true;
        }

        return $post->published_at->addDays($days)->isFuture();
    }

    public static function enabledSiteWide(): bool
    {
        return (bool) Setting::get('comments_enabled');
    }

    /**
     * Record one comment. It always arrives `pending`.
     *
     * **Nothing is auto-approved and nothing is auto-filed as spam.** The score
     * rides along so a moderator knows what to read first and decides nothing
     * by itself; see `CommentScore` for why.
     *
     * @param  array{author_name:string,author_email:string,body:string,parent_id?:?int,seconds_on_page?:?int}  $input
     */
    public static function record(BlogPost $post, array $input, ?Customer $customer, ?string $ip, ?string $userAgent): BlogComment
    {
        $email = Str::lower(trim($input['author_email']));

        $scored = CommentScore::for([
            'body' => $input['body'],
            'author_email' => $email,
            'seconds_on_page' => $input['seconds_on_page'] ?? null,
            'customer' => $customer !== null,
            'returning' => BlogComment::where('author_email', $email)
                ->where('status', CommentStatus::Approved)
                ->exists(),
        ]);

        return BlogComment::create([
            'blog_post_id' => $post->id,
            'parent_id' => self::topLevelParent($post, $input['parent_id'] ?? null),
            'customer_id' => $customer?->id,
            /*
             * A signed-in customer's own name and address win over anything
             * posted. Otherwise the one identity this site can actually vouch
             * for would be the easiest to put somebody else's name on.
             */
            'author_name' => $customer?->name ?? trim($input['author_name']),
            'author_email' => $customer?->email !== null ? Str::lower($customer->email) : $email,
            'body' => trim($input['body']),
            'status' => CommentStatus::Pending,
            'score' => $scored['score'],
            'score_reasons' => $scored['reasons'],
            'ip_hash' => self::hashIp($ip),
            'user_agent' => $userAgent !== null ? Str::limit($userAgent, 512, '') : null,
        ]);
    }

    /**
     * Flatten a reply-to-a-reply onto the comment it belongs under.
     *
     * The plan allows one level, and this is where that is enforced rather than
     * hoped for: a parent id is a number in a request body, so "the client only
     * ever sends a top-level id" is not a property of the data. Anything
     * pointing at a reply is re-pointed at *its* parent, and anything naming a
     * comment on another post is dropped entirely — a reply that migrated
     * between articles would be unreadable in both.
     */
    private static function topLevelParent(BlogPost $post, ?int $parentId): ?int
    {
        if ($parentId === null) {
            return null;
        }

        $parent = BlogComment::where('id', $parentId)
            ->where('blog_post_id', $post->id)
            ->where('status', CommentStatus::Approved)
            ->first();

        if ($parent === null) {
            return null;
        }

        return $parent->parent_id ?? $parent->id;
    }

    /**
     * An IP, hashed, never stored raw.
     *
     * Nothing here needs the address — only whether two comments came from the
     * same place. Salted with `APP_KEY` so the hashes are useless outside this
     * install: an unsalted SHA-256 of an IPv4 address is reversible by trying
     * all four billion of them, which is minutes of work and makes "hashed"
     * meaningless.
     */
    private static function hashIp(?string $ip): ?string
    {
        return $ip === null ? null : hash_hmac('sha256', $ip, (string) config('app.key'));
    }
}
