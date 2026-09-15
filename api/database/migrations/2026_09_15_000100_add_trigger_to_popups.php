<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What opens a popup: the delay it always had, or the pointer leaving the
 * page (exit intent). A string holding `App\Enums\PopupTrigger`, defaulting
 * to `delay` so every existing popup keeps opening exactly as it did on the
 * deploy that runs this.
 *
 * `trigger` is a MySQL reserved word. The schema builder, the query builder
 * and Eloquent quote every identifier, so nothing in the application notices;
 * a raw `DB::select` naming the column must backtick it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('popups', function (Blueprint $table) {
            $table->string('trigger', 16)->default('delay')->after('frequency');
        });
    }

    public function down(): void
    {
        Schema::table('popups', function (Blueprint $table) {
            $table->dropColumn('trigger');
        });
    }
};
