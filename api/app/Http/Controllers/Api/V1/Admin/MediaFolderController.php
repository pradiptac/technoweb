<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\MediaFolder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Folders in the media library. Behind auth:sanctum + role:content_manager.
 *
 * Deleting a folder never deletes what is in it — folder_id is nullOnDelete,
 * so its files return to the unfiled view. A folder is a label; the files are
 * the expensive thing, and losing a hundred uploads to one confirmation
 * dialog is not a mistake anyone recovers from.
 */
class MediaFolderController extends Controller
{
    public function index(): JsonResponse
    {
        $folders = MediaFolder::query()
            ->withCount('media')
            ->orderBy('name')
            ->get()
            ->map(fn (MediaFolder $f) => [
                'id' => $f->id,
                'name' => $f->name,
                'media_count' => $f->media_count,
            ]);

        return response()->json(['data' => $folders]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('media_folders', 'name')],
        ], [
            'name.unique' => 'There is already a folder with that name.',
        ]);

        $folder = MediaFolder::create([
            'name' => $data['name'],
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'data' => ['id' => $folder->id, 'name' => $folder->name, 'media_count' => 0],
        ], 201);
    }

    public function destroy(MediaFolder $mediaFolder): JsonResponse
    {
        $released = $mediaFolder->media()->count();
        $mediaFolder->delete();

        return response()->json([
            'message' => $released === 0
                ? 'Folder deleted.'
                : "Folder deleted. {$released} ".($released === 1 ? 'file' : 'files').' moved to unfiled.',
        ]);
    }
}
