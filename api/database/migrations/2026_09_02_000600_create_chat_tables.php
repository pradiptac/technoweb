<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The website assistant's conversations.
 *
 * Three tables and no fourth: the specification suggests a `chat_settings`
 * table, and this application already has a `settings` table with groups, an
 * admin screen that builds its own form from it, and encryption for the rows
 * that need it. A second settings mechanism for one module would be a second
 * place to look. The chatbot's settings are a `chatbot` group.
 *
 * The same argument settles leads: there is one lead pipeline here already —
 * `LeadIntake`, `LeadScore` and `/admin/leads` — and a `chat_leads` table
 * beside it would be two answers to "who asked us to call them", one click
 * apart. A chatbot lead is a lead with a channel.
 *
 * ## A conversation is addressed by a token, never by its id
 *
 * `session_token` is 64 hex characters from `random_bytes`, the same as an
 * order's `access_token` and a basket's token — and for the same reason. These
 * endpoints are public by necessity: a visitor has no account, so the token is
 * the only thing standing between a stranger and somebody else's conversation,
 * which may hold a name, a phone number and a description of their network. A
 * sequential id addressed publicly is an invitation to count.
 *
 * ## Retention is real, not aspirational
 *
 * A transcript is personal data — the specification says to keep the minimum
 * and not to retain it indefinitely, and that is only true if something
 * deletes it. `chat_retention_days` prunes on the schedule beside the activity
 * log and the CV prune, and rows go one at a time so model events fire.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_conversations', function (Blueprint $table) {
            $table->id();

            // 64 hex characters. Unique so a collision is a database error
            // rather than two visitors sharing a transcript.
            $table->string('session_token', 64)->unique();

            /*
             * Set when a signed-in customer is chatting, and it grants the
             * assistant **nothing**: the specification is explicit that private
             * account information is never volunteered, and that is enforced by
             * the retrieval layer having no access to it rather than by asking
             * the model nicely. What it is for is the trail, and directing
             * somebody to their own portal rather than to a login screen.
             */
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();

            $table->string('status', 20)->default('open');

            /*
             * Where the conversation started, posted by the browser the way
             * every form here does it — `Referer` is the Next server for
             * anything that goes through a Server Action, so a column filled
             * from it would record one plausible value for the whole site.
             * `App\Support\Crm\PageContext` already reads this envelope.
             */
            $table->string('source_url', 512)->nullable();
            $table->string('source_path', 255)->nullable();
            $table->string('source_title', 255)->nullable();

            // Counted rather than derived: the cap on conversation length is
            // checked on every message, and `count(*)` on a growing table to
            // decide whether to answer is the wrong shape.
            $table->unsignedSmallInteger('message_count')->default(0);
            $table->unsignedInteger('tokens_used')->default(0);

            $table->string('ip', 45)->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index('created_at');
            $table->index(['status', 'last_message_at']);
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_conversation_id')->constrained()->cascadeOnDelete();

            // user | assistant | system. A system message is never returned to
            // a browser — see `ChatMessageResource`.
            $table->string('role', 12);
            $table->text('content');

            $table->string('intent', 32)->nullable();

            /*
             * Whether the answer stood on something retrieved.
             *
             * The difference between "we told them what our website says" and
             * "the model said something plausible" is the difference this whole
             * module lives or dies by, so it is recorded per message rather
             * than inferred later from the text.
             */
            $table->boolean('grounded')->default(false);
            $table->json('sources')->nullable();

            $table->unsignedInteger('tokens')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['chat_conversation_id', 'id']);
        });

        /*
         * Anything worth counting later that is not a message: opened, quick
         * action pressed, lead offered, lead captured, feedback. Kept from the
         * start because retro-fitting analytics means having no history on the
         * day somebody asks for it.
         */
        Schema::create('chat_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_conversation_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('type', 40);
            $table->json('context')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_events');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_conversations');
    }
};
