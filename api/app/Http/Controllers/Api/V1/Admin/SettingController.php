<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Site settings. Behind role:admin rather than role:content_manager — the
 * Role enum puts "settings" under the administrator's remit, and these values
 * are site-wide rather than per-record content.
 *
 * Only keys that already exist can be written. Settings are read by name all
 * over the codebase, so letting the UI invent new ones would fill the table
 * with keys nothing reads.
 */
class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = Setting::orderBy('group')->orderBy('key')->get();

        return response()->json([
            'data' => $settings->groupBy('group')->map(fn ($rows) => $rows->map(fn (Setting $s) => [
                'key' => $s->key,
                'value' => $s->value,
                'type' => $s->type,
            ])->values()),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $existing = Setting::pluck('type', 'key');

        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'max:255'],
            'settings.*.value' => ['nullable', 'string', 'max:2000'],
        ]);

        DB::transaction(function () use ($validated, $existing) {
            foreach ($validated['settings'] as $row) {
                if (! $existing->has($row['key'])) {
                    continue;
                }

                $value = $row['value'];

                // A URL field left blank means "hide it", not "store an empty
                // string that later renders as a link to nowhere".
                Setting::where('key', $row['key'])->update([
                    'value' => $value === '' ? null : $value,
                ]);
            }
        });

        // The model clears its cache on save(), but update() on a query
        // builder bypasses model events, so clear it explicitly.
        cache()->forget('settings.all');

        return response()->json(['message' => 'Settings saved.']);
    }
}
