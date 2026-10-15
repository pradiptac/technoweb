<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\GoogleFont;
use App\Models\Setting;
use App\Support\Fonts\GoogleFontCatalogue;
use App\Support\Fonts\GoogleFonts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Google fonts copied to this server (0.179.0). `role:admin`, beside the custom-font slots. */
class GoogleFontController extends Controller
{
    public function index(): JsonResponse
    {
        $inUse = [Setting::get('theme_font_display'), Setting::get('theme_font_body')];

        return response()->json(['data' => GoogleFont::orderBy('family')->get()->map(fn (GoogleFont $f) => [
            'id' => $f->id(), 'slug' => $f->slug, 'family' => $f->family, 'category' => $f->category,
            'faces' => count($f->faces), 'bytes' => $f->bytes, 'in_use' => in_array($f->id(), $inUse, true),
        ])]);
    }

    public function catalogue(Request $request): JsonResponse
    {
        $installed = GoogleFont::pluck('slug')->all();
        $result = GoogleFontCatalogue::search(
            mb_substr((string) $request->query('q', ''), 0, 60),
            $request->filled('category') ? (string) $request->query('category') : null,
            max(1, (int) $request->query('page', 1)),
        );

        return response()->json([
            'data' => array_map(fn (array $r) => [...$r, 'installed' => in_array($r['slug'], $installed, true)], $result['data']),
            'meta' => ['total' => $result['total'], 'categories' => ['sans-serif', 'serif', 'display', 'handwriting', 'monospace']],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['slug' => ['required', 'string', 'max:62', 'regex:/^[a-z0-9-]+$/']]);
        [$font, $new] = GoogleFonts::install((string) $request->input('slug'));

        return response()->json(['data' => [
            'id' => $font->id(), 'slug' => $font->slug, 'family' => $font->family, 'faces' => count($font->faces), 'bytes' => $font->bytes,
        ]], $new ? 201 : 200);
    }

    public function destroy(string $slug): JsonResponse
    {
        GoogleFonts::remove(GoogleFont::where('slug', $slug)->firstOrFail());

        return response()->json(null, 204);
    }

    public function preview(string $slug): BinaryFileResponse
    {
        return response()->file(GoogleFonts::preview($slug), [
            'Content-Type' => 'font/woff2', 'Cache-Control' => 'private, max-age=86400', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
