<?php

namespace Tests\Support;

use App\Support\InboundMail\HeaderRow;
use App\Support\InboundMail\MailAddress;
use App\Support\InboundMail\MailboxScanner;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * A mailbox's headers made of arrays, so the newsletter's scan can be tested
 * without IMAP — the `FakeMailbox` idea, for the other contract.
 *
 * Bind it in the container (`$this->app->instance(MailboxScanner::class, …)`)
 * and every decision from "a folder was listed" to "a CSV is on disk" runs
 * for real. `$asked` records every `scanHeaders` call, which is how a test
 * proves a paused scan resumed from its cursor rather than from the start.
 */
class FakeMailboxScanner implements MailboxScanner
{
    /** @var list<array{path: string, name: string, messages: int, no_select: bool, flags: list<string>}> */
    public array $folders = [];

    /** @var array<string, list<HeaderRow>> rows by folder path */
    public array $rows = [];

    /** @var list<array{path: string, after_uid: int, since: ?string, until: ?string}> */
    public array $asked = [];

    /** When set, every call answers with this refusal, the way a server would. */
    public ?string $refuse = null;

    public string $account = 'desk@example.test';

    public function account(): string
    {
        return $this->account;
    }

    public function folders(): array
    {
        $this->refuseIfAsked();

        return $this->folders;
    }

    public function scanHeaders(string $folderPath, int $afterUid, int $chunk, ?CarbonImmutable $since, ?CarbonImmutable $until, callable $each): void
    {
        $this->refuseIfAsked();
        $this->asked[] = [
            'path' => $folderPath, 'after_uid' => $afterUid,
            'since' => $since?->toDateString(), 'until' => $until?->toDateString(),
        ];

        foreach ($this->rows[$folderPath] ?? [] as $row) {
            if ($row->uid <= $afterUid) {
                continue;
            }
            if ($each($row) === false) {
                return;
            }
        }
    }

    /** A folder entry with sensible defaults. */
    public static function folder(string $path, int $messages = 0, array $flags = [], ?string $name = null, bool $noSelect = false): array
    {
        $segments = explode('/', $path);

        return ['path' => $path, 'name' => $name ?? (string) end($segments), 'messages' => $messages, 'no_select' => $noSelect, 'flags' => $flags];
    }

    /**
     * A header row. Addresses are `email` or `Name <email>` strings.
     *
     * @param  list<string>  $to
     * @param  list<string>  $cc
     */
    public static function row(int $uid, array $to = [], array $cc = [], ?string $from = null, ?string $messageId = null, ?string $date = '2026-06-01 10:00:00'): HeaderRow
    {
        return new HeaderRow(
            uid: $uid,
            messageId: $messageId ?? "<msg-{$uid}@example.test>",
            from: $from !== null ? self::address($from) : null,
            to: array_map(self::address(...), $to),
            cc: array_map(self::address(...), $cc),
            date: $date !== null ? CarbonImmutable::parse($date) : null,
        );
    }

    public static function address(string $spec): MailAddress
    {
        if (preg_match('/^(.*?)<([^>]+)>$/', trim($spec), $m) === 1) {
            return new MailAddress(strtolower(trim($m[2])), trim($m[1], " \"'") ?: null);
        }

        return new MailAddress(strtolower(trim($spec)));
    }

    private function refuseIfAsked(): void
    {
        if ($this->refuse !== null) {
            throw new RuntimeException($this->refuse);
        }
    }
}
