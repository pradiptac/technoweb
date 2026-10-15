<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\CustomFonts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Uploading and removing a company's own typefaces (0.125.0).
 *
 * Its own two routes rather than rows on the settings form: a font is a
 * file, the settings `PATCH` carries strings, and the form's image picker
 * would offer the media library for it. `role:admin`, like the palette these
 * sit beside.
 */
class CustomFontController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => CustomFonts::all(), 'meta' => ['max_kb' => CustomFonts::MAX_KB]]);
    }

    public function store(Request $request, int $slot): JsonResponse
    {
        $data = $request->validate([
            // Letters, digits, spaces and the few marks a family name carries.
            // It is shown in a list and never written into a stylesheet.
            'name' => ['required', 'string', 'max:40', 'regex:/^[\pL\pN][\pL\pN .\'&-]*$/u'],
            'regular' => ['nullable', 'file', 'max:'.CustomFonts::MAX_KB],
            'bold' => ['nullable', 'file', 'max:'.CustomFonts::MAX_KB],
            'variable' => ['nullable', 'boolean'],
        ], [
            'name.regex' => 'Use letters, digits and spaces for the font’s name.',
            'regular.max' => 'That file is over the 2 MB limit for a font.',
            'bold.max' => 'That file is over the 2 MB limit for a font.',
        ]);

        $current = CustomFonts::slot($slot);

        foreach (['regular', 'bold'] as $weight) {
            $file = $request->file($weight);

            if ($file !== null && (strtolower($file->getClientOriginalExtension()) !== 'woff2' || ! CustomFonts::isWoff2($file))) {
                throw ValidationException::withMessages([
                    $weight => 'Upload a WOFF2 font file (.woff2). A TTF or OTF can be converted to WOFF2 with a free online converter.',
                ]);
            }
        }

        if ($current['regular'] === null && $request->file('regular') === null) {
            throw ValidationException::withMessages(['regular' => 'Choose the font’s regular (or variable) WOFF2 file.']);
        }

        $variable = $request->boolean('variable');

        if ($variable && $request->file('bold') !== null) {
            throw ValidationException::withMessages(['bold' => 'A variable font holds every weight in one file — leave the bold file out.']);
        }

        return response()->json(['data' => CustomFonts::store(
            $slot,
            trim($data['name']),
            $request->file('regular'),
            $request->file('bold'),
            $variable,
        )]);
    }

    public function destroy(int $slot): JsonResponse
    {
        CustomFonts::clear($slot);

        return response()->json(['data' => CustomFonts::slot($slot)]);
    }
}
