<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ticket_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description')->nullable();
            $table->unsignedSmallInteger('default_sla_hours')->default(4);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        /*
         * NOTE ON STATUS AND PRIORITY
         * The brief lists `ticket_statuses` and `ticket_priorities` as possible
         * tables. They are implemented as PHP enums backed by string columns
         * instead, because both are fixed lifecycles that application logic
         * branches on — a database row cannot add a new state without code
         * changes anyway, and enums keep the transition rules in one place.
         * Say the word and they become lookup tables; nothing else changes.
         */
        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 20)->unique();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ticket_category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('subject');
            $table->longText('description');
            $table->string('status', 24)->default('open');
            $table->string('priority', 16)->default('normal');
            $table->timestamp('first_responded_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->timestamps();

            // The two queries the admin list actually runs.
            $table->index(['status', 'priority', 'created_at']);
            $table->index(['customer_id', 'status']);
        });

        Schema::create('ticket_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            // Polymorphic author: either a customer or a staff user.
            $table->morphs('author');
            $table->longText('body');
            // Internal notes are visible to staff only and must never be
            // serialised into a customer-facing response.
            $table->boolean('is_internal')->default(false);
            $table->timestamps();

            $table->index(['ticket_id', 'is_internal', 'created_at']);
        });

        Schema::create('ticket_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ticket_message_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->string('filename');
            $table->string('mime', 120);
            $table->unsignedBigInteger('size');
            $table->timestamps();
        });

        Schema::create('ticket_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 40);          // status_changed, assigned, priority_changed …
            $table->string('from_value')->nullable();
            $table->string('to_value')->nullable();
            $table->timestamps();

            $table->index(['ticket_id', 'created_at']);
        });

        Schema::create('knowledge_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('knowledge_articles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('knowledge_category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('excerpt', 500)->nullable();
            $table->longText('body')->nullable();
            $table->json('tags')->nullable();
            $table->string('status', 20)->default('draft');
            $table->unsignedInteger('view_count')->default(0);
            $table->unsignedInteger('helpful_count')->default(0);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'knowledge_category_id']);
        });

        Schema::create('enquiries', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('phone', 32)->nullable();
            $table->string('company')->nullable();
            $table->string('subject')->nullable();
            $table->text('message');
            $table->string('source', 60)->nullable();   // contact, product, solution …
            $table->nullableMorphs('enquirable');       // the product or solution enquired about
            $table->string('status', 20)->default('new');
            $table->ipAddress('ip_address')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enquiries');
        Schema::dropIfExists('knowledge_articles');
        Schema::dropIfExists('knowledge_categories');
        Schema::dropIfExists('ticket_events');
        Schema::dropIfExists('ticket_attachments');
        Schema::dropIfExists('ticket_messages');
        Schema::dropIfExists('tickets');
        Schema::dropIfExists('ticket_categories');
    }
};
