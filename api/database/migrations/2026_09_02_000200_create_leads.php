<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The lead pipeline.
 *
 * ### Why a third table rather than columns on `enquiries`
 *
 * Two intakes already exist and both have to keep working: `enquiries`, which
 * is the contact and product forms with fixed columns, and `form_submissions`,
 * which is whatever an editor built and is a bag of JSON keyed by field names
 * they chose. Neither can absorb the other. An editor-built form need not ask
 * for an email address at all, and `enquiries.email` is `NOT NULL`; the
 * enquiry's `enquirable` morph is meaningless for a form submission.
 *
 * So a lead **snapshots** the contact and points back at whichever row it came
 * from. Same split as an order item against a product: the submission is the
 * immutable record of what somebody actually sent, and the lead is the
 * workable one that gains a status, an owner and a follow-up date. Neither is
 * a cache of the other, and the snapshot cannot drift because nothing in the
 * product ever edits a submission.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();

            /*
             * The submission this came from — an enquiry or a form submission.
             *
             * Nullable because the row it points at may be deleted while the
             * lead is still being worked: losing the evidence must not lose the
             * pipeline record and everything written on it.
             */
            $table->nullableMorphs('source');

            /**
             * Which intake wrote it: `enquiry` or `form`. Stored rather than
             * derived from `source_type`, because that goes null above.
             */
            $table->string('channel', 20)->default('enquiry')->index();

            /** What they filled in, for a person reading the list. */
            $table->string('form_name')->nullable();

            /*
             * The contact, snapshotted.
             *
             * `email` is nullable and that is not an oversight — an
             * editor-built form is whatever somebody built, and one asking only
             * for a phone number is a legitimate thing to publish. A lead with
             * no address is workable; a lead we refused to record is not.
             */
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('company')->nullable();
            $table->string('subject')->nullable();
            $table->text('message')->nullable();

            /*
             * Where the form was, which is the question a marketing budget is
             * decided on and which nothing recorded until now.
             *
             * Captured in the **browser** and posted explicitly. It cannot be
             * read from the request: every submission arrives through a Next.js
             * Server Action, so `Referer` on this side is the Next server, and
             * a column filled from it would record one value for the whole site
             * while looking perfectly plausible.
             */
            $table->string('source_url', 2048)->nullable();
            $table->string('source_path')->nullable()->index();
            $table->string('source_title')->nullable();
            /** The page *before* ours — a search engine, a campaign, a partner site. */
            $table->string('referrer', 2048)->nullable();
            $table->string('utm_source')->nullable()->index();
            $table->string('utm_medium')->nullable();
            $table->string('utm_campaign')->nullable()->index();

            /* The pipeline. */
            $table->string('status', 20)->default('new');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('follow_up_at')->nullable();
            /** Estimated value, in paise, like every other amount here. */
            $table->unsignedBigInteger('value_paise')->nullable();
            /*
             * Stamped on arrival at a state and never cleared except by a move
             * back into the pipeline — the rule `resolved_at` had to be taught
             * on tickets, where closing a ticket erased when it was resolved
             * and every throughput figure read that column.
             */
            $table->timestamp('contacted_at')->nullable();
            $table->timestamp('closed_at')->nullable();

            /*
             * The score as it arrived, and the reasons that produced it.
             *
             * Stored rather than computed on read, because a list of thousands
             * has to sort and filter on it and no expression over seven checks
             * does that. The reasons are stored beside it for the same reason a
             * figure without its working is not worth showing: the number is
             * always explainable from its own row, even after the rubric moves.
             * It is the score at intake and it is not rewritten.
             */
            $table->unsignedTinyInteger('score')->default(0)->index();
            $table->string('score_band', 10)->default('cold');
            $table->json('score_reasons')->nullable();

            $table->ipAddress('ip_address')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('email');
            $table->index('follow_up_at');
        });

        Schema::create('lead_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            /*
             * Copied, not joined — the rule the activity log follows. A trail
             * that forgets who did something the moment they leave the company
             * has failed at exactly the point it is being read.
             */
            $table->string('actor_name')->nullable();
            /** note | status | assigned | system */
            $table->string('kind', 20)->default('note');
            $table->text('body')->nullable();
            $table->json('context')->nullable();
            $table->timestamps();

            $table->index(['lead_id', 'created_at']);
        });

        $this->backfill();
    }

    /**
     * Everything already received becomes a lead.
     *
     * Without this the console opens on "No leads yet" beside a database
     * holding enquiries, which reads as the feature being broken rather than
     * as it being new. Deliberately plain SQL: the scoring rubric belongs to
     * the application and a migration that imported it would pin this file to
     * a class that is free to change underneath it. Historic rows get a score
     * of zero and no reasons, which is honest — they were never scored — and
     * the console renders that as "not scored" rather than as cold.
     */
    private function backfill(): void
    {
        DB::table('enquiries')->orderBy('id')->chunk(200, function ($rows) {
            $now = now();

            DB::table('leads')->insert($rows->map(fn ($e) => [
                'source_type' => 'enquiry',
                'source_id' => $e->id,
                'channel' => 'enquiry',
                'form_name' => 'Enquiry form',
                'name' => $e->name,
                'email' => $e->email,
                'phone' => $e->phone,
                'company' => $e->company,
                'subject' => $e->subject,
                'message' => $e->message,
                // `enquiries.source` is a short word for the kind of page —
                // "contact", "product" — not a URL, so it cannot fill
                // `source_path` and is not pretended into one.
                'source_title' => $e->source ? ucfirst($e->source).' page' : null,
                'status' => 'new',
                'score' => 0,
                'score_band' => 'cold',
                'score_reasons' => null,
                'ip_address' => $e->ip_address,
                'created_at' => $e->created_at ?? $now,
                'updated_at' => $e->updated_at ?? $now,
            ])->all());
        });

        DB::table('form_submissions')->orderBy('id')->chunk(200, function ($rows) {
            $now = now();

            DB::table('leads')->insert($rows->map(function ($s) use ($now) {
                $data = json_decode($s->data ?? '{}', true) ?: [];

                return [
                    'source_type' => 'form_submission',
                    'source_id' => $s->id,
                    'channel' => 'form',
                    'form_name' => $s->form_slug,
                    // Best effort over keys an editor is likely to have used.
                    // A form that named its fields otherwise yields a lead with
                    // no contact on it, which is what the linked submission is
                    // there to answer.
                    'name' => $data['name'] ?? $data['full_name'] ?? null,
                    'email' => $data['email'] ?? null,
                    'phone' => $data['phone'] ?? $data['mobile'] ?? null,
                    'company' => $data['company'] ?? null,
                    'subject' => $data['subject'] ?? null,
                    'message' => $data['message'] ?? $data['enquiry'] ?? null,
                    'status' => 'new',
                    'score' => 0,
                    'score_band' => 'cold',
                    'score_reasons' => null,
                    'ip_address' => $s->ip_address,
                    'created_at' => $s->created_at ?? $now,
                    'updated_at' => $s->updated_at ?? $now,
                ];
            })->all());
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_notes');
        Schema::dropIfExists('leads');
    }
};
