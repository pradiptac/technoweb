<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per committed catalogue import — the file, the mapping that was
 * applied, the counts and every line that was refused with its reason.
 *
 * The shape `newsletter_imports` has, for the same reason: a price on two
 * hundred products changed by a spreadsheet is a question somebody asks
 * months later ("where did this figure come from"), and the answer has to
 * name the file, the person and the line. `problems` is JSON rather than a
 * rows table because the refused lines are read as one list on one screen
 * and never queried; the newsletter's rows table exists for pagination over
 * thousands of bad addresses, which a catalogue of hundreds does not need.
 *
 * `file` is the spreadsheet's path on the **private** disk between the dry
 * run and the commit, cleared once it has been read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_product_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('filename');
            $table->string('file')->nullable();
            $table->json('mapping')->nullable();
            $table->string('status', 20)->default('pending');
            $table->json('counts')->nullable();
            $table->json('problems')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_product_imports');
    }
};
