<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Tenders (0.174.0, `docs/tenders.md`): a notice inviting bids, with the
 * date it opens, the date it closes, a category, its documents and how to
 * submit. A notice board and nothing more — nothing is submitted here.
 *
 * `reference` is the tender number **as the company issues it**, a string an
 * editor types. Not `App\Support\References`'s `PREFIX-YYYY-NNNNN`: a tender
 * number is often prescribed by the buyer and is quoted on paperwork this
 * application does not own, so generating one would be inventing an
 * identifier somebody else has already given.
 *
 * `documents` is a JSON **list** of `{title, file_path, note}` in the
 * editor's order — a JSON array keeps its order, and the order is content.
 * They are media-library paths: a tender document is public by nature,
 * because anybody may bid, so it needs none of the downloads centre's
 * private disk, streaming route and access rules.
 *
 * No `published_at`: the dates here are `opens_at` and `closes_at`, and
 * status alone decides whether the notice is public (the event's rule).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tender_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 140)->unique();
            $table->string('description', 500)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('tenders', function (Blueprint $table) {
            $table->id();
            // A category deleted leaves its tenders unfiled, the rule a
            // download category follows.
            $table->foreignId('tender_category_id')->nullable()->constrained('tender_categories')->nullOnDelete();

            $table->string('reference', 80)->unique();
            $table->string('title', 180);
            $table->string('slug', 200)->unique();
            $table->string('summary', 300)->nullable();
            $table->longText('description')->nullable();

            $table->string('status', 20)->default('draft');
            $table->boolean('is_featured')->default(false);
            $table->unsignedInteger('sort_order')->default(0);

            // Both required: a notice with no window is not a tender.
            $table->dateTime('opens_at');
            $table->dateTime('closes_at');
            // When the bids are opened, and the pre-bid meeting.
            $table->dateTime('opening_at')->nullable();
            $table->dateTime('prebid_at')->nullable();
            $table->string('prebid_place', 300)->nullable();

            // Paise as integers, the store's rule: the cost of the tender
            // document, and the earnest money deposit.
            $table->unsignedBigInteger('fee_paise')->nullable();
            $table->unsignedBigInteger('emd_paise')->nullable();

            $table->string('submission_email', 191)->nullable();
            $table->string('submission_url', 500)->nullable();
            $table->string('submission_address', 500)->nullable();

            $table->string('contact_name', 160)->nullable();
            $table->string('contact_phone', 40)->nullable();
            $table->string('contact_email', 191)->nullable();

            $table->json('documents')->nullable();

            $table->timestamps();

            // Both public lists (open, closed) and the admin's default order
            // range on the closing date within a status.
            $table->index(['status', 'closes_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenders');
        Schema::dropIfExists('tender_categories');
    }
};
