<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_posts', function (Blueprint $table) {
            $table->id();
            $table->string('network', 16);
            $table->string('status', 20)->index();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->text('text');
            $table->string('url', 2048);
            $table->string('source', 10); // publish | manual
            $table->boolean('ai_pending')->default(false);
            $table->foreignId('drafted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->string('remote_id', 255)->nullable();
            $table->string('remote_url', 2048)->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_posts');
    }
};
