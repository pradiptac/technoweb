<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The one-off tasks an update has already run on this install
 * (`App\Support\Upgrade\UpgradeSteps`, docs/distribution.md). A release that
 * needs something done once — rebuild an index, move a value between
 * settings — ships a step class; the updater runs every step this table does
 * not name and records it here, so nothing runs twice and nothing depends on
 * somebody reading a line in a changelog. `step` is the class's own id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_upgrade_steps', function (Blueprint $table) {
            $table->id();
            $table->string('step', 120)->unique();
            $table->string('version', 32);
            $table->timestamp('ran_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_upgrade_steps');
    }
};
