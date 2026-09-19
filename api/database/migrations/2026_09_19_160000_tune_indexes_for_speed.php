<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for the queries that grow with the business, and the removal of
 * the ones that were paying for nothing.
 *
 * Found by reading every query against the index dump (2026-09-19), not by
 * measuring — the development tables hold ten rows each, so EXPLAIN says
 * "ALL" about everything and proves nothing. Each addition names the query
 * it serves; each removal is an index that is a strict left prefix of
 * another on the same table, which MySQL can already use for the same
 * lookups, so the shorter one costs a write per insert and buys no read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            // The dashboard's 30-day series, the volume trend and the
            // sidebar's once-a-minute "new since" poll all range on
            // created_at alone; (status, priority, created_at) cannot serve
            // a range whose leading columns are unconstrained.
            $table->index('created_at');
            // The resolved-per-day half of the same series.
            $table->index('resolved_at');
            // `?overdue=1` and the dashboard's overdue count: due_at < now().
            $table->index('due_at');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->index('created_at'); // the "new since" poll
        });

        Schema::table('enquiries', function (Blueprint $table) {
            $table->index('created_at'); // the "new since" poll
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            // The chat dashboard ranges on created_at for its window and for
            // "today"; the table grows by two rows per exchange.
            $table->index('created_at');
        });

        Schema::table('payments', function (Blueprint $table) {
            // The webhook's fallback lookup when a gateway names its own
            // order id and not ours.
            $table->index('gateway_order_id');
        });

        Schema::table('newsletter_events', function (Blueprint $table) {
            // The campaign report's hourly opens/clicks series reads
            // (campaign, event_type, created_at) and nothing else, so the
            // widened index answers it without touching a row. The old
            // two-column index is its prefix; the FK on the campaign column
            // is satisfied by the new one, which is why it is added first.
            $table->index(
                ['newsletter_campaign_id', 'event_type', 'created_at'],
                'newsletter_events_campaign_type_created_index',
            );
            $table->dropIndex('newsletter_events_newsletter_campaign_id_event_type_index');
        });

        Schema::table('media', function (Blueprint $table) {
            // Every library listing is `deleted_at IS NULL ORDER BY
            // created_at DESC, id DESC`; the composite lets the order come
            // off the index. (deleted_at) alone is its prefix.
            $table->index(['deleted_at', 'created_at']);
            $table->dropIndex('media_deleted_at_index');
        });

        // Strict prefixes of a composite on the same table.
        Schema::table('seo_suggestions', fn (Blueprint $t) => $t->dropIndex('seo_suggestions_seoable_type_seoable_id_index'));
        Schema::table('certifications', fn (Blueprint $t) => $t->dropIndex('certifications_status_index'));
        Schema::table('clients', fn (Blueprint $t) => $t->dropIndex('clients_status_index'));
        Schema::table('team_members', fn (Blueprint $t) => $t->dropIndex('team_members_status_index'));
        Schema::table('popups', fn (Blueprint $t) => $t->dropIndex('popups_status_index'));
    }

    public function down(): void
    {
        Schema::table('popups', fn (Blueprint $t) => $t->index('status'));
        Schema::table('team_members', fn (Blueprint $t) => $t->index('status'));
        Schema::table('clients', fn (Blueprint $t) => $t->index('status'));
        Schema::table('certifications', fn (Blueprint $t) => $t->index('status'));
        Schema::table('seo_suggestions', fn (Blueprint $t) => $t->index(['seoable_type', 'seoable_id']));

        Schema::table('media', function (Blueprint $table) {
            $table->index('deleted_at');
            $table->dropIndex(['deleted_at', 'created_at']);
        });

        Schema::table('newsletter_events', function (Blueprint $table) {
            $table->index(['newsletter_campaign_id', 'event_type']);
            $table->dropIndex('newsletter_events_campaign_type_created_index');
        });

        Schema::table('payments', fn (Blueprint $t) => $t->dropIndex(['gateway_order_id']));
        Schema::table('chat_messages', fn (Blueprint $t) => $t->dropIndex(['created_at']));
        Schema::table('enquiries', fn (Blueprint $t) => $t->dropIndex(['created_at']));
        Schema::table('leads', fn (Blueprint $t) => $t->dropIndex(['created_at']));

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['resolved_at']);
            $table->dropIndex(['due_at']);
        });
    }
};
