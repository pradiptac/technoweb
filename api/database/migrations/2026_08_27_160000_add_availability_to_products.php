<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a product can actually be had, for the `Offer` in its structured data.
 *
 * **Nullable with no default, deliberately.** The obvious move is to default
 * every row to `InStock` so the schema block looks complete — and that would be
 * a claim about stock this business has never made, written into machine-
 * readable markup that a search engine acts on. An absent key is the honest
 * answer for a catalogue that has never tracked stock; a wrong one is a lie
 * with a schema attached.
 *
 * The values are schema.org's own vocabulary rather than friendlier words,
 * because a translation table between "we can get it" and `BackOrder` is a
 * second place for the mapping to be wrong. The admin form does the explaining.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('availability', 32)->nullable()->after('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('availability'));
    }
};
