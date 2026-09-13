<?php

namespace App\Enums;

/**
 * What Hunter said about an address, reduced to what the shop does about it.
 *
 * Hunter answers six ways (`valid`, `webmail`, `accept_all`, `invalid`,
 * `disposable`, `unknown`); this enum answers the only question a send
 * asks — may this address be mailed — and keeps the raw verdict beside it
 * on `verification_result` for whoever wants to know why.
 *
 * `isSendable()` is the one definition of "excluded by verification", and
 * `NewsletterSubscriber::canReceive()`, `AudienceResolver` and
 * `SendCampaignBatch` all read it. A verdict here is a **prediction**, so it
 * never reaches the suppression list: suppression is for facts — a bounce, an
 * unsubscribe — and a prediction staff can overrule by pressing Re-check.
 *
 * A non-null column with an `Unverified` case rather than a nullable one, so
 * the cast never yields null and the exclusion clause needs no `orWhereNull`.
 */
enum EmailVerification: string
{
    /** Never asked. */
    case Unverified = 'unverified';

    /** Hunter could not say yet (`unknown`, 202, 222); asked again on a later pass. */
    case Pending = 'pending';

    /** `valid` or `webmail` — a mailbox that exists. */
    case Verified = 'verified';

    /** `accept_all`, or `unknown` after every retry: cannot be confirmed, still sent to. */
    case Risky = 'risky';

    case Invalid = 'invalid';

    case Disposable = 'disposable';

    /** How many times an address that answers `unknown` is asked before it is called Risky. */
    public const MAX_ATTEMPTS = 3;

    public function label(): string
    {
        return match ($this) {
            self::Unverified => 'Not checked',
            self::Pending => 'Checking',
            self::Verified => 'Verified',
            self::Risky => 'Risky',
            self::Invalid => 'Invalid',
            self::Disposable => 'Disposable',
        };
    }

    /** May a campaign go to this address. Everything but the two Hunter is sure about. */
    public function isSendable(): bool
    {
        return ! in_array($this, [self::Invalid, self::Disposable], true);
    }

    /** A verdict that will not be asked about again by the scheduled pass. */
    public function isFinal(): bool
    {
        return ! in_array($this, [self::Unverified, self::Pending], true);
    }

    /** @return list<string> the values `AudienceResolver` excludes */
    public static function unsendableValues(): array
    {
        return array_values(array_map(
            fn (self $c) => $c->value,
            array_filter(self::cases(), fn (self $c) => ! $c->isSendable()),
        ));
    }

    /**
     * Hunter's `status` to a verdict.
     *
     * `webmail` is a real mailbox at Gmail or Outlook and is Verified, not
     * Risky — a list of Indian SMEs is largely webmail. `unknown` is Pending
     * until the attempt cap, then Risky: a mail server that will not answer
     * three times is one that will not answer.
     */
    public static function fromHunter(string $status, int $attemptsSoFar): self
    {
        return match ($status) {
            'valid', 'webmail' => self::Verified,
            'accept_all' => self::Risky,
            'invalid' => self::Invalid,
            'disposable' => self::Disposable,
            default => $attemptsSoFar + 1 >= self::MAX_ATTEMPTS ? self::Risky : self::Pending,
        };
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
