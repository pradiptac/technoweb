<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Builder sections on records other than pages (0.129.0,
 * docs/page-builder.md "Sections on other records").
 *
 * `blocks` is the same list a page stores, validated by the same rules.
 * `body_layout` says which of the two the public page draws in its body
 * area — the written body, or the sections — so switching back loses
 * nothing: neither column is cleared by choosing the other. It defaults to
 * `body`, which is every record as it was.
 */
return new class extends Migration
{
    private const TABLES = ['solutions', 'services', 'industries', 'case_studies'];

    public function up(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->string('body_layout', 16)->default('body');
                $table->json('blocks')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropColumn(['body_layout', 'blocks']);
            });
        }
    }
};
