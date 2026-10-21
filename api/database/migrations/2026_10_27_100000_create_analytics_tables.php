<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_hits', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->dateTime('at');
            $table->string('kind', 24);
            $table->string('path', 255)->nullable();
            $table->binary('visitor', 16)->nullable();
            $table->boolean('entry')->default(false);
            $table->string('channel', 16)->nullable();
            $table->string('source', 100)->nullable();
            $table->string('medium', 100)->nullable();
            $table->string('campaign', 100)->nullable();
            $table->string('referrer_host', 120)->nullable();
            $table->string('device', 8)->nullable();
            $table->string('browser', 24)->nullable();
            $table->string('os', 16)->nullable();
            $table->char('country', 2)->nullable();
            $table->string('target', 255)->nullable();
            $table->unsignedInteger('results')->nullable();
            $table->unsignedBigInteger('value_paise')->nullable();
            $table->index('day');
            $table->index(['day', 'kind']);
            $table->index(['day', 'visitor']);
            $table->index(['day', 'path']);
        });

        Schema::create('analytics_daily', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('dimension', 16);
            $table->string('key', 255)->default('');
            $table->string('kind', 24);
            $table->unsignedInteger('views')->default(0);
            $table->unsignedInteger('visitors')->default(0);
            $table->unsignedInteger('entries')->default(0);
            $table->unsignedInteger('bounces')->default(0);
            $table->unsignedBigInteger('value_paise')->default(0);
            $table->unique(['day', 'dimension', 'kind', 'key'], 'analytics_daily_unique');
            $table->index(['dimension', 'kind', 'day']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_daily');
        Schema::dropIfExists('analytics_hits');
    }
};
