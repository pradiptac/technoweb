<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A popup can be a message as well as a picture.
 *
 * `body` is rich text — the same Summernote editor and the same
 * `HtmlSanitiser` allowlist every CMS body goes through, because it renders
 * through `Prose` on every page the popup targets, which is the widest blast
 * radius any body on the site has. And `image_path` becomes nullable: the rule
 * is now "a picture, a message, or both", enforced in `PopupRequest` rather
 * than by the column, because "at least one of two" is not a constraint a
 * column can hold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('popups', function (Blueprint $table) {
            $table->string('image_path')->nullable()->change();
            $table->text('body')->nullable()->after('image_path');
        });
    }

    public function down(): void
    {
        Schema::table('popups', function (Blueprint $table) {
            $table->dropColumn('body');
            $table->string('image_path')->nullable(false)->change();
        });
    }
};
