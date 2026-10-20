<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content-type presets (0.186.0, docs/content-presets.md). Additive: a type
 * may say which preset it was installed from and whether its entries have
 * pages of their own; a field may be locked because a preset's layout reads
 * it; an investors entry remembers its email alert.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('content_types', function (Blueprint $table) {
            $table->string('preset', 40)->nullable()->unique()->after('slug');
            $table->boolean('entry_pages')->default(true)->after('archive_enabled');
        });

        Schema::table('custom_fields', function (Blueprint $table) {
            $table->boolean('locked')->default(false)->after('show_on_page');
        });

        Schema::table('entries', function (Blueprint $table) {
            $table->boolean('alert_on_publish')->default(false)->after('sort_order');
            $table->timestamp('alert_sent_at')->nullable()->after('alert_on_publish');
            $table->text('alert_error')->nullable()->after('alert_sent_at');
            $table->unsignedBigInteger('alert_campaign_id')->nullable()->after('alert_error');
        });
    }

    public function down(): void
    {
        Schema::table('entries', fn (Blueprint $t) => $t->dropColumn(['alert_on_publish', 'alert_sent_at', 'alert_error', 'alert_campaign_id']));
        Schema::table('custom_fields', fn (Blueprint $t) => $t->dropColumn('locked'));
        Schema::table('content_types', function (Blueprint $t) {
            $t->dropUnique(['preset']);
            $t->dropColumn(['preset', 'entry_pages']);
        });
    }
};
