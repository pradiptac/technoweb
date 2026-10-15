<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A private link to a draft (0.138.0, "Draft share link").
 *
 * Staff review a draft by signing in; a client or a colleague without an
 * account could not. A row here is a 64-hex secret that opens one record,
 * signed out, until it expires or is revoked.
 *
 * **At most one live link per record**, and that is enforced by the endpoint
 * (making a new one deletes the old) rather than by an index: `expires_at` is
 * what makes a row dead, not its absence, and a unique index on the record
 * would turn "replace" into a conflict to resolve.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('preview_links', function (Blueprint $table) {
            $table->id();

            // A morph alias and an id (`Relation::enforceMorphMap`), indexed
            // together by `morphs()` — the console asks "is there a link for
            // this record" every time an edit screen opens.
            $table->morphs('subject');

            // 64 lower-case hex characters. The token *is* the credential, so
            // it is unique and looked up by equality.
            $table->char('token', 64)->unique();

            $table->timestamp('expires_at');

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            // Telemetry the console shows ("opened 3 times"). Written through
            // the query builder so `updated_at` does not move.
            $table->unsignedInteger('views')->default(0);
            $table->timestamp('last_viewed_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('preview_links');
    }
};
