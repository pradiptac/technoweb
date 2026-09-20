<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The focal point of a picture: where the subject is, as a percentage of
 * the width and of the height, so a crop keeps it in frame.
 *
 * On the file, beside alt text, for the same reason alt text is there: a
 * record stores a path, and the path is the only thing that links every
 * place a picture is rendered back to one description of it. A 4:3 tile,
 * a 16:9 hero and a 1:1 thumbnail all crop the same photograph, and the
 * face in it is in the same place whichever box it lands in.
 *
 * Both nullable, and null is the centre — `object-position: 50% 50%`, the
 * browser's default, which is what every picture was cropped at before the
 * columns existed. They are written together or not at all; the controller
 * refuses one without the other, since a point is two numbers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->unsignedTinyInteger('focal_x')->nullable()->after('alt_text');
            $table->unsignedTinyInteger('focal_y')->nullable()->after('focal_x');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn(['focal_x', 'focal_y']);
        });
    }
};
