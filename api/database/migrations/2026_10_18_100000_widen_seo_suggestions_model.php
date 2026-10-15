<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A typed OpenRouter model id may be up to 100 characters (0.165.0).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('seo_suggestions', function (Blueprint $table) {
            $table->string('model', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('seo_suggestions', function (Blueprint $table) {
            $table->string('model', 64)->nullable()->change();
        });
    }
};
