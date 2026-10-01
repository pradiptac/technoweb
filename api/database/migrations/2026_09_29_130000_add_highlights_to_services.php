<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A service's highlights (2026-09-29): a few short words drawn as chips on
 * its card — ".com · .in · .co.in", "Google Workspace · Microsoft 365" —
 * which the static web-services grid carried as a `note` until the Services
 * section moved to the CMS. A JSON **list**, because MySQL reorders object
 * keys and the order is the editor's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->json('highlights')->nullable()->after('summary');
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('highlights');
        });
    }
};
