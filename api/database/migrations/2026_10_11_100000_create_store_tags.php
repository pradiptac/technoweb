<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop tags (0.141.0, `docs/store.md` "Tags").
 *
 * `store_tags` is the vocabulary and `store_product_tag` the pairing. A tag's
 * `slug` is unique because it is how two spellings become one tag ("Wi-Fi 6"
 * and "wifi 6" are one slug); `name` keeps the first spelling that was seen.
 * `is_visible` is the Tags screen's Shown switch: a hidden tag still tags its
 * products, it is only left out of the row on the shop front.
 *
 * `store_products.tags_set_at` is what makes the automatic rule run **once**:
 * stamped the first time tags are decided for a product, by a person or by the
 * rule, so a product somebody cleared is never tagged again behind their back.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_tags', function (Blueprint $table) {
            $table->id();
            $table->string('name', 32);
            $table->string('slug', 64)->unique();
            $table->boolean('is_visible')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('store_product_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->foreignId('store_tag_id')->constrained('store_tags')->cascadeOnDelete();

            $table->unique(['store_product_id', 'store_tag_id']);
            $table->index('store_tag_id');
        });

        Schema::table('store_products', function (Blueprint $table) {
            $table->timestamp('tags_set_at')->nullable();
            // True while the tags are the automatic ones, untouched — what the
            // form's "Added automatically" line is drawn from.
            $table->boolean('tags_auto')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn(['tags_set_at', 'tags_auto']);
        });

        Schema::dropIfExists('store_product_tag');
        Schema::dropIfExists('store_tags');
    }
};
