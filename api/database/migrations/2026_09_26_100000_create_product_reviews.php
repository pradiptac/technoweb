<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reviews on the shop's products (`docs/store-reviews-plan.md`).
 *
 * One review per customer per product — the unique index is the rule, so
 * "write a review" on a product somebody has already reviewed edits the one
 * they wrote rather than adding a second voice from the same person. A
 * signed-in customer is the only author: `customer_id` is required and
 * cascades, because a review without its author is an anonymous claim.
 *
 * `order_id` is the paid order that makes it **Verified**, `nullOnDelete`
 * so the review survives an order being removed from the database (it
 * never is; the rule is about the shape). `display_name` and
 * `variant_label` are snapshots taken when the review is written — a
 * customer renaming their account, or the shop renaming the variation,
 * must not rewrite what a published card says.
 *
 * `published_at` is stamped on the first publish and never cleared, the
 * `approved_at` rule on blog comments: un-publishing does not un-happen the
 * moment somebody published it.
 *
 * `rating_average` and `rating_count` on the product are the summary every
 * card and list reads, recomputed by `ReviewSummary::refresh()` whenever a
 * review enters or leaves `published` — so a grid of twenty-four products
 * never aggregates per row. `orders.review_requested_at` is the once-only
 * stamp on the "How was it?" email.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->foreignId('variation_id')->nullable()->constrained('store_product_variations')->nullOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->string('title', 120)->nullable();
            $table->text('body');
            $table->string('display_name', 120);
            $table->string('variant_label', 190)->nullable();
            $table->string('status', 20)->default('pending');
            $table->boolean('is_featured')->default(false);
            $table->timestamp('published_at')->nullable();
            $table->foreignId('moderated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('moderated_at')->nullable();
            $table->timestamps();

            $table->unique(['store_product_id', 'customer_id']);
            $table->index(['store_product_id', 'status', 'published_at']);
            $table->index(['status', 'id']);
        });

        Schema::table('store_products', function (Blueprint $table) {
            $table->decimal('rating_average', 2, 1)->nullable()->after('is_featured');
            $table->unsignedInteger('rating_count')->default(0)->after('rating_average');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('review_requested_at')->nullable()->after('cancelled_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('review_requested_at');
        });

        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn(['rating_average', 'rating_count']);
        });

        Schema::dropIfExists('product_reviews');
    }
};
