<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "This reply contains sensitive data, encrypt its contents": a switch on
 * the message, and the body of a switched-on row is stored as ciphertext
 * (`TicketMessage::sealBody()`). A column beside `is_internal` rather than
 * a table of its own, for the same reason `rating` is; `body` is already
 * `longText`, which holds Laravel's base64 envelope with room to spare.
 * Nothing searches `ticket_messages.body`, so there is no fingerprint
 * column the way `digital_codes` needs one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ticket_messages', function (Blueprint $table) {
            $table->boolean('is_sensitive')->default(false)->after('is_internal');
        });
    }

    public function down(): void
    {
        Schema::table('ticket_messages', function (Blueprint $table) {
            $table->dropColumn('is_sensitive');
        });
    }
};
