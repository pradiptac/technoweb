<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Messaging channels — WhatsApp, RCS and browser push (Phase 2, stream B).
 *
 * Five tables. `message_templates` is what is said on a channel;
 * `message_automations` maps an event to one; `message_contacts` is who
 * agreed to be told, per channel and address; `message_broadcasts` is a
 * one-off send to an audience; `message_deliveries` is every message
 * attempted, from either source, with the status the provider reports.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 20);
            // A slug for the console and the automations table; unique per
            // channel, because WhatsApp and push may both have `order_paid`.
            $table->string('key', 80);
            $table->string('name', 160);
            // Plain text with `{{placeholders}}`, filled by
            // `Placeholders::fillText` — no HTML anywhere on these channels.
            $table->text('body');
            $table->string('header_text', 60)->nullable();
            // A media-library path: the WhatsApp header image, the RCS rich
            // card's picture, the push notification's image.
            $table->string('media_path', 500)->nullable();
            // A JSON **list** of {type, text, value} — the order is the order
            // the buttons are drawn in, which a JSON object would not keep.
            $table->json('buttons')->nullable();
            $table->string('push_title', 120)->nullable();
            $table->string('push_link', 500)->nullable();
            // WhatsApp's own template fields, and what its provider said.
            $table->string('category', 20)->nullable();
            $table->string('language', 12)->default('en');
            $table->string('provider_template_name', 160)->nullable();
            $table->string('provider_template_id', 160)->nullable();
            $table->string('approval_status', 20)->default('not_required');
            $table->string('approval_reason', 500)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique(['channel', 'key']);
        });

        Schema::create('message_automations', function (Blueprint $table) {
            $table->id();
            $table->string('event', 40);
            $table->string('channel', 20);
            $table->foreignId('message_template_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_enabled')->default(false);
            $table->timestamps();

            $table->unique(['event', 'channel']);
        });

        Schema::create('message_contacts', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 20);
            // E.164 for WhatsApp and RCS, an FCM registration token for push.
            // 500 because a token runs to ~160 characters and has grown
            // before; the composite unique stays under InnoDB's 3072 bytes.
            $table->string('address', 500);
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 160)->nullable();
            $table->string('source', 40)->nullable();
            $table->timestamp('opted_in_at')->nullable();
            $table->timestamp('opted_out_at')->nullable();
            $table->string('opt_out_reason', 60)->nullable();
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();

            $table->unique(['channel', 'address']);
            $table->index(['customer_id', 'channel']);
            $table->index(['channel', 'opted_out_at']);
        });

        Schema::create('message_broadcasts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            $table->string('channel', 20);
            $table->foreignId('message_template_id')->nullable()->constrained()->nullOnDelete();
            $table->string('audience', 30)->default('opt_ins');
            $table->foreignId('newsletter_group_id')->nullable()->constrained()->nullOnDelete();
            // Not a foreign key: the wishlist reads C's `wishlist_items`,
            // whose products are store products, and a deleted product
            // should leave a sent broadcast's history alone.
            $table->unsignedBigInteger('store_product_id')->nullable();
            $table->string('status', 20)->default('draft');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedInteger('recipient_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'scheduled_at']);
        });

        Schema::create('message_deliveries', function (Blueprint $table) {
            $table->id();
            $table->string('channel', 20);
            $table->string('provider', 30)->nullable();
            $table->string('event', 40)->nullable();
            $table->foreignId('message_broadcast_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('message_template_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('message_contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('address', 500);
            $table->json('vars')->nullable();
            $table->string('status', 20)->default('pending');
            $table->string('provider_message_id', 190)->nullable()->index();
            $table->string('error', 500)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['message_broadcast_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_deliveries');
        Schema::dropIfExists('message_broadcasts');
        Schema::dropIfExists('message_contacts');
        Schema::dropIfExists('message_automations');
        Schema::dropIfExists('message_templates');
    }
};
