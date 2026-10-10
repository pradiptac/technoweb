<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Page history (0.145.0, docs/page-builder.md "Page history").
 *
 * One row is the post-save state of a record's content columns. Not a polymorphic
 * relation: `subject_type` is a morph alias (the words `PreviewLinks` uses) and
 * there is no foreign key to a subject, so deleting the record is the model's
 * job and the nightly prune sweeps whatever slips through.
 *
 * `snapshot` is `longText` rather than JSON because nothing queries inside it,
 * and MySQL's JSON type reorders object keys — a section's fields would come
 * back in an order nobody chose.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_revisions', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');

            // The actor is copied as well as joined, as the activity log does:
            // a history that forgets who made a change once they leave has
            // failed at the point it is read.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name', 120)->nullable();

            $table->longText('snapshot');
            $table->json('changed')->nullable();
            $table->unsignedSmallInteger('blocks_count')->default(0);
            $table->char('hash', 40);

            $table->timestamps();

            $table->index(['subject_type', 'subject_id', 'id'], 'content_revisions_subject_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_revisions');
    }
};
