<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_products', function (Blueprint $table) {
            // Null is the shop's `store_return_days`.
            $table->unsignedSmallInteger('return_days')->nullable()->after('returnable');
        });

        Schema::table('order_items', function (Blueprint $table) {
            // The window this line was sold with, frozen like `returnable`.
            // Null on every order placed before it existed.
            $table->unsignedSmallInteger('return_days')->nullable()->after('returnable');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('return_days'));
        Schema::table('store_products', fn (Blueprint $table) => $table->dropColumn('return_days'));
    }
};
