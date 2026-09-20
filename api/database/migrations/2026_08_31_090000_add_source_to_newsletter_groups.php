<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a group's membership comes from.
 *
 * `manual` is every group somebody curates by hand. `customers` is the one
 * standing group whose membership is a *derived* fact — the portal's own
 * customer list — and which is therefore kept in step rather than edited.
 *
 * A column rather than a magic slug, because the slug is editable and the
 * identity of this group must not be.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_groups', function (Blueprint $table) {
            $table->string('source', 20)->default('manual')->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_groups', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
