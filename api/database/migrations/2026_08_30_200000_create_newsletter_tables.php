<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The newsletter module.
 *
 * Eleven tables rather than the twelve the specification lists: it names both
 * `newsletter_unsubscribes` and `newsletter_suppressions`, and unsubscribing is
 * one *reason* for suppression rather than a separate fact. Two tables holding
 * "this address must not be mailed" is two answers to one question, and they
 * disagree the first time somebody writes to one and not the other — the same
 * argument that removed the `state` column from `locations`.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * The audience.
         *
         * `email` is unique and stored **lower-cased** by the model. MySQL's
         * default collation here is already case-insensitive, so the unique
         * index alone would catch `John@Example.com` against
         * `john@example.com` — but relying on that makes correctness a
         * property of the collation, which is invisible, changeable, and not
         * true of every database this could ever run on. Normalising on write
         * makes it a property of the application.
         */
        Schema::create('newsletter_subscribers', function (Blueprint $table) {
            $table->id();

            /*
             * The portal account this came from, when it came from one.
             *
             * Nullable and `nullOnDelete`: most subscribers are imported from
             * a spreadsheet and have no account, and deleting a customer must
             * not silently delete a subscription they consented to. The name
             * and company are copied rather than joined for the same reason
             * `activity_log` copies the actor — a list that forgets who
             * somebody was once their account goes has failed at the point it
             * is read.
             */
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();

            $table->string('email')->unique();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('company')->nullable();
            $table->string('phone', 40)->nullable();

            $table->string('status', 20)->default('active');

            // Where this address came from — 'import', 'customer', 'manual',
            // 'signup'. Shown in the console, and the only way to answer "why
            // is this person on the list" months later.
            $table->string('source', 20)->default('manual');

            /*
             * The unsubscribe token, per subscriber rather than per send.
             *
             * A link in an email outlives the campaign that carried it —
             * people unsubscribe from a message they find six months later —
             * so a token scoped to one campaign would stop working exactly
             * when it is most needed. Random and unique; there is no lookup by
             * anything guessable.
             */
            $table->string('unsubscribe_token', 64)->unique();

            $table->timestamp('subscribed_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->unsignedInteger('bounce_count')->default(0);
            $table->timestamp('last_bounce_at')->nullable();
            $table->timestamps();

            // Every list view is "this status, newest first"; every send is
            // "active subscribers in these groups".
            $table->index(['status', 'created_at']);
        });

        Schema::create('newsletter_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description', 500)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('newsletter_group_subscriber', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_group_id')->constrained()->cascadeOnDelete();
            $table->foreignId('newsletter_subscriber_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            // One row per pairing, enforced by the database rather than by
            // remembering to check — a subscriber added to a group twice
            // becomes a recipient twice, which is a duplicate email.
            $table->unique(['newsletter_group_id', 'newsletter_subscriber_id'], 'newsletter_group_member_unique');
        });

        Schema::create('newsletter_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description', 300)->nullable();
            $table->string('category', 40)->default('general');
            // The blocks an editor arranges, and the HTML they render to. Both
            // are stored: the blocks are what the editor reads back, the HTML
            // is what would be sent if it were sent now.
            $table->json('blocks')->nullable();
            $table->longText('html')->nullable();
            $table->string('thumbnail_path')->nullable();
            // A seeded template is a starting point that must survive being
            // edited by somebody and re-seeded later.
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        Schema::create('newsletter_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_template_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('name');
            $table->string('subject');
            // The line a client shows after the subject. Its absence is one of
            // the things the health check flags, because the alternative is
            // that the client invents one from the first words of the body.
            $table->string('preheader', 200)->nullable();

            $table->string('from_name')->nullable();
            $table->string('from_email')->nullable();
            $table->string('reply_to')->nullable();

            $table->json('blocks')->nullable();
            $table->longText('html_content')->nullable();
            /*
             * The plain-text half, stored rather than derived at send time.
             *
             * Generated from the HTML but editable, and both go out as
             * multipart/alternative. A missing text part is one of the
             * strongest spam signals there is, and deriving it during the send
             * would mean the thing that was reviewed is not the thing that
             * went out.
             */
            $table->longText('text_content')->nullable();

            $table->string('status', 20)->default('draft');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            // Snapshotted when the campaign is queued, so a report is not
            // recomputed from a list that has moved on since.
            $table->unsignedInteger('recipient_count')->default(0);
            $table->unsignedSmallInteger('health_score')->nullable();
            $table->timestamp('test_sent_at')->nullable();

            $table->timestamps();
            $table->index(['status', 'scheduled_at']);
        });

        Schema::create('newsletter_campaign_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('newsletter_group_id')->constrained()->cascadeOnDelete();
            $table->unique(['newsletter_campaign_id', 'newsletter_group_id'], 'newsletter_campaign_group_unique');
        });

        /*
         * One row per person per campaign — the send list, frozen.
         *
         * Generated once when the campaign is queued rather than resolved as
         * each batch goes out: a subscriber who unsubscribes mid-send must not
         * shift the boundaries of a list being paged through, and a report has
         * to describe what was actually attempted.
         */
        Schema::create('newsletter_campaign_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('newsletter_subscriber_id')->constrained()->cascadeOnDelete();

            // Copied, because a report must still read correctly after the
            // subscriber is suppressed or their address is corrected.
            $table->string('email');

            $table->string('status', 20)->default('pending');

            /*
             * The token in this recipient's tracking pixel and links.
             *
             * Per (campaign, subscriber) rather than per subscriber: it
             * identifies *which* send was opened, and one token per person
             * would attribute every open to whichever campaign was looked at
             * last. Random, so nothing about it can be guessed or enumerated.
             */
            $table->string('token', 64)->unique();

            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('clicked_at')->nullable();
            $table->timestamp('bounced_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->string('failure_reason', 500)->nullable();
            $table->timestamps();

            // A subscriber appears once per campaign, enforced here as well as
            // in the generator: the generator dedupes across groups, and this
            // is what makes a bug there a failed insert rather than a person
            // receiving the same email twice.
            $table->unique(['newsletter_campaign_id', 'newsletter_subscriber_id'], 'newsletter_recipient_unique');
            // Named, because the generated name is 66 characters and MySQL
            // stops at 64 — a failure that only appears on a fresh database.
            $table->index(['newsletter_campaign_id', 'status'], 'newsletter_recipient_status_index');
        });

        // Every distinct URL in a campaign, so clicks can be counted per link
        // rather than only in total.
        Schema::create('newsletter_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_campaign_id')->constrained()->cascadeOnDelete();
            $table->string('url', 2048);
            $table->string('label')->nullable();
            $table->string('hash', 40);
            $table->unsignedInteger('total_clicks')->default(0);
            $table->unsignedInteger('unique_clicks')->default(0);
            $table->timestamps();

            // Hashed because the URL itself is too long to index, and two
            // identical links in one campaign are one link.
            $table->unique(['newsletter_campaign_id', 'hash'], 'newsletter_link_unique');
        });

        /*
         * The append-only record of what happened.
         *
         * The aggregates on the recipient and link rows are derived from
         * these, not the other way round — an "opened_at" that is overwritten
         * cannot answer "how many times", and a rate computed from a column
         * somebody can edit is a rate nobody can check.
         */
        Schema::create('newsletter_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('newsletter_subscriber_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('newsletter_link_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event_type', 20);
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 400)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['newsletter_campaign_id', 'event_type']);
            $table->index(['newsletter_subscriber_id', 'event_type']);
        });

        /*
         * Addresses that must never be mailed again, and the reason.
         *
         * Keyed on the **address**, not on a subscriber id, and deliberately
         * outliving the subscriber row: deleting somebody from the list and
         * re-importing them from a spreadsheet must not resurrect a
         * subscription they withdrew. That is the single most important rule
         * in this module — it is the one with legal weight — so it is a table
         * of its own rather than a status somebody can edit.
         */
        Schema::create('newsletter_suppressions', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('reason', 20);
            $table->string('note', 500)->nullable();
            $table->foreignId('newsletter_campaign_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        // An import is a record of what was attempted, kept so "where did
        // these 1,200 addresses come from" has an answer.
        Schema::create('newsletter_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('filename');
            $table->string('status', 20)->default('pending');
            $table->json('mapping')->nullable();
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('imported')->default(0);
            $table->unsignedInteger('updated')->default(0);
            $table->unsignedInteger('invalid')->default(0);
            $table->unsignedInteger('duplicates')->default(0);
            $table->unsignedInteger('suppressed')->default(0);
            $table->timestamps();
        });

        // The rows an import could not take, with the reason. Without this the
        // summary says "22 invalid" and nobody can find out which 22.
        Schema::create('newsletter_import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('newsletter_import_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('line_number');
            $table->string('email')->nullable();
            $table->string('outcome', 20);
            $table->string('reason', 300)->nullable();
            $table->timestamps();

            $table->index(['newsletter_import_id', 'outcome']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_import_rows');
        Schema::dropIfExists('newsletter_imports');
        Schema::dropIfExists('newsletter_suppressions');
        Schema::dropIfExists('newsletter_events');
        Schema::dropIfExists('newsletter_links');
        Schema::dropIfExists('newsletter_campaign_recipients');
        Schema::dropIfExists('newsletter_campaign_groups');
        Schema::dropIfExists('newsletter_campaigns');
        Schema::dropIfExists('newsletter_templates');
        Schema::dropIfExists('newsletter_group_subscriber');
        Schema::dropIfExists('newsletter_groups');
        Schema::dropIfExists('newsletter_subscribers');
    }
};
