<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            /*
             * The video id, not the URL the editor pasted.
             *
             * This value becomes an iframe src. Storing the raw URL would mean
             * trusting whatever was typed at render time, which is the same
             * mistake the contact page's map embed exists to avoid — an
             * unchecked src is somebody else's page rendered inside this
             * origin. An 11-character id cannot be anything else.
             */
            $table->string('youtube_id', 20)->nullable()->after('poster_path');
        });
    }

    public function down(): void
    {
        Schema::table('slides', function (Blueprint $table) {
            $table->dropColumn('youtube_id');
        });
    }
};
