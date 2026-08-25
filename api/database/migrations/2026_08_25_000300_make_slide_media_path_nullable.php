<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A YouTube slide has no file of its own — only an id and, ideally, a
     * poster. The column was NOT NULL from when every slide was an upload.
     */
    public function up(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            $table->string('media_path')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            $table->string('media_path')->nullable(false)->change();
        });
    }
};
