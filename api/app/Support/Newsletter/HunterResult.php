<?php

namespace App\Support\Newsletter;

/**
 * One answer from Hunter, whatever kind of answer it was.
 *
 * `http` is the whole story of what happened: 200 carries a `status`, 202
 * and 222 mean "ask again", 401 and 429 mean stop, 451 means never ask about
 * this one, 0 means the request never arrived.
 */
final class HunterResult
{
    public function __construct(
        public readonly int $http,
        public readonly ?string $status,
        public readonly ?int $score,
        public readonly ?string $message = null,
    ) {}

    public function settled(): bool
    {
        return $this->http === 200 && $this->status !== null;
    }

    /** A "not yet" — Hunter is still looking, or the remote server would not talk. */
    public function retryLater(): bool
    {
        return in_array($this->http, [202, 222], true);
    }

    /** A refusal that ends the run: the key is wrong or the plan is spent. */
    public function stopsTheRun(): bool
    {
        return in_array($this->http, [401, 429], true);
    }

    /** Hunter will not process this address (a personal-data request). */
    public function unavailable(): bool
    {
        return $this->http === 451;
    }

    public function reachedHunter(): bool
    {
        return $this->http > 0;
    }
}
