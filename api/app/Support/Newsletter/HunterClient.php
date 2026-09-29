<?php

namespace App\Support\Newsletter;

use App\Models\Setting;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Hunter.io's Email Verifier, as this application uses it.
 *
 * Two calls. `verify()` asks about one address and never throws — every
 * answer Hunter can give is a value here, because the caller is a loop that
 * must go on to the next address whatever happened to this one. `account()`
 * asks what is left of the plan and does throw, because its callers are a
 * test button and a budget check, and both want Hunter's own words.
 *
 * The key goes in a header and never in the query string, so it cannot land
 * in an access log or a proxy's URL history.
 */
class HunterClient
{
    public const BASE = 'https://api.hunter.io/v2';

    /**
     * The key: the setting first, the environment second.
     *
     * Same chain as `ChatSettings::apiKey()` and for the same reason — a
     * credential that can be rotated from the console, with `.env` so a fresh
     * install works before anybody opens it.
     */
    public static function key(): ?string
    {
        $key = trim((string) Setting::get('hunter_api_key', ''));

        return $key !== '' ? $key : (config('services.hunter.key') ?: null);
    }

    public static function configured(): bool
    {
        return self::key() !== null;
    }

    /**
     * One address.
     *
     * A transport failure comes back as `http = 0` rather than as an
     * exception: it is one of the outcomes the loop has to reason about
     * (three in a row means stop), not a fault that ends the run.
     */
    public function verify(string $email): HunterResult
    {
        try {
            $response = $this->request()->get(self::BASE.'/email-verifier', ['email' => $email]);
        } catch (ConnectionException $e) {
            return new HunterResult(0, null, null, $e->getMessage());
        }

        return new HunterResult(
            $response->status(),
            $response->json('data.status'),
            is_numeric($response->json('data.score')) ? (int) $response->json('data.score') : null,
            self::message($response),
        );
    }

    /**
     * What the plan allows and what is left of it. Free to call.
     *
     * @return array{plan_name: ?string, reset_date: ?string, used: int, available: int, searches_used: int, searches_available: int}
     *
     * @throws RuntimeException carrying Hunter's own sentence
     */
    public function account(): array
    {
        try {
            $response = $this->request()->get(self::BASE.'/account');
        } catch (ConnectionException $e) {
            throw new RuntimeException('Hunter could not be reached: '.$e->getMessage());
        }

        if (! $response->successful()) {
            throw new RuntimeException(self::message($response) ?? 'Hunter answered '.$response->status().'.');
        }

        return [
            'plan_name' => $response->json('data.plan_name'),
            'reset_date' => $response->json('data.reset_date'),
            'used' => (int) $response->json('data.requests.verifications.used', 0),
            'available' => (int) $response->json('data.requests.verifications.available', 0),
            // Domain searches are a separate allowance on every Hunter plan.
            'searches_used' => (int) $response->json('data.requests.searches.used', 0),
            'searches_available' => (int) $response->json('data.requests.searches.available', 0),
        ];
    }

    /**
     * The addresses Hunter knows at a domain, with the names and job titles
     * it has for them (2026-09-27, the website crawl). One call spends one
     * of the plan's *searches*, a different allowance from verifications.
     *
     * Throws on anything but a 200 — the crawl turns that into a note on
     * the run and carries on without Hunter.
     *
     * @return array{organization: ?string, emails: list<array{email: string, first_name: ?string, last_name: ?string, position: ?string}>}
     */
    public function domainSearch(string $domain, int $limit = 10): array
    {
        try {
            $response = $this->request()->get(self::BASE.'/domain-search', ['domain' => $domain, 'limit' => max(1, min(100, $limit))]);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Hunter could not be reached: '.$e->getMessage());
        }

        if (! $response->successful()) {
            throw new RuntimeException(self::message($response) ?? 'Hunter answered '.$response->status().'.');
        }

        $found = [];

        foreach ((array) $response->json('data.emails', []) as $row) {
            if (is_array($row) && filter_var($row['value'] ?? null, FILTER_VALIDATE_EMAIL)) {
                $found[] = [
                    'email' => strtolower((string) $row['value']),
                    'first_name' => filled($row['first_name'] ?? null) ? (string) $row['first_name'] : null,
                    'last_name' => filled($row['last_name'] ?? null) ? (string) $row['last_name'] : null,
                    'position' => filled($row['position'] ?? null) ? (string) $row['position'] : null,
                ];
            }
        }

        $organization = $response->json('data.organization');

        return ['organization' => is_string($organization) && $organization !== '' ? $organization : null, 'emails' => $found];
    }

    private function request()
    {
        return Http::acceptJson()
            ->withHeaders(['X-API-KEY' => (string) self::key()])
            ->timeout(20);
    }

    /** Hunter's own explanation of a refusal, or nothing. */
    private static function message(Response $response): ?string
    {
        $details = $response->json('errors.0.details');

        return is_string($details) && $details !== '' ? $details : null;
    }
}
