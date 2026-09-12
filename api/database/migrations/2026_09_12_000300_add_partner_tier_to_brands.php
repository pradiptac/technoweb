<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * A vendor partnership is a fact about a brand the catalogue already holds,
 * with a real sanitised logo behind it. A second "partner badge" table would
 * store the same 26 logos twice and drift the first time one was replaced —
 * so a partnership is one nullable column here ("Gold Partner"), and
 * `GET /brands?partners=1` lists the brands that carry one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('brands', function (Blueprint $table) {
            $table->string('partner_tier', 80)->nullable()->after('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('brands', function (Blueprint $table) {
            $table->dropColumn('partner_tier');
        });
    }
};
