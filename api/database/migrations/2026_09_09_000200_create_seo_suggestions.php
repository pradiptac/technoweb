<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the AI SEO assistant proposed, and what somebody decided about it.
 *
 * The record exists for three questions that cannot be answered afterwards:
 * what was suggested, on which model, and whether a person took it. Without the
 * last one there is no way to tell a feature people use from one they switched
 * on and ignored.
 *
 * **`model` is a column here and is deliberately not one on `chat_messages`.**
 * The chatbot answers a visitor and the model is an implementation detail of
 * that moment; an SEO suggestion is reviewed days later, against a bill, and
 * "which model wrote this" is the first thing anybody asks. It is copied rather
 * than joined for the reason the activity log copies its actor: the setting can
 * change, and what was used must not change with it.
 *
 * Nothing here is a cache. The suggestion is not read back to avoid a second
 * call — accepting one writes the value into the record's own SEO fields
 * through the ordinary form, and this row keeps only the history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seo_suggestions', function (Blueprint $table) {
            $table->id();

            // The record it is about. Every one of the 13 models carrying
            // HasSeo is in the morph map, which enforceMorphMap requires.
            $table->morphs('seoable');

            $table->string('action', 32);
            $table->string('model', 64)->nullable();

            /*
             * pending until somebody decides. Not an enum column: the set is
             * three values that will not grow, and `App\Enums\SeoSuggestionStatus`
             * is where the list lives — the rule TicketStatus follows.
             */
            $table->string('status', 16)->default('pending');

            $table->json('result');
            $table->unsignedInteger('tokens')->default(0);

            // Who asked, and who decided — not necessarily the same person, and
            // nullOnDelete because a staff account leaving must not take the
            // record of the decision with it.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();

            $table->timestamps();

            // The two reads this table gets: the history for one record, and
            // the prune by age.
            $table->index(['seoable_type', 'seoable_id', 'created_at'], 'seo_suggestions_record_idx');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seo_suggestions');
    }
};
