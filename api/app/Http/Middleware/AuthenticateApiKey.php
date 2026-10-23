<?php

namespace App\Http\Middleware;

use App\Enums\ApiScope;
use App\Models\ApiKey;
use App\Models\ApiKeyRequest;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use LogicException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Guards the `/ext` surface: `Authorization: Bearer ak_…` and nothing else
 * (never the query string; a Sanctum token is not a key).
 *
 * Usage: `api.key` for any valid key, `api.key:leads:read` for one holding
 * that scope. Laravel splits a middleware's parameters on `,` only, so
 * `leads:read` arrives whole. A scope that is not an `ApiScope` is a mistake
 * in the route and throws rather than answering 403 for ever.
 *
 * Every request presenting a recognised key counts toward its 120 a minute,
 * refused ones included, so a revoked key cannot be hammered for free; and
 * every one is logged. State travels on the request's attributes, because
 * `terminate()` runs on a fresh instance.
 */
class AuthenticateApiKey
{
    private const LIMIT = 120;

    private const LAST_USED_EVERY = 60;

    public function handle(Request $request, Closure $next, ?string $scope = null): Response
    {
        if ($scope !== null && ApiScope::tryFrom($scope) === null) {
            throw new LogicException("Unknown API scope [{$scope}] on a route.");
        }

        $request->attributes->set('api_key_started', microtime(true));

        $plain = $request->bearerToken();
        $key = $plain === null ? null : ApiKey::findByPlain($plain);
        if ($key === null) {
            return $this->refuse(401, 'invalid_key', 'The API key is missing or not recognised.');
        }
        $request->attributes->set('api_key_seen', $key);

        $bucket = 'api-key:'.$key->id;
        if (RateLimiter::tooManyAttempts($bucket, self::LIMIT)) {
            $wait = RateLimiter::availableIn($bucket);

            return $this->refuse(429, 'rate_limited', "Too many requests for this API key. Try again in {$wait} seconds.")
                ->header('Retry-After', (string) $wait);
        }
        RateLimiter::hit($bucket, 60);

        $status = $key->status();
        if ($status === 'revoked') {
            return $this->refuse(401, 'revoked', 'This API key has been revoked.');
        }
        if ($status === 'expired') {
            return $this->refuse(401, 'expired', 'This API key has expired.');
        }
        if (! $key->allowsIp($request->ip())) {
            return $this->refuse(403, 'ip_not_allowed', 'This API key cannot be used from this address.');
        }
        if ($scope !== null && ! $key->allows($scope)) {
            return $this->refuse(403, 'missing_scope', "This API key does not have the {$scope} permission.");
        }

        $request->attributes->set('api_key', $key);

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        /** @var ApiKey|null $key */
        $key = $request->attributes->get('api_key_seen');
        // A throttled call is not logged: the rows themselves would be the flood.
        if ($key === null || $response->getStatusCode() === 429) {
            return;
        }

        try {
            $started = (float) $request->attributes->get('api_key_started', microtime(true));
            ApiKeyRequest::create([
                'api_key_id' => $key->id,
                'method' => $request->method(),
                'path' => mb_substr('/'.ltrim($request->path(), '/'), 0, 255),
                'status' => $response->getStatusCode(),
                'ip' => $request->ip(),
                'duration_ms' => (int) round((microtime(true) - $started) * 1000),
            ]);

            // Only a call that got through is "use"; written at most once a minute.
            if ($request->attributes->has('api_key')
                && ($key->last_used_at === null || $key->last_used_at->lte(now()->subSeconds(self::LAST_USED_EVERY)))) {
                ApiKey::whereKey($key->id)->update(['last_used_at' => now(), 'last_used_ip' => $request->ip()]);
            }
        } catch (Throwable $e) {
            Log::warning('API key request log failed: '.$e->getMessage());
        }
    }

    /** The key a request was authenticated with; only valid behind `api.key`. */
    public static function key(Request $request): ApiKey
    {
        $key = $request->attributes->get('api_key');
        if (! $key instanceof ApiKey) {
            throw new LogicException('No API key on this request: the route is missing api.key.');
        }

        return $key;
    }

    private function refuse(int $status, string $reason, string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'reason' => $reason], $status);
    }
}
