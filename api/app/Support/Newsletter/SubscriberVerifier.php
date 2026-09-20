<?php

namespace App\Support\Newsletter;

use App\Enums\EmailVerification;
use App\Enums\SubscriberStatus;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterVerification;
use App\Models\Setting;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Verify subscriber addresses through Hunter, a few a day, and never the
 * same address twice.
 *
 * Three rules, each protecting something specific:
 *
 * **The bill is bounded twice.** `hunter_monthly_cap` is a local ceiling
 * counted from the ledger; Hunter's own `available` figure is asked for at
 * the start of every run and the run stops at whichever is lower. The first
 * is what the client decided to spend; the second is what Hunter will
 * actually allow, and reading it first means the run ends before a 429
 * rather than on one.
 *
 * **Slowly means spread.** A run checks what is left of the month's
 * allowance divided by the days left in the month, so a five-hundred-row
 * import is worked through at three or four a day and the screen says how
 * long that will take — rather than the month's allowance going in one
 * afternoon and nothing new being checked for three weeks.
 *
 * **One verdict per address.** The scheduled pass only ever takes rows that
 * are `unverified`, or `pending` with attempts to spare. An address deleted
 * and re-imported finds its earlier verdict in the ledger and is copied,
 * not re-bought. Only a person pressing Re-check asks about a settled row.
 *
 * Nothing here throws past `run()`: a Hunter outage at 03:55 must not be a
 * failed scheduler event, so the loop is guarded the way `Notifier` is and
 * the error goes into `newsletter_verify_error` where the console shows it.
 */
class SubscriberVerifier
{
    public const CAP_KEY = 'hunter_monthly_cap';

    public const ERROR_KEY = 'newsletter_verify_error';

    public const LAST_RUN_KEY = 'newsletter_verify_last_run';

    /** Hunter allows ten a second; this is well under, and a run is a handful anyway. */
    private const PAUSE_MICROSECONDS = 150_000;

    public function __construct(private readonly HunterClient $client = new HunterClient) {}

    /**
     * What may be spent, and how it is spread.
     *
     * @return array{cap: int, used: int, remaining: int, days_left: int, per_day: int, resets_on: string}
     */
    public function budget(): array
    {
        $cap = max(0, (int) Setting::get(self::CAP_KEY, 100));
        $used = NewsletterVerification::usedThisMonth();
        $remaining = max(0, $cap - $used);
        $now = now();
        $daysLeft = $now->daysInMonth - $now->day + 1;

        return [
            'cap' => $cap,
            'used' => $used,
            'remaining' => $remaining,
            'days_left' => $daysLeft,
            'per_day' => $remaining === 0 ? 0 : (int) ceil($remaining / $daysLeft),
            'resets_on' => $now->copy()->startOfMonth()->addMonth()->toDateString(),
        ];
    }

    /**
     * What is waiting to be checked, in the order it will be taken.
     *
     * Only an address a campaign could go to: verifying an unsubscribed or
     * suppressed one is money spent on a question nothing will ask.
     */
    public function queue(): Builder
    {
        return NewsletterSubscriber::query()
            ->where('status', SubscriberStatus::Active)
            ->whereNotExists(fn ($q) => $q
                ->selectRaw('1')
                ->from('newsletter_suppressions')
                ->whereColumn('newsletter_suppressions.email', 'newsletter_subscribers.email'))
            ->where(fn ($q) => $q
                ->where('verification', EmailVerification::Unverified->value)
                ->orWhere(fn ($p) => $p
                    ->where('verification', EmailVerification::Pending->value)
                    ->where('verification_attempts', '<', EmailVerification::MAX_ATTEMPTS)))
            // Never-asked first, then whichever pending row has waited longest.
            ->orderByRaw("case when verification = 'unverified' then 0 else 1 end")
            ->orderBy('verification_at')
            ->orderBy('id');
    }

    /**
     * How long the queue will take at this plan's pace.
     *
     * @return array{waiting: int, estimated_days: ?int}
     */
    public function estimate(?array $budget = null): array
    {
        $budget ??= $this->budget();
        $waiting = $this->queue()->count();

        if ($waiting === 0) {
            return ['waiting' => 0, 'estimated_days' => 0];
        }

        if ($budget['cap'] === 0) {
            return ['waiting' => $waiting, 'estimated_days' => null];
        }

        if ($waiting <= $budget['remaining']) {
            $days = (int) ceil($waiting / max(1, $budget['per_day']));
        } else {
            // The rest of this month, then whole months at the full allowance.
            $days = $budget['days_left']
                + (int) ceil(($waiting - $budget['remaining']) / $budget['cap'] * now()->daysInMonth);
        }

        return ['waiting' => $waiting, 'estimated_days' => max(1, $days)];
    }

