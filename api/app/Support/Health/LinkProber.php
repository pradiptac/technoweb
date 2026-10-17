<?php

namespace App\Support\Health;

use App\Jobs\CheckRecordHealth;
use App\Models\HealthLink;
use App\Models\Setting;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Asks one URL whether it is still there (docs/health.md "Link checker").
 * Through `SafeHttp` only — public hosts, pinned, redirects checked hop by
 * hop. An internal path is asked of the website at `WEB_INTERNAL_URL`, the
 * one configured private address it may reach; without one an internal
 * path stays `unknown` rather than being asked of the production domain.
 */
final class LinkProber
{
    public static function probe(HealthLink $link): void
    {
        $wasDead = $link->isDead();
        [$result, $status] = self::ask($link);

        $link->fill([
            'result' => $result,
            'status' => $status,
            'checked_at' => now(),
            'fails' => match ($result) {
                'ok' => 0, 'failed' => (int) $link->fails + 1, default => (int) $link->fails
            },
        ]);
        $link->next_check_at = match (true) {
            $result === 'failed' && $link->fails === 1 => now()->addDay(),
            default => now()->addDays(7),
        };
        $link->save();

        if ($wasDead !== $link->isDead()) {
            DB::table('health_link_refs')->where('health_link_id', $link->id)->get()
                ->each(fn ($ref) => CheckRecordHealth::dispatch($ref->subject_type, (int) $ref->subject_id));
        }
    }

    /** @return array{0: string, 1: int|null} */
    private static function ask(HealthLink $link): array
    {
        $url = $link->url;
        $allowPrivate = config('app.env') === 'local' && (bool) config('app.health_allow_private');

        if ($link->internal) {
            $base = rtrim((string) config('app.web_internal_url'), '/');
            if ($base === '') {
                return ['unknown', null];
            }
            $url = $base.$link->url;
            $allowPrivate = true; // the operator configured this address; it is ours.
        }

        $options = [
            'timeout' => 10,
            'allow_private' => $allowPrivate,
            'allow_http' => true,
            'max_bytes' => 65536,
            'headers' => ['User-Agent' => self::agent()],
        ];

        try {
            $response = SafeHttp::request($url, $allowPrivate, true)->timeout(10)->withHeaders($options['headers'])->head($url);
            if (in_array($response->status(), [405, 501], true) || $response->redirect()) {
                $response = SafeHttp::get($url, $options);
            }
        } catch (UnsafeUrl) {
            return ['failed', null];
        } catch (Throwable $e) {
            Log::info('Site health: no answer', ['url' => $url, 'error' => $e->getMessage()]);

            return ['failed', null];
        }

        $status = $response->status();

        return match (true) {
            $status < 400 => ['ok', $status],
            in_array($status, [401, 403, 429], true) => ['unknown', $status],
            default => ['failed', $status],
        };
    }

    private static function agent(): string
    {
        $name = (string) (Setting::get('company_name') ?: config('app.name'));

        return "{$name} link checker (+".config('app.frontend_url').')';
    }
}
