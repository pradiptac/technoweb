<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The same switch a reply carries, on the ticket itself: the opening
 * description is a column on `tickets`, not a message row, so "encrypt its
 * contents" on the new-ticket form needs its own flag and its own sealed
 * column (`Ticket::description`, through `SealsSensitiveText`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->boolean('is_sensitive')->default(false)->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('is_sensitive');
        });
    }
};
