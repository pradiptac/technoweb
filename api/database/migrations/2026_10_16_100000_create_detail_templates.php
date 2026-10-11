<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Detail-page templates (0.161.0, docs/page-builder.md "Detail templates"): how
 * every solution page, every service page… is arranged, laid out once in the
 * section builder and mixed with blocks that draw the record's own content.
 *
 * `type` is a morph alias (`solution`, `service`, `industry`, `case_study`,
 * `product`, `store_product`, `blog_post`); `blocks` is the builder's stored
 * shape. At most one row per type is `is_active` — enforced in the model's
 * `activate()` inside a transaction, since MySQL has no partial unique index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('detail_templates', function (Blueprint $table) {
            $table->id();
            $table->string('type', 32);
            $table->string('name', 120);
            $table->json('blocks');
            $table->boolean('is_active')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('detail_templates');
    }
};
