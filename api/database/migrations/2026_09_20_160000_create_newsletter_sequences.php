<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Automation sequences: a series of messages sent to each subscriber on a
 * schedule from the day they join.
 *
 * **Each step is a `newsletter_campaigns` row**, not a table of its own. A
 * step with `sequence_id`, `sequence_position` and `delay_days` and status
 * `automation` has the block editor, the health checks, tracking, the
 * unsubscribe footer and a report already — a second table would be a second
 * newsletter. A step send is an ordinary recipient row on that campaign,
 * accumulating over time rather than frozen once.
 *
 * An enrolment is one subscriber's place in one sequence: which position is
 * next and when. **Unique per (sequence, subscriber)** — a person goes
 * through a sequence once, ever. Re-joining the group that triggers it, or
 * being enrolled by hand a second time, is a no-op: a welcome series that
 * restarts for somebody re-imported from a spreadsheet is the failure the
 * index exists to make impossible rather than merely unlikely.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('name', 190);
            $table->string('status', 20)->default('active');
            // The trigger: joining this group enrols. Null means every new
            // subscriber, whichever group (or none) they arrive in.
            $table->foreignId('newsletter_group_id')->nullable()->constrained('newsletter_groups')->nullOnDelete();
            $table->string('from_name', 120)->nullable();
            $table->string('from_email', 190)->nullable();
            $table->string('reply_to', 190)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            // Cascade: a step has no meaning without its sequence, and a
            // sequence is deleted only once nothing is still enrolled in it.
            $table->foreignId('sequence_id')->nullable()->after('resend_of_id')
                ->constrained('newsletter_sequences')->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence_position')->nullable()->after('sequence_id');
            $table->unsignedSmallInteger('delay_days')->nullable()->after('sequence_position');
            $table->index(['sequence_id', 'sequence_position'], 'newsletter_campaigns_sequence_step');
        });

        Schema::create('newsletter_sequence_enrolments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_sequence_id')->constrained('newsletter_sequences')->cascadeOnDelete();
            $table->foreignId('newsletter_subscriber_id')->constrained('newsletter_subscribers')->cascadeOnDelete();
            $table->unsignedSmallInteger('next_position');
            $table->timestamp('next_at')->nullable();
            $table->string('status', 20)->default('active');
            $table->timestamp('enrolled_at');
            $table->timestamp('completed_at')->nullable();
            $table->string('cancelled_reason', 190)->nullable();
            $table->timestamps();

            $table->unique(['newsletter_sequence_id', 'newsletter_subscriber_id'], 'newsletter_enrolment_unique');
            // What the runner asks every ten minutes: active and due.
            $table->index(['status', 'next_at'], 'newsletter_enrolment_due');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_sequence_enrolments');

        Schema::table('newsletter_campaigns', function (Blueprint $table) {
            $table->dropForeign(['sequence_id']);
            $table->dropIndex('newsletter_campaigns_sequence_step');
            $table->dropColumn(['sequence_id', 'sequence_position', 'delay_days']);
        });

        Schema::dropIfExists('newsletter_sequences');
    }
};
