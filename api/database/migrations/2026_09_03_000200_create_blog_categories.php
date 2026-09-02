<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Categories for blog posts, which have never had any.
 *
 * The blog shipped with an author, a slug and a body and no taxonomy at all —
 * no column, no pivot, not even tags, which the knowledge base has. So every
 * post looked identical from the outside: nothing to filter by, nothing to
 * badge a card with, and no way to answer "what else have you written about
 * this".
 *
 * **Many-to-many, not a column.** A post about AI-assisted advertising is
 * about AI *and* about advertising, and forcing one of those to win produces
 * the taxonomy nobody uses. The knowledge base's single `knowledge_category_id`
 * is the other call and is right there — a support article answers one
 * question — which is why this is a second table rather than a reuse of that
 * one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blog_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description', 500)->nullable();
            /*
             * The order they appear in the category strip and the sidebar.
             * A count would be the obvious ordering and is the wrong one: it
             * reorders itself as people publish, so the navigation moves under
             * somebody who has learnt where things are.
             */
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('blog_category_blog_post', function (Blueprint $table) {
            $table->id();
            $table->foreignId('blog_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('blog_category_id')->constrained()->cascadeOnDelete();

            // One post cannot be filed twice under one category. Without it a
            // double submit renders the same badge twice and inflates every
            // count in the sidebar.
            $table->unique(['blog_post_id', 'blog_category_id'], 'blog_post_category_unique');
        });

        Schema::table('blog_posts', function (Blueprint $table) {
            /*
             * What the hero shows. `false` is the only sane default: the
             * alternative promotes every existing post to the front page on
             * the deploy that runs this.
             */
            $table->boolean('is_featured')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->dropColumn('is_featured');
        });

        Schema::dropIfExists('blog_category_blog_post');
        Schema::dropIfExists('blog_categories');
    }
};
