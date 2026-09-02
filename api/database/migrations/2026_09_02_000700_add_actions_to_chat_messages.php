<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the assistant offered, beside what it said.
 *
 * Stored rather than derived at render time, because the right offer depends on
 * whether the visitor was signed in — and that changes. A transcript read next
 * week should show the buttons that were actually there, not the ones somebody
 * would be given now. The same reason an order item snapshots what was sold and
 * the activity log snapshots its actor.
 *
 * A list, not a map: they are ordered, and the first is the primary one. MySQL
 * reorders JSON *object* keys, which is the bug `App\Casts\SpecSheet` exists
 * for; JSON arrays are order-preserving.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->json('actions')->nullable()->after('sources');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn('actions');
        });
    }
};
