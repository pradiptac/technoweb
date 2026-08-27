<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Places become a tree, and services say where they are actually offered.
 *
 * Two changes that arrived together because they answer the same question from
 * opposite ends. A flat list of cities cannot say that Salt Lake is in Kolkata
 * or that Kolkata is in West Bengal, so a page about the state could only
 * repeat what the city pages said — and a service could only be connected to a
 * place by a generator guessing, which is precisely the guesswork that turns
 * this feature into a doorway-page mill.
 *
 * **`state` stops being a column.** It is derived from the nearest ancestor at
 * state level, because a string beside a `parent_id` is a second source of
 * truth for the same fact and the two disagree the first time a subtree moves.
 * Any existing value is converted into a real parent row below rather than
 * dropped — `locations` is empty in every environment this has reached, so that
 * loop is expected to do nothing, but a migration that would lose data if it
 * ever ran somewhere else is not one worth shipping.
 *
 * **The pivots are the point.** `location_service` and `location_solution` turn
 * "Network Installation in Kolkata" from something a generator infers into
 * something an editor stated. `LandingPageQuality` then has a real fact to
 * check instead of a heuristic, and a page for a pairing nobody ticked cannot
 * be published at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            /*
             * `restrictOnDelete`, not `nullOnDelete`.
             *
             * Orphaning a subtree is the failure this cannot afford: the
             * children would silently become roots, so Salt Lake would stop
             * being in Kolkata without anything reporting it, and every page
             * about it would quietly start describing a place with no region.
             * The controller refuses the delete with a sentence instead.
             */
            $table->foreignId('parent_id')->nullable()->after('id')
                ->constrained('locations')->restrictOnDelete();

            $table->string('level', 16)->default('city')->after('slug');
            $table->index(['parent_id', 'sort_order']);
        });

        // Turn any stored state string into a real parent row.
        if (Schema::hasColumn('locations', 'state')) {
            foreach (DB::table('locations')->whereNotNull('state')->get() as $row) {
                if (blank($row->state)) {
                    continue;
                }

                $slug = Str::slug($row->state);

                $parentId = DB::table('locations')->where('slug', $slug)->value('id')
                    ?? DB::table('locations')->insertGetId([
                        'name' => $row->state,
                        'slug' => $slug,
                        'level' => 'state',
                        'country' => $row->country ?? 'India',
                        'is_active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                DB::table('locations')->where('id', $row->id)
                    ->update(['parent_id' => $parentId, 'level' => 'city']);
            }

            Schema::table('locations', fn (Blueprint $table) => $table->dropColumn('state'));
        }

        /*
         * Where a service is offered, and where a solution is delivered.
         *
         * Two tables rather than one polymorphic one. A polymorphic pivot would
         * save a migration and cost the foreign keys, which are the whole
         * reason a deleted service cannot leave a landing page pointing at
         * nothing — and this project already enforces a morph map precisely
         * because polymorphic rows are the ones that rot quietly.
         */
        Schema::create('location_service', function (Blueprint $table) {
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->primary(['location_id', 'service_id']);
        });

        Schema::create('location_solution', function (Blueprint $table) {
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->foreignId('solution_id')->constrained()->cascadeOnDelete();
            $table->primary(['location_id', 'solution_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_solution');
        Schema::dropIfExists('location_service');

        Schema::table('locations', function (Blueprint $table) {
            $table->string('state')->nullable()->after('slug');
            $table->dropForeign(['parent_id']);
            $table->dropIndex(['parent_id', 'sort_order']);
            $table->dropColumn(['parent_id', 'level']);
        });
    }
};
