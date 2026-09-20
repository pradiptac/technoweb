<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A customer's verdict on a staff reply: one to five stars, and a report
 * with a reason. Columns on the message rather than tables of their own —
 * a ticket has one customer, so a reply can carry at most one of each, and
 * a join for a nullable tinyint is a query on every thread for nothing.
 * `rated_at`/`reported_at` are the timestamps the console shows; the
 * rating may be changed, the report may be re-worded, neither is ever
 * cleared by the customer (a report withdrawn is a report the desk still
 * wants to have seen).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ticket_messages', function (Blueprint $table) {
            $table->unsignedTinyInteger('rating')->nullable()->after('is_internal');
            $table->timestamp('rated_at')->nullable()->after('rating');
            $table->text('report_reason')->nullable()->after('rated_at');
            $table->timestamp('reported_at')->nullable()->after('report_reason');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_messages', function (Blueprint $table) {
            $table->dropColumn(['rating', 'rated_at', 'report_reason', 'reported_at']);
        });
    }
};
