<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a merged ticket's conversation went. Set once by the merge, on the
 * source only; the target has no column of its own because the note and
 * the `merged_from` event on it already say what arrived. `nullOnDelete`
 * so deleting the target — nothing in the product does, today — leaves
 * the source a plain closed ticket rather than a dangling one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->foreignId('merged_into_id')->nullable()->after('assigned_to')
                ->constrained('tickets')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('merged_into_id');
        });
    }
};
