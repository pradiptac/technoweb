<?php

namespace App\Support\Newsletter;

use App\Support\InboundMail\HeaderRow;
use App\Support\InboundMail\MailAddress;
use App\Support\InboundMail\MailboxScanner;
use Carbon\CarbonImmutable;

/**
 * Walks a mailbox's headers and collects who it has written to.
 *
 * To and Cc, in every folder the policy allows, and **From nowhere**: in
 * the Sent folder From is us, and in the Inbox From is whoever writes *to*
 * us — vendors, notifications, mailing lists — the audience that never
 * asked to hear from this company and the one most likely to complain
 * when it does. The client's brief was To and Cc, and that is the right
 * line; `include_from` is the obvious follow-up switch if it is ever asked
 * for.
 *
 * Pure: everything it touches arrives as an argument — the scanner, the
 * state, the own-address list, the window, the deadline — and it returns
 * whether it finished or ran out of time, so the queued job around it is
 * ten lines and the test drives it with a fake scanner and a zero budget.
 */
final class MailboxHarvester
{
    public const DONE = 'done';

    public const PAUSED = 'paused';

    public const CHUNK = 200;

    /**
     * @param  list<string>  $own  lower-cased addresses never to collect
     * @return self::DONE|self::PAUSED
     */
    public function run(
        MailboxScanner $scanner,
        HarvestState $state,
        array $own,
        bool $includeJunk,
        ?CarbonImmutable $since,
        ?CarbonImmutable $until,
        CarbonImmutable $deadline,
    ): string {
        if ($state->folders === []) {
            $state->folders = $this->classify($scanner->folders(), $includeJunk);
            $state->cursor = ['index' => 0, 'after_uid' => 0];
        }

        $own = array_flip(array_map('strtolower', [...$own, $scanner->account()]));
        $count = count($state->folders);

        while ($state->cursor['index'] < $count) {
            $folder = $state->folders[$state->cursor['index']];

            if ($folder['skip'] !== null) {
                $state->cursor = ['index' => $state->cursor['index'] + 1, 'after_uid' => 0];

                continue;
            }

            $finished = true;

            $scanner->scanHeaders(
                $folder['path'],
                $state->cursor['after_uid'],
                self::CHUNK,
                $since,
                $until,
                function (HeaderRow $row) use ($state, $folder, $own, $since, $until, $deadline, &$finished): bool {
                    $this->take($row, $state, $folder, $own, $since, $until);
                    $state->cursor['after_uid'] = $row->uid;

                    if (CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                        $finished = false;

                        return false;
                    }

                    return true;
                },
            );

            if (! $finished) {
                return self::PAUSED;
            }

            $state->cursor = ['index' => $state->cursor['index'] + 1, 'after_uid' => 0];
        }

        return self::DONE;
    }

    /**
     * @param  list<array{path: string, name: string, messages: int, no_select: bool, flags: list<string>}>  $folders
     * @return list<array{path: string, name: string, messages: int, skip: ?string, sent: bool}>
     */
    private function classify(array $folders, bool $includeJunk): array
    {
        $out = [];

        foreach ($folders as $folder) {
            $out[] = [
                'path' => $folder['path'],
                'name' => $folder['name'],
                'messages' => (int) $folder['messages'],
                'skip' => FolderPolicy::classify($folder, $includeJunk),
                'sent' => FolderPolicy::isSent($folder),
            ];
        }

        return $out;
    }

    /**
     * @param  array{path: string, name: string, sent: bool}  $folder
     * @param  array<string, int>  $own
     */
    private function take(HeaderRow $row, HarvestState $state, array $folder, array $own, ?CarbonImmutable $since, ?CarbonImmutable $until): void
    {
        // Servers that ignore SINCE/BEFORE hand back everything; the Date
        // header is the second opinion. A message with no date is kept.
        if ($row->date !== null) {
            if ($since !== null && $row->date->lessThan($since->startOfDay())) {
                return;
            }
            if ($until !== null && $row->date->greaterThan($until->endOfDay())) {
                return;
            }
        }

        // One message, once — whatever labels Gmail has filed it under.
        $messageId = strtolower(trim((string) $row->messageId, " <>\t\r\n"));
        if ($messageId !== '') {
            $key = substr(sha1($messageId), 0, 16);
            if (isset($state->seen[$key])) {
                return;
            }
            $state->seen[$key] = 1;
        }

        $state->messages++;
        $when = $row->date?->toDateString();

        foreach ([...$row->to, ...$row->cc] as $address) {
            $this->collect($address, $state, $folder, $own, $when);
        }
    }

    /**
     * @param  array{name: string, sent: bool}  $folder
     * @param  array<string, int>  $own
     */
    private function collect(MailAddress $address, HarvestState $state, array $folder, array $own, ?string $when): void
    {
        $email = strtolower(trim($address->email));

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL) || isset($own[$email])) {
            return;
        }

        if (! isset($state->addresses[$email])) {
            if (count($state->addresses) >= Csv::MAX_ROWS) {
                $state->capped = true;

                return;
            }

            $state->addresses[$email] = ['names' => [], 'count' => 0, 'sent' => 0, 'first' => null, 'last' => null, 'folders' => []];
        }

        $entry = &$state->addresses[$email];
        $entry['count']++;
        $entry['sent'] += $folder['sent'] ? 1 : 0;
        $entry['folders'][$folder['name']] = ($entry['folders'][$folder['name']] ?? 0) + 1;

        $name = trim((string) $address->name, " \t\"'");
        if ($name !== '' && strcasecmp($name, $email) !== 0 && ! str_contains($name, '@')) {
            $entry['names'][$name] = ($entry['names'][$name] ?? 0) + 1;
        }

        if ($when !== null) {
            $entry['first'] = $entry['first'] === null || $when < $entry['first'] ? $when : $entry['first'];
            $entry['last'] = $entry['last'] === null || $when > $entry['last'] ? $when : $entry['last'];
        }

        unset($entry);
    }
}