    /**
     * The scheduled pass.
     *
     * @param  int|null  $limit  at most this many calls, instead of today's share
     * @return array<string, mixed> a tally, with `skipped` or `stopped` set when it did not run through
     */
    public function run(?int $limit = null, string $source = 'scheduled'): array
    {
        $tally = [
            'calls' => 0, 'copied' => 0, 'verified' => 0, 'risky' => 0, 'invalid' => 0,
            'disposable' => 0, 'pending' => 0, 'skipped' => null, 'stopped' => null,
        ];

        try {
            if (! HunterClient::configured()) {
                $tally['skipped'] = 'no key';

                return $tally;
            }

            $budget = $this->budget();

            if ($budget['cap'] === 0) {
                $tally['skipped'] = 'paused';

                return $tally;
            }

            try {
                $account = $this->client->account();
                $this->rememberAccount($account);
                $ceiling = min($budget['remaining'], $account['available']);
            } catch (RuntimeException $e) {
                $this->fail($e->getMessage());
                $tally['stopped'] = $e->getMessage();

                return $tally;
            }

            Setting::put(self::LAST_RUN_KEY, now()->toIso8601String());

            $allowed = min($limit ?? $budget['per_day'], $ceiling);
            $seen = [];
            $failures = 0;

            while ($tally['calls'] < $allowed && $tally['stopped'] === null) {
                $batch = $this->queue()
                    ->whereNotIn('id', $seen)
                    ->limit($allowed - $tally['calls'])
                    ->get();

                if ($batch->isEmpty()) {
                    break;
                }

                foreach ($batch as $subscriber) {
                    $seen[] = $subscriber->id;

                    if ($tally['calls'] >= $allowed) {
                        break;
                    }

                    // Checked before under another row: copy, do not pay.
                    if ($earlier = NewsletterVerification::lastFinalFor($subscriber->email)) {
                        $this->copy($subscriber, $earlier);
                        $tally['copied']++;
                        $tally[$subscriber->verification->value] = ($tally[$subscriber->verification->value] ?? 0) + 1;

                        continue;
                    }

                    $result = $this->verifyOne($subscriber, $source);
                    $tally['calls']++;

                    if ($result->stopsTheRun()) {
                        $tally['stopped'] = $result->message ?? 'Hunter answered '.$result->http.'.';
                        break;
                    }

                    if (! $result->reachedHunter()) {
                        if (++$failures >= 3) {
                            $tally['stopped'] = 'Hunter could not be reached three times in a row.';
                            break;
                        }
                    } else {
                        $failures = 0;
                        $tally[$subscriber->verification->value] = ($tally[$subscriber->verification->value] ?? 0) + 1;
                    }

                    if ($tally['calls'] < $allowed) {
                        usleep(self::PAUSE_MICROSECONDS);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Subscriber verification aborted', ['error' => $e->getMessage()]);
            $tally['stopped'] = $tally['stopped'] ?? $e->getMessage();
        }

        return $tally;
    }

    /**
     * Ask Hunter about one row and record what it said.
     *
     * The ledger row is written for every answer, refusals included, so a bad
     * afternoon is readable afterwards. What is *not* written is a verdict on
     * a refusal or a transport failure: an address must not lose one of its
     * three attempts to a network that was down.
     */
    public function verifyOne(NewsletterSubscriber $subscriber, string $source = 'manual'): HunterResult
    {
        $result = $this->client->verify($subscriber->email);

        NewsletterVerification::create([
            'newsletter_subscriber_id' => $subscriber->id,
            'email' => $subscriber->email,
            'http_status' => $result->http,
            'status' => $result->status,
            'score' => $result->score,
            'source' => $source,
            'created_at' => now(),
        ]);

        $attempts = $subscriber->verification_attempts;

        if ($result->settled()) {
            $subscriber->forceFill([
                'verification' => EmailVerification::fromHunter($result->status, $attempts),
                'verification_result' => $result->status,
                'verification_score' => $result->score,
                'verification_attempts' => $attempts + 1,
                'verification_at' => now(),
            ])->save();
            $this->clearError();
        } elseif ($result->retryLater()) {
            $subscriber->forceFill([
                'verification' => EmailVerification::fromHunter('unknown', $attempts),
                'verification_result' => 'unknown',
                'verification_attempts' => $attempts + 1,
                'verification_at' => now(),
            ])->save();
            $this->clearError();
        } elseif ($result->unavailable()) {
            $subscriber->forceFill([
                'verification' => EmailVerification::Risky,
                'verification_result' => 'unavailable',
                'verification_attempts' => $attempts + 1,
                'verification_at' => now(),
            ])->save();
        } elseif ($result->stopsTheRun()) {
            $this->fail($result->message ?? 'Hunter answered '.$result->http.'.');
        } else {
            Log::warning('Hunter verification did not settle', [
                'email' => $subscriber->email, 'http' => $result->http, 'message' => $result->message,
            ]);
        }

        return $result;
    }

    /**
     * A person asking about one row, whatever its verdict.
     *
     * @throws RuntimeException with the sentence to show, when nothing was asked
     */
    public function recheck(NewsletterSubscriber $subscriber): NewsletterSubscriber
    {
        if (! HunterClient::configured()) {
            throw new RuntimeException('Add a Hunter API key under Settings → API keys first.');
        }

        $budget = $this->budget();

        if ($budget['cap'] === 0) {
            throw new RuntimeException('Verification is paused: the monthly allowance is set to 0.');
        }

        if ($budget['remaining'] === 0) {
            throw new RuntimeException(sprintf(
                "This month's allowance of %d verifications is used up. It resets on %s.",
                $budget['cap'], $budget['resets_on'],
            ));
        }

        // A Risky-by-exhaustion row gets its three attempts back; the person
        // pressing the button has decided it is worth asking again.
        $subscriber->forceFill(['verification_attempts' => 0])->save();

        $result = $this->verifyOne($subscriber, 'manual');

        if ($result->stopsTheRun()) {
            throw new RuntimeException($result->message ?? 'Hunter refused the request ('.$result->http.').');
        }

        if (! $result->reachedHunter()) {
            throw new RuntimeException('Hunter could not be reached: '.($result->message ?? 'no response').'.');
        }

        return $subscriber->refresh();
    }

    /**
     * Hunter's own figures, an hour old at most, or null with no key.
     *
     * Keyed on the key's hash so a rotated key is a fresh fetch without
     * anything having to remember to forget it.
     *
     * @return array{plan_name: ?string, reset_date: ?string, used: int, available: int, fetched_at: string}|null
     */
    public function accountCached(): ?array
    {
        $key = HunterClient::key();

        if ($key === null) {
            return null;
        }

        return Cache::remember(self::accountCacheKey($key), 3600, function () {
            try {
                return $this->client->account() + ['fetched_at' => now()->toIso8601String()];
            } catch (RuntimeException) {
                return null;
            }
        });
    }

    public static function forgetAccount(): void
    {
        if ($key = HunterClient::key()) {
            Cache::forget(self::accountCacheKey($key));
        }
    }

    public static function lastRunAt(): ?string
    {
        return Setting::get(self::LAST_RUN_KEY) ?: null;
    }

    public static function error(): ?string
    {
        return Setting::get(self::ERROR_KEY) ?: null;
    }

    /** The `mail_error` pattern: swallowing leaves a mark somebody can see. */
    public static function fail(string $message): void
    {
        Setting::put(self::ERROR_KEY, trim($message).' — '.now()->toDayDateTimeString());
    }

    public static function clearError(): void
    {
        if (self::error() !== null) {
            Setting::put(self::ERROR_KEY, null);
        }
    }

    private function copy(NewsletterSubscriber $subscriber, NewsletterVerification $earlier): void
    {
        $subscriber->forceFill([
            'verification' => EmailVerification::fromHunter((string) $earlier->status, EmailVerification::MAX_ATTEMPTS),
            'verification_result' => $earlier->status,
            'verification_score' => $earlier->score,
            'verification_attempts' => $subscriber->verification_attempts + 1,
            'verification_at' => now(),
        ])->save();

        NewsletterVerification::create([
            'newsletter_subscriber_id' => $subscriber->id,
            'email' => $subscriber->email,
            'http_status' => 200,
            'status' => $earlier->status,
            'score' => $earlier->score,
            'source' => 'ledger',
            'created_at' => now(),
        ]);
    }

    private function rememberAccount(array $account): void
    {
        if ($key = HunterClient::key()) {
            Cache::put(self::accountCacheKey($key), $account + ['fetched_at' => now()->toIso8601String()], 3600);
        }
    }

    private static function accountCacheKey(string $key): string
    {
        return 'hunter.account.'.substr(sha1($key), 0, 12);
    }
}
