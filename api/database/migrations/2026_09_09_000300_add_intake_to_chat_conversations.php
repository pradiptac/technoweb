<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where the assistant is up to in asking who it is talking to.
 *
 * Two columns rather than three, and deliberately **no step index**. A step
 * number points into a list an editor can reorder from Settings, so a change
 * made mid-conversation would resume somebody at a different question from the
 * one they were answering. `intake_data` holds the fields already collected and
 * the ones declined, and the next question is the first configured step not in
 * either — which is correct however the list is edited.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            /*
             * The answers, plus two reserved keys — `_skipped` and `_retry`.
             *
             * They begin with an underscore for the reason the lead envelope's
             * `_source_url` does: a field name here is validated against
             * `Intake::FIELDS`, which holds none, so a collision is impossible
             * by construction rather than forbidden by a rule somebody has to
             * remember.
             */
            $table->json('intake_data')->nullable()->after('lead_id');

            /*
             * The completion stamp, and it is a stamp rather than a boolean
             * because *when* the assistant stopped asking and started answering
             * is the figure anybody measuring this feature will want — the rule
             * `resolved_at` and `contacted_at` already follow.
             *
             * Null on every existing row, which is the right reading for them:
             * a conversation that predates intake never had one. `Intake` treats
             * a conversation with no configured steps left as complete, so those
             * are not held at a question that will never be asked.
             */
            $table->timestamp('intake_completed_at')->nullable()->after('intake_data');
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropColumn(['intake_data', 'intake_completed_at']);
        });
    }
};
