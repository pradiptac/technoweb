<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Comments on blog posts.
 *
 * The shape follows `docs/blog-comments-plan.md`, and every column below
 * answers to the single fact that shapes this feature: **an unmoderated comment
 * form on a public page fills with spam within days.**
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blog_comments', function (Blueprint $table) {
            $table->id();

            // Cascade: a comment on a deleted post is orphaned text nobody can
            // read in context, and keeping it only makes the moderation queue
            // hold rows that lead nowhere.
            $table->foreignId('blog_post_id')->constrained()->cascadeOnDelete();

            /*
             * One level of replies, not a tree.
             *
             * Anything deeper needs indentation the mobile layout has no room
             * for at 320px, and it forces the moderation screen to answer "what
             * happens to the children when I delete the parent" — a question
             * with no good answer that this blog does not need. A reply to a
             * reply attaches to the same top-level comment; `Blog\Comments`
             * enforces that on write rather than trusting the payload.
             *
             * `nullOnDelete` so removing a parent leaves its replies readable
             * rather than silently taking a conversation with it.
             */
            $table->foreignId('parent_id')->nullable()->constrained('blog_comments')->nullOnDelete();

            /*
             * Set when a signed-in portal customer comments, so the name on a
             * comment cannot be spoofed for somebody who has an account here.
             * Null for a guest, which is most of them.
             */
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            /*
             * Snapshots, the split an order item already makes against a
             * product. A guest has no account to join to, and a customer who
             * later changes their name must not silently rewrite what was
             * published under the old one.
             */
            $table->string('author_name', 120);
            $table->string('author_email', 190);

            // Plain text. See the model: rendering escaped removes stored XSS
            // from this feature rather than defending against it.
            $table->text('body');

            $table->string('status', 16)->default('pending')->index();

            /*
             * Scoring, stored with its working.
             *
             * The shape `LeadScore` and `SeoScore` both use: a number without
             * its reasons is one nobody argues with and therefore one nobody
             * trusts. **Nothing is auto-filed on it** — junk scores low and
             * waits in the queue, because auto-filing eventually hides a real
             * reader whose comment was three words and the failure is silent.
             */
            $table->unsignedTinyInteger('score')->default(0);
            $table->json('score_reasons')->nullable();

            /*
             * Hashed, never stored raw.
             *
             * An IP address is personal data under the GDPR and under India's
             * DPDP Act, and nothing here needs to know the address — only
             * whether two comments came from the same place. A hash answers
             * that and nothing else.
             */
            $table->string('ip_hash', 64)->nullable()->index();
            $table->string('user_agent', 512)->nullable();

            // Who let it through, the rule the customer approval queue follows:
            // a decision about somebody else's words should say whose it was.
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            // The public read: approved comments on one post, oldest first.
            $table->index(['blog_post_id', 'status', 'created_at']);
        });

        Schema::table('blog_posts', function (Blueprint $table) {
            /*
             * Per post as well as site-wide.
             *
             * Defaults to **true**, the same call `show_in_menu` made: the
             * opposite default would silently close comments on every existing
             * post the moment this migration ran. The site-wide switch is what
             * decides whether the feature exists at all; this is for the one
             * article that attracts an argument.
             */
            $table->boolean('comments_enabled')->default(true)->after('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('blog_posts', fn (Blueprint $table) => $table->dropColumn('comments_enabled'));
        Schema::dropIfExists('blog_comments');
    }
};
