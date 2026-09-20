<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved replies for the support desk: a title the picker lists, a plain-text
 * body with `{{placeholders}}`, and an order. Shared across the desk — one
 * table, no per-user column — because a reply worth saving is one the whole
 * desk gives, and a private list is how three engineers end up with three
 * wordings of one answer. `created_by` is who wrote it, kept when they leave.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('canned_replies', function (Blueprint $table) {
            $table->id();
            $table->string('title', 160);
            $table->text('body');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['sort_order', 'title']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('canned_replies');
    }
};
