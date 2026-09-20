<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Email verification through Hunter.io: the verdict on each subscriber, and a
 * ledger of every call made.
 *
 * The ledger is not telemetry. It is what makes two rules hold that the
 * subscriber row alone cannot: the monthly cap is counted from it, so the
 * count survives a subscriber being deleted; and an address deleted and
 * re-imported finds its earlier verdict there and is not paid for twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_subscribers', function (Blueprint $table) {
            $table->string('verification', 16)->default('unverified')->after('bounce_count')->index();
            // Hunter's own word (`valid`, `webmail`, `accept_all`, ...), kept
            // for the badge's tooltip; `verification` is what the send reads.
            $table->string('verification_result', 16)->nullable()->after('verification');
            $table->unsignedTinyInteger('verification_score')->nullable()->after('verification_result');
            $table->unsignedTinyInteger('verification_attempts')->default(0)->after('verification_score');
            $table->timestamp('verification_at')->nullable()->after('verification_attempts');
        });

        Schema::create('newsletter_verifications', function (Blueprint $table) {
            $table->id();
            // History outlives the row, the rule suppressions follow: the
            // address is the identity, the subscriber id a convenience.
            $table->foreignId('newsletter_subscriber_id')->nullable()->constrained('newsletter_subscribers')->nullOnDelete();
            $table->string('email', 190)->index();
            // 0 means the request never reached Hunter (a transport failure).
            $table->unsignedSmallInteger('http_status')->default(0);
            $table->string('status', 16)->nullable();
            $table->unsignedTinyInteger('score')->nullable();
            // scheduled | manual | ledger — the last being a verdict copied
            // from an earlier row for the same address, with no call made.
            $table->string('source', 12)->default('scheduled');
            $table->timestamp('created_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_verifications');

        Schema::table('newsletter_subscribers', function (Blueprint $table) {
            $table->dropIndex(['verification']);
            $table->dropColumn([
                'verification', 'verification_result', 'verification_score',
                'verification_attempts', 'verification_at',
            ]);
        });
    }
};
