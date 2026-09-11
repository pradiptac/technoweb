<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An editor's own wording for one of the system's emails.
 *
 * **A row exists only when somebody has customised the message.** Absence is
 * "using the built-in", so a fresh install has none of these and the fallback
 * path is the one exercised constantly rather than the one nobody ever runs.
 * Reset-to-default is a `DELETE`, not a flag, because a flag is a second
 * answer to "is this customised" that can disagree with the row.
 *
 * `is_enabled` is the softer switch beside it: it puts the built-in message
 * back **without throwing away an afternoon's copy**.
 *
 * There is deliberately **no `variables` column**. A stored copy of the list
 * the catalogue already owns goes stale the day a message gains a placeholder
 * — the drift `schema_type_options` was moved out of TypeScript to end — and
 * MySQL cannot default a JSON column anyway.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mail_templates', function (Blueprint $table) {
            $table->id();

            /*
             * The catalogue key, hand-written and never derived from a class
             * name: renaming `OrderPaid` must not orphan somebody's copy.
             */
            $table->string('key', 64)->unique();

            $table->string('subject', 200)->nullable();
            $table->text('body_html')->nullable();

            // Null means "derive from the HTML at send time" rather than "was
            // derived once and stored" — a stored derivation is a second body
            // that silently goes stale the moment the first is edited.
            $table->text('body_text')->nullable();

            $table->boolean('is_enabled')->default(true);

            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mail_templates');
    }
};
