<?php

namespace App\Support\Health;

use App\Jobs\CheckRecordHealth;
use App\Models\HealthLink;
use App\Models\Setting;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Asks one URL whether it is still there (docs/health.md "Link checker").
 * Through `SafeHttp` only — public hosts, pinned, redirects checked hop by
 * hop. An internal path is asked of the website at `WEB_INTERNAL_URL`, the
 * one configured private address it may reach; without one it is asked of
 * `FRONTEND_URL`, publicly, off a development machine (where that is the
 * production domain) it stays `unknown`. Internal is dead only on 404/410.
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
            $allowPrivate = true; // the operator configured this address; it is ours.
            if ($base === '') {
                // A customer install sets none: ask its public address, publicly. On a dev machine FRONTEND_URL is production, so stay unknown.
                if (config('app.env') === 'local') {
                    return ['unknown', null];
                }
                $base = rtrim((string) config('app.frontend_url'), '/');
                $allowPrivate = false;
            }
            $url = $base.$link->url;
        }

        // Range: a file we only need to know exists is not downloaded; the cap in SafeHttp::get() is the backstop.
        $headers = ['User-Agent' => self::agent(), 'Range' => 'bytes=0-0'];
        $options = ['timeout' => 10, 'allow_private' => $allowPrivate, 'allow_http' => true, 'max_bytes' => 65536, 'headers' => $headers];

        $seen = null;

        try {
            $request = fn () => SafeHttp::request($url, $allowPrivate, true)->timeout(10)->withHeaders($headers);
            $response = $request()->head($url);

            if (in_array($response->status(), [405, 501], true) || ($response->redirect() && ! $link->internal)) {
                // An internal path never follows a redirect: the private allowance must not travel to wherever the site sends it.
                // Keeping cURL (which carries the pin) and stopping at the headers: the status is all that is wanted.
                $response = $link->internal
                    ? $request()->withOptions(['on_headers' => function ($r) use (&$seen) {
                        $seen = $r->getStatusCode();
                        throw new \RuntimeException('headers seen');
                    }])->get($url)
                    : SafeHttp::get($url, $options);
            }
        } catch (Throwable $e) {
            if ($seen !== null) {
                return self::judge($seen, $link->internal);
            }

            // Laravel turns a failed transfer that carried an error status into a RequestException; that status is the answer.
            if ($e instanceof RequestException) {
                return self::judge($e->response->status(), $link->internal);
            }

            // The size cap fired after the headers arrived: judge the status the server gave, as for any answer.
            $capped = false;
            $status = null;
            for ($previous = $e; $previous; $previous = $previous->getPrevious()) {
                $capped = $capped || ($previous instanceof UnsafeUrl && $previous->getMessage() === 'The file is larger than the limit.');
                if ($status === null && method_exists($previous, 'getResponse') && is_object($previous->getResponse())) {
                    $status = $previous->getResponse()->getStatusCode();
                }
            }
            if ($capped) {
                return $status === null ? ['unknown', null] : self::judge($status, $link->internal);
            }
            if (! $e instanceof UnsafeUrl) {
                Log::info('Site health: no answer', ['url' => $url, 'error' => $e->getMessage()]);
            }

            return [$link->internal ? 'unknown' : 'failed', null];
        }

        return self::judge($response->status(), $link->internal);
    }

    /** @return array{0: string, 1: int} */
    private static function judge(int $status, bool $internal): array
    {
        return match (true) {
            $status < 400 => ['ok', $status],
            // An internal path is dead only when the site itself says it is gone; a 500 is the site's trouble, not a dead link.
            $internal => [in_array($status, [404, 410], true) ? 'failed' : 'unknown', $status],
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
