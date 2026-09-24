<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Answer blocks, and the two product facts a page could not state.
 *
 * `answer_blocks` is the `faqs` shape — a polymorphic list owned wholesale by
 * its record — with a `kind` deciding which section of the public page draws
 * it: "What is it?", "Who is it for?", a key fact, a step. `answer` is the
 * direct answer, plain and short, because it is what an assistant quotes;
 * `detail` is the supporting explanation and is rich text through the
 * sanitiser like any body. `status` is per block so a half-written one can
 * sit in the console without reaching the page.
 *
 * `warranty` and `applications` on a store product are two questions every
 * buyer asks and nothing on the row could answer; `store_product_service` is
 * the services that install or support the product, so a product page can
 * point at them rather than at nothing. See `docs/aeo-geo-contract.md`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('answer_blocks', function (Blueprint $table) {
            $table->id();
            // The morph map stores the alias — `solution`, `store_product` —
            // never the class name. `AppServiceProvider` enforces it.
            $table->morphs('blockable');
            $table->string('kind', 20);
            $table->string('question', 255)->nullable();
            $table->text('answer');
            $table->longText('detail')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('status', 20)->default('published');
            $table->timestamps();

            // Every read is "this record's blocks, in order".
            $table->index(['blockable_type', 'blockable_id', 'sort_order'], 'answer_blocks_owner_order_index');
        });

        Schema::table('store_products', function (Blueprint $table) {
            $table->string('warranty', 255)->nullable()->after('features');
            $table->text('applications')->nullable()->after('warranty');
        });

        Schema::create('store_product_service', function (Blueprint $table) {
            $table->foreignId('store_product_id')->constrained('store_products')->cascadeOnDelete();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->primary(['store_product_id', 'service_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_product_service');

        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn(['warranty', 'applications']);
        });

        Schema::dropIfExists('answer_blocks');
    }
};
