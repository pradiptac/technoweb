<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How to actually use the licence you just bought.
 *
 * A code on its own is not a delivered product. "Sign in at this address, paste
 * the key under Account > Licences, restart the appliance" is the other half,
 * and it is the same words every time — which is what makes it worth storing
 * once rather than typing into a support reply per order.
 *
 * Two columns because the two are genuinely different things and one cannot
 * substitute for the other. The **procedure** is rich text: it is read in an
 * email and on the order page, it wants a numbered list and a link, and it has
 * to render everywhere including a mail client that strips stylesheets. The
 * **PDF** is the vendor's own document — a datasheet, a licence agreement, an
 * installation guide — which is handed over as a file rather than reproduced,
 * because retyping somebody else's document is how it goes out of date.
 *
 * Both are nullable and both fall back to a store-wide default in settings, so
 * a shop with one procedure writes it once and a shop selling six different
 * vendors' licences overrides per product.
 *
 * The path, not a media id, matching every other image and file reference in
 * the application — records store a path and `App\Support\MediaAlt` resolves
 * back to the row by it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->text('activation_procedure')->nullable()->after('description');
            $table->string('activation_pdf_path')->nullable()->after('activation_procedure');
        });
    }

    public function down(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            $table->dropColumn(['activation_procedure', 'activation_pdf_path']);
        });
    }
};
