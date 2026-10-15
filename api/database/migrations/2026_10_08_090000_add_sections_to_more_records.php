<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Builder sections on the rest of the records with a written body (0.130.0,
 * docs/page-builder.md "Sections on other records"): blog posts, knowledge
 * articles, catalogue products, shop products, events, vacancies and custom
 * content entries.
 *
 * The same two columns the first four types gained in 0.129.0 — `blocks`,
 * the list a page stores, and `body_layout`, which of the two the public
 * page draws in its body area. `body` by default, which is every record as
 * it was; neither column is cleared by choosing the other.
 */
return new class extends Migration
{
    private const TABLES = [
        'blog_posts', 'knowledge_articles', 'products', 'store_products',
        'events', 'job_openings', 'entries',
    ];

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
