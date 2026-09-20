<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('galleries', function (Blueprint $table) {
            // How one picture gives way to the next in the lightbox. A column
            // with a value rather than a nullable one, so there is one place to
            // look for the answer — the same call `interval_ms` makes.
            //
            // Defaulted to `fade` rather than `none`, and that is the point of
            // the change: every gallery that already exists gets the transition
            // on the migration that adds the column, instead of every editor
            // having to go and turn it on.
            $table->string('transition', 20)->default('fade')->after('interval_ms');
        });
    }

    public function down(): void
    {
        Schema::table('galleries', function (Blueprint $table) {
            $table->dropColumn('transition');
        });
    }
};
