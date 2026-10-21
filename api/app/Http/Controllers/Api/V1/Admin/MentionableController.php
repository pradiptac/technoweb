<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\Notifications\Mentions;
use App\Support\Notifications\NoteKinds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The mention picker's list (C2): only people who can open the screen the note is on. Staff-wide. */
class MentionableController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['scope' => ['required', 'string', 'max:40'], 'q' => ['nullable', 'string', 'max:60']]);
        $path = match ($data['scope']) {
            'ticket' => '/admin/tickets',
            'lead' => '/admin/leads',
            'order' => '/admin/store/orders',
            default => in_array($data['scope'], NoteKinds::aliases(), true) ? NoteKinds::indexPath($data['scope']) : null,
        };
        if ($path === null) {
            return response()->json(['message' => 'Unknown scope.', 'errors' => ['scope' => ['Unknown scope.']]], 422);
        }

        return response()->json(['data' => Mentions::candidates((string) ($data['q'] ?? ''), $path)]);
    }
}
