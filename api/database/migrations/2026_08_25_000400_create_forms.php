<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('forms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // What a shortcode addresses: [form slug="contact"].
            $table->string('slug')->unique();
            $table->string('status')->default('published')->index();
            $table->string('submit_label')->default('Send');
            $table->text('success_message')->nullable();
            /*
             * Where a submission is announced. Null falls back to the
             * `sales_email` setting, which is where enquiries already go — so
             * a new form notifies somebody by default rather than filling a
             * table nobody reads.
             */
            $table->string('notify_email')->nullable();
            $table->timestamps();
        });

        Schema::create('form_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('form_id')->constrained()->cascadeOnDelete();
            $table->string('kind')->default('text');
            /*
             * The key this field's value is stored and emailed under.
             *
             * Constrained to slug characters on write. It becomes an array
             * key, a validation rule name and a line in an email — three
             * places where an arbitrary string is a liability rather than a
             * convenience.
             */
            $table->string('name', 60);
            $table->string('label');
            $table->string('placeholder')->nullable();
            $table->string('help')->nullable();
            $table->boolean('required')->default(false);
            /** Select and radio options, as a list of {value,label}. */
            $table->json('options')->nullable();
            /** half | full — how much of the two-column grid the field takes. */
            $table->string('width')->default('full');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['form_id', 'sort_order']);
            // One key per form, or two fields would overwrite each other's
            // answer and the second would silently win.
            $table->unique(['form_id', 'name']);
        });

        Schema::create('form_submissions', function (Blueprint $table) {
            $table->id();
            // Kept when the form is deleted: a submission is a record of
            // something a person actually sent, and deleting the form it came
            // through should not destroy it.
            $table->foreignId('form_id')->nullable()->constrained()->nullOnDelete();
            $table->string('form_slug');
            $table->json('data');
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['form_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_submissions');
        Schema::dropIfExists('form_fields');
        Schema::dropIfExists('forms');
    }
};
