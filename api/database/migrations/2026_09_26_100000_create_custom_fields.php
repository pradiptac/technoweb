<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Custom fields: groups of editor-defined fields attached to existing content
 * types, and one value row per record per field. See docs/custom-content.md.
 *
 * `targets` is a JSON **list** of target keys (`page`, `solution`,
 * `entry:<type-slug>` …) rather than a pivot, because the targets are not
 * one table: nine of them are models and the rest are content types.
 *
 * A value is a JSON column because a field's kind decides its shape — a
 * string, a number, a list of option values, a media path. The row is unique
 * per (record, field), and it cascades with the field: deleting a field from
 * its group is deleting what was typed into it, which the console says
 * before it happens.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_field_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 150)->unique();
            $table->json('targets');
            // `details` is drawn as a "Details" section on the public page;
            // `hidden` is data in the API only.
            $table->string('placement', 20)->default('details');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('custom_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('custom_field_group_id')->constrained()->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('label', 150);
            $table->string('kind', 30);
            $table->string('help', 255)->nullable();
            $table->boolean('required')->default(false);
            $table->json('options')->nullable();
            $table->json('settings')->nullable();
            $table->boolean('show_on_page')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['custom_field_group_id', 'key']);
        });

        Schema::create('custom_field_values', function (Blueprint $table) {
            $table->id();
            $table->string('fieldable_type', 60);
            $table->unsignedBigInteger('fieldable_id');
            $table->foreignId('custom_field_id')->constrained()->cascadeOnDelete();
            $table->json('value')->nullable();
            $table->timestamps();

            $table->unique(['fieldable_type', 'fieldable_id', 'custom_field_id'], 'custom_field_values_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_field_values');
        Schema::dropIfExists('custom_fields');
        Schema::dropIfExists('custom_field_groups');
    }
};
