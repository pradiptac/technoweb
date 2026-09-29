<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Where a subscriber came from, in the terms a campaign is sent by
 * (2026-09-27, docs/newsletter.md "Crawling a website"): the industry and
 * place a website crawl was run for, the business's website, and the page
 * the address was found on. Nullable — a signup, a customer or a CSV row
 * has none of them — and filled blanks-only by `SubscriberIntake`, like
 * every other field. `industry` is indexed because the list filters on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('newsletter_subscribers', function (Blueprint $table) {
            $table->string('industry', 80)->nullable()->index()->after('phone');
            $table->string('location', 80)->nullable()->after('industry');
            $table->string('website', 255)->nullable()->after('location');
            $table->string('source_url', 500)->nullable()->after('website');
        });
    }

    public function down(): void
    {
        Schema::table('newsletter_subscribers', function (Blueprint $table) {
            $table->dropIndex(['industry']);
            $table->dropColumn(['industry', 'location', 'website', 'source_url']);
        });
    }
};
