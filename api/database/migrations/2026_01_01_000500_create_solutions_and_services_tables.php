<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('solutions', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('summary', 500)->nullable();
            $table->text('problem_statement')->nullable();
            $table->longText('overview')->nullable();
            $table->json('benefits')->nullable();
            $table->json('technologies')->nullable();
            $table->string('icon', 40)->nullable();
            $table->string('hero_image_path')->nullable();
            $table->string('status', 20)->default('draft');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('status');
        });

        // Web services: domains, hosting, business email, SSL, VPS, website work.
        // A catalogue only — no provisioning, billing or renewal management.
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('summary', 500)->nullable();
            $table->longText('body')->nullable();
            $table->string('icon', 40)->nullable();
            $table->string('status', 20)->default('draft');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('product_solution', function (Blueprint $table) {
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('solution_id')->constrained()->cascadeOnDelete();
            $table->primary(['product_id', 'solution_id']);
        });

        Schema::create('industries', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('summary', 500)->nullable();
            $table->longText('body')->nullable();
            $table->string('icon', 40)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('industry_solution', function (Blueprint $table) {
            $table->foreignId('industry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('solution_id')->constrained()->cascadeOnDelete();
            $table->primary(['industry_id', 'solution_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('industry_solution');
        Schema::dropIfExists('industries');
        Schema::dropIfExists('product_solution');
        Schema::dropIfExists('services');
        Schema::dropIfExists('solutions');
    }
};
