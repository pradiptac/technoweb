<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('galleries', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // The shortcode addresses a gallery by slug — [gallery slug="work"]
            // — so this is a contract even though a gallery has no URL of its
            // own. Renaming one breaks every body that embeds it, exactly as
            // it does for a slider.
            $table->string('slug')->unique();
            // Shown above the tabs, as a paragraph. Never a heading: a gallery
            // is embedded at an arbitrary depth in somebody else's body, and a
            // component that injects an <h2> into an unknown outline is how a
            // heading-level jump reaches every page that embeds it.
            $table->string('subtitle', 300)->nullable();
            $table->string('status')->default('published')->index();
            // The lightbox's slideshow. Manual is always available; this only
            // decides whether it also advances by itself, and it is off by
            // default because a viewer who has opened one picture has said
            // which picture they want to look at.
            $table->boolean('autoplay')->default(false);
            // Milliseconds. A column with a value rather than a nullable one,
            // so there is one place to look for the number.
            $table->unsignedSmallInteger('interval_ms')->default(5000);
            $table->timestamps();
        });

        /*
         * The tabs.
         *
         * A table rather than a `group` string on the item, for the reason the
         * job qualifications are a lookup table: it is a value the client adds
         * to and renames. A string column means renaming "Networking" to
         * "Network" is an edit to every row that carries it, and the order of
         * the tabs is either alphabetical or accidental — where it is actually
         * a decision somebody takes.
         *
         * Scoped to one gallery rather than shared. Two galleries about
         * different subjects have nothing to say to each other's tab strips,
         * and a global list would grow into a picker nobody can find anything
         * in.
         */
        Schema::create('gallery_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_id')->constrained()->cascadeOnDelete();
            $table->string('name', 150);
            // Unique per gallery, because it is what an item names its group by
            // in a payload — see the request. Ids cannot do that job: the
            // console creates a tab and its items in the same submit, so the
            // id does not exist yet at the moment the item has to reference it.
            $table->string('slug', 150);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['gallery_id', 'slug']);
            $table->index(['gallery_id', 'sort_order']);
        });

        Schema::create('gallery_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gallery_id')->constrained()->cascadeOnDelete();
            // nullOnDelete rather than cascade: deleting a tab must not delete
            // the photographs filed under it. They fall back to "All", which is
            // the same call `media.folder_id` makes for the same reason — the
            // label is cheap and the files are not.
            $table->foreignId('gallery_group_id')->nullable()->constrained()->nullOnDelete();
            $table->string('media_path');
            $table->string('alt_text')->nullable();
            $table->string('title', 200)->nullable();
            // The subtitle. Longer than the title because it is the line that
            // says what is being looked at, and it is the caption the lightbox
            // renders under the picture.
            $table->string('subtitle', 500)->nullable();
            $table->string('link_url')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['gallery_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_items');
        Schema::dropIfExists('gallery_groups');
        Schema::dropIfExists('galleries');
    }
};
