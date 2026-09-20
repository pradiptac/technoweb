<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a form may be put on somebody else's website.
 *
 * **Default false, and that is the whole of the exposure control.** Not because
 * embedding widens the attack surface — `POST /forms/{slug}` is already public
 * and unauthenticated, so anyone could always post to it with curl, and CORS
 * only ever restrained browsers on other origins. What the flag decides is
 * which forms are *offered* for framing: an editor building a form for one page
 * of this site has not asked for it to appear on any other, and a default that
 * said otherwise would be a decision made on their behalf.
 *
 * A boolean rather than a list of permitted domains. That was considered and
 * refused for now: `frame-ancestors` would have to be built per request from
 * the form's own row, because Next evaluates `next.config.ts` headers at build
 * time — and on a page with no session, no authenticated action and nothing
 * destructive behind it, the clickjacking that an allowlist prevents is worth
 * less than the moving parts it adds. Adding the column later is additive.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->boolean('embed_enabled')->default(false)->after('notify_email');
        });
    }

    public function down(): void
    {
        Schema::table('forms', function (Blueprint $table) {
            $table->dropColumn('embed_enabled');
        });
    }
};
