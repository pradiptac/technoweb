<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /ext/me`: who the key is, so an integrator can test it. */
class MeController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $key = AuthenticateApiKey::key($request);

        return response()->json(['data' => [
            'name' => $key->name,
            'prefix' => $key->prefix,
            'scopes' => $key->scopes ?? [],
            'expires_at' => $key->expires_at?->toIso8601String(),
        ]]);
    }
}
