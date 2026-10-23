<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ApiScope;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreApiKeyRequest;
use App\Http\Requests\UpdateApiKeyRequest;
use App\Http\Resources\Admin\ApiKeyRequestResource;
use App\Http\Resources\Admin\ApiKeyResource;
use App\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * API keys for the `/ext` surface. Behind auth:sanctum + role:admin.
 *
 * **The key leaves once**, beside the resource on the 201 that made it and the
 * roll that replaced it, and on no other response; only its SHA-256 is stored.
 * Attributes are built field by field from validated input — `ApiKey` is
 * fillable down to `key_hash` and `revoked_at`, so request input never goes
 * into `create()` or `fill()` whole.
 */
class ApiKeyController extends Controller
{
    private const REVOKED = 'This key has been revoked. Make a new one instead.';

    public function index(Request $request): AnonymousResourceCollection
    {
        $keys = ApiKey::query()
            ->with('creator')
            ->withCount(['requests as requests_30d_count' => fn ($q) => $q->where('created_at', '>=', $this->windowStart())])
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return ApiKeyResource::collection($keys)->additional([
            'meta' => ['scopes' => ApiScope::options(), 'base_url' => url('/api/v1/ext')],
        ]);
    }

    public function show(ApiKey $apiKey): JsonResource
    {
        return new ApiKeyResource($apiKey->load('creator'));
    }

    public function store(StoreApiKeyRequest $request): JsonResponse
    {
        $data = $request->validated();
        [$plain, $hash] = ApiKey::mint();

        $key = ApiKey::create([
            'name' => $data['name'],
            'prefix' => substr($plain, 0, 11),
            'key_hash' => $hash,
            'scopes' => $request->validatedScopes(),
            'allowed_ips' => $request->validatedIps() ?: null,
            'expires_at' => $data['expires_at'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return $this->withKey($key, $plain, $request, 201);
    }

    public function update(UpdateApiKeyRequest $request, ApiKey $apiKey): JsonResponse
    {
        $this->refuseRevoked($apiKey);

        $data = $request->validated();

        if (array_key_exists('name', $data)) {
            $apiKey->name = $data['name'];
        }
        if (array_key_exists('scopes', $data)) {
            $apiKey->scopes = $request->validatedScopes();
        }
        if (array_key_exists('expires_at', $data)) {
            $apiKey->expires_at = $data['expires_at'];
        }
        if (array_key_exists('allowed_ips', $data)) {
            $apiKey->allowed_ips = $request->validatedIps() ?: null;
        }
        $apiKey->save();

        return response()->json(['data' => (new ApiKeyResource($apiKey->load('creator')))->resolve($request)]);
    }

    /** A new key in place of the old one; the old one stops working at once. */
    public function roll(Request $request, ApiKey $apiKey): JsonResponse
    {
        $this->refuseRevoked($apiKey);

        [$plain, $hash] = ApiKey::mint();
        $apiKey->forceFill(['prefix' => substr($plain, 0, 11), 'key_hash' => $hash])->save();

        return $this->withKey($apiKey, $plain, $request);
    }

    /** Idempotent: a second press keeps the first `revoked_at`. */
    public function revoke(Request $request, ApiKey $apiKey): JsonResponse
    {
        if ($apiKey->revoked_at === null) {
            $apiKey->forceFill(['revoked_at' => now()])->save();
        }

        return response()->json(['data' => (new ApiKeyResource($apiKey->load('creator')))->resolve($request)]);
    }

    public function destroy(ApiKey $apiKey): JsonResponse
    {
        // Its request log cascades with it.
        $apiKey->delete();

        return response()->json(null, 204);
    }

    public function requests(Request $request, ApiKey $apiKey): AnonymousResourceCollection
    {
        $rows = $apiKey->requests()
            ->when($request->string('status')->value() === 'ok', fn ($q) => $q->where('status', '<', 400))
            ->when($request->string('status')->value() === 'error', fn ($q) => $q->where('status', '>=', 400))
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        // Every one of the last 30 days, oldest first; the days are the app
        // timezone's because that is what `created_at` is stored in.
        $perDay = $apiKey->requests()
            ->where('created_at', '>=', $this->windowStart())
            ->select(DB::raw('DATE(created_at) as day'), DB::raw('COUNT(*) as n'))
            ->groupBy('day')
            ->pluck('n', 'day');

        $counts = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $counts[] = ['date' => $date, 'count' => (int) ($perDay[$date] ?? 0)];
        }

        return ApiKeyRequestResource::collection($rows)->additional(['meta' => ['counts' => $counts]]);
    }

    private function windowStart(): Carbon
    {
        return now()->subDays(29)->startOfDay();
    }

    private function refuseRevoked(ApiKey $apiKey): void
    {
        if ($apiKey->revoked_at !== null) {
            throw ValidationException::withMessages(['name' => self::REVOKED]);
        }
    }

    private function withKey(ApiKey $key, string $plain, Request $request, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => (new ApiKeyResource($key->load('creator')))->resolve($request) + ['key' => $plain],
        ], $status);
    }
}
