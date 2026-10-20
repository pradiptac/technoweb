<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ContentTypeResource;
use App\Models\ContentType;
use App\Support\Presets\PresetInstaller;
use App\Support\Presets\Presets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The presets strip on Content → Content types (docs/content-presets.md).
 * Behind role:content_manager, like content types themselves.
 */
class ContentPresetController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = [];
        foreach (Presets::all() as $key => $def) {
            $first = $def['types'][0];
            $installed = ContentType::query()->preset($first['preset'])->first(['id', 'slug']);
            $rows[] = [
                'key' => $key,
                'label' => $def['label'],
                'blurb' => $def['blurb'],
                'slug' => $first['defaults']['slug'],
                'types' => array_map(fn ($t) => [
                    'preset' => $t['preset'],
                    'plural' => $t['defaults']['plural'],
                    'slug' => $t['defaults']['slug'],
                    'fields' => array_map(fn ($f) => ['key' => $f['key'], 'label' => $f['label'], 'kind' => $f['kind']], $t['fields']),
                ], $def['types']),
                'installed' => $installed ? ['id' => $installed->id, 'slug' => $installed->slug] : null,
                'clash' => $installed ? null : PresetInstaller::clash($first['defaults']['slug']),
            ];
        }

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, string $key): JsonResponse
    {
        abort_unless(in_array($key, Presets::INSTALL_KEYS, true), 404);

        $data = $request->validate([
            'slug' => ['nullable', 'string', 'max:60'],
            'coverage_slug' => ['nullable', 'string', 'max:60'],
        ]);

        $types = Presets::all()[$key]['types'];
        $slugs = array_filter([
            $types[0]['preset'] => $data['slug'] ?? null,
            ($types[1]['preset'] ?? '') => $data['coverage_slug'] ?? null,
        ], fn ($v, $k) => $k !== '' && filled($v), ARRAY_FILTER_USE_BOTH);

        $made = PresetInstaller::install($key, $slugs);

        return ContentTypeResource::collection(collect($made)->map(fn (ContentType $t) => $t->loadCount('entries')))
            ->response()->setStatusCode(201);
    }
}
