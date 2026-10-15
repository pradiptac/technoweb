<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shiprocket manifests (0.159.0, docs/store.md "Manifests"): the PDF the
 * courier's driver signs for, kept on the order it was made for. Null for an
 * order nobody has manifested.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('shipment_manifest_url', 500)->nullable()->after('shipment_label_url');
            $table->timestamp('shipment_manifest_at')->nullable()->after('shipment_manifest_url');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['shipment_manifest_url', 'shipment_manifest_at']);
        });
    }
};
