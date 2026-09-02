<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Was that answer any use, and has anybody dealt with the ones that were not?
 *
 * **On the message rather than in a `chat_feedback` table.** There is exactly
 * one rating per answer — a visitor cannot usefully rate the same sentence
 * twice — so a table would be a join to carry a column, and the reporting
 * question ("what proportion of answers were rated down") is a `WHERE` on the
 * rows that already exist.
 *
 * `resolved_at` on `chat_events` is the other half. §12 wants unanswered
 * questions turned into content, which is only a workflow if somebody can mark
 * one done; without it the list grows for ever and stops being read, which is
 * the fate of every queue nobody can empty. Generic on the event rather than
 * specific to one type, because "somebody has dealt with this" is the same
 * fact whatever the event was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            // 1 or -1, and null for "not asked about". Three states, and the
            // third is the common one — a rate that counted unrated answers as
            // negative would report a healthy assistant as a failing one.
            $table->tinyInteger('rating')->nullable()->after('actions');
            $table->string('rating_note', 500)->nullable()->after('rating');
        });

        Schema::table('chat_events', function (Blueprint $table) {
            $table->timestamp('resolved_at')->nullable()->after('context');
            $table->index(['type', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn(['rating', 'rating_note']);
        });

        Schema::table('chat_events', function (Blueprint $table) {
            $table->dropIndex(['type', 'resolved_at']);
            $table->dropColumn('resolved_at');
        });
    }
};
