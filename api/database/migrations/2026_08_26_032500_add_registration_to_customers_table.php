<?php

use App\Enums\CustomerStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Customers can register themselves, so an account now has a lifecycle rather
 * than a switch.
 *
 * `is_active` is dropped rather than kept alongside `status`. It could not
 * distinguish "waiting for a human to look at it" from "a human turned it
 * off", and keeping both would mean two columns answering the same question,
 * free to disagree the first time one is written without the other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('status', 20)->default(CustomerStatus::Pending->value)->after('phone');
            $table->timestamp('email_verified_at')->nullable()->after('status');
            $table->timestamp('approved_at')->nullable()->after('email_verified_at');
            $table->foreignId('approved_by')->nullable()->after('approved_at')
                ->constrained('users')->nullOnDelete();

            // Why an account was rejected or suspended. Staff-facing only — it
            // is never returned to the customer, because the sign-in form is
            // the wrong place to have that conversation.
            $table->string('status_note', 500)->nullable()->after('approved_by');

            $table->string('email_verification_token', 64)->nullable()->after('status_note');
            $table->timestamp('email_verification_sent_at')->nullable()->after('email_verification_token');

            $table->index('status');
        });

        // Everyone who exists today was created by staff running the artisan
        // command, so their address is already trusted and their account was
        // already a decision somebody took.
        DB::table('customers')->update([
            'status' => DB::raw("CASE WHEN is_active = 1 THEN 'active' ELSE 'suspended' END"),
            'email_verified_at' => DB::raw('created_at'),
            'approved_at' => DB::raw('created_at'),
        ]);

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('phone');
        });

        DB::table('customers')->update([
            'is_active' => DB::raw("CASE WHEN status = 'active' THEN 1 ELSE 0 END"),
        ]);

        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropIndex(['status']);
            $table->dropColumn([
                'status', 'email_verified_at', 'approved_at', 'approved_by',
                'status_note', 'email_verification_token', 'email_verification_sent_at',
            ]);
        });
    }
};
