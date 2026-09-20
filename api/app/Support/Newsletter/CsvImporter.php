<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterImport;
use App\Models\NewsletterImportRow;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use Illuminate\Database\Eloquent\Model;

/**
 * Turning an uploaded spreadsheet into subscribers.
 *
 * Two passes over the same file, deliberately. The first is a **dry run** that
 * writes nothing and returns the counts the mapping screen shows; the second
 * commits. The alternative — import and report afterwards — means the moment
 * somebody discovers they mapped "company" onto the surname column is the
 * moment after twelve hundred rows have been written, and there is no undo for
 * a mailing list.
 *
 * Every decision about an individual address is `SubscriberIntake`'s, not this
 * class's. That is what keeps a suppressed address refused whether it arrives
 * through a spreadsheet, the signup form or a manual add.
 */
class CsvImporter
{
    /**
     * Read the file and report what *would* happen. Writes nothing.
     *
     * Two passes rather than a query per row: the addresses are gathered
     * first, then asked about in batches of a thousand — a mailbox scan
     * hands this twenty thousand rows, and twenty thousand `exists()` calls
     * inside a queued job is the difference between seconds and minutes.
     *
     * The `domains` block is for the mailbox review: every domain with its
     * counts, a sample, and whether it is ticked by default (our own domain
     * and sending infrastructure are not). The CSV wizard ignores it.
     *
     * @param  array<string, int|null>  $mapping
     * @param  list<string>  $ownDomains  lower-cased; what `domains[].kind` calls "own"
     * @return array<string, mixed>
     */
    public static function dryRun(string $path, array $mapping, int $limit = Csv::MAX_ROWS, array $ownDomains = []): array
    {
        $parsed = Spreadsheet::read($path, $limit);
        $emailColumn = $mapping['email'] ?? null;

        $counts = [
            'total' => count($parsed['rows']),
            'valid' => 0,
            'invalid' => 0,
            'duplicates' => 0,
            'already_subscribed' => 0,
            'suppressed' => 0,
        ];

        $samples = [];
        // Duplicates *within the file*, which is a different number from
        // addresses already on the list and is the one people are surprised
        // by — a spreadsheet joined from two sources routinely repeats.
        $seen = [];
        /** @var array<string, int> email => line, the ones to ask the database about */
        $candidates = [];

        foreach ($parsed['rows'] as $i => $row) {
            $email = $emailColumn === null ? null : strtolower(trim($row[$emailColumn] ?? ''));
            $line = $i + 2; // +1 for the header, +1 because people count from 1

            if (blank($email) || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $counts['invalid']++;
                $samples[] = ['line' => $line, 'email' => $email, 'outcome' => 'invalid', 'reason' => 'Not a valid email address.'];

                continue;
            }

            if (isset($seen[$email])) {
                $counts['duplicates']++;
                $samples[] = ['line' => $line, 'email' => $email, 'outcome' => 'duplicate', 'reason' => 'Repeated in this file.'];

                continue;
            }

            $seen[$email] = true;
            $candidates[$email] = $line;
        }

        $suppressed = self::known(NewsletterSuppression::class, array_keys($candidates));
        $subscribed = self::known(NewsletterSubscriber::class, array_keys($candidates));

        /** @var array<string, array{addresses: int, valid: int, role: int, sample: list<string>}> */
        $domains = [];
        $roles = ['addresses' => 0, 'sample' => []];

        foreach ($candidates as $email => $line) {
            $verdict = isset($suppressed[$email]) ? 'suppressed' : (isset($subscribed[$email]) ? 'already_subscribed' : 'valid');

            if ($verdict === 'suppressed') {
                $counts['suppressed']++;
                $samples[] = ['line' => $line, 'email' => $email, 'outcome' => 'suppressed', 'reason' => 'Has asked not to be contacted.'];
            } elseif ($verdict === 'already_subscribed') {
                $counts['already_subscribed']++;
            } else {
                $counts['valid']++;
            }

            $domain = AddressKinds::domain($email);
            $domains[$domain] ??= ['addresses' => 0, 'valid' => 0, 'role' => 0, 'sample' => []];
            $domains[$domain]['addresses']++;
            $isRole = AddressKinds::isRole($email);

            if ($verdict === 'valid') {
                $domains[$domain]['valid']++;
                if ($isRole) {
                    $domains[$domain]['role']++;
                    $roles['addresses']++;
                    if (count($roles['sample']) < 5) {
                        $roles['sample'][] = $email;
                    }
                }
            }

            if (count($domains[$domain]['sample']) < 3) {
                $domains[$domain]['sample'][] = $email;
            }
        }

        uasort($domains, fn (array $a, array $b) => [$b['addresses'], $a['sample'][0] ?? ''] <=> [$a['addresses'], $b['sample'][0] ?? '']);

        $domainRows = [];
        foreach ($domains as $domain => $info) {
            $kind = AddressKinds::domainKind((string) $domain, $ownDomains);
            $domainRows[] = ['domain' => (string) $domain, 'kind' => $kind, 'default' => $kind === null] + $info;
        }

        return [
            'headers' => $parsed['headers'],
            'counts' => $counts,
            'domains' => $domainRows,
            'roles' => $roles,
            // Capped: a file of ten thousand bad rows should not put ten
            // thousand lines on a screen. Enough to see the shape of the
            // problem, which is what the mapping step is for.
            'problems' => array_slice($samples, 0, 50),
            // The first few rows as they map, so somebody can see that
            // "first_name" really is the first name before committing.
            'preview' => array_map(
                fn ($row) => self::attributes($row, $mapping),
                array_slice($parsed['rows'], 0, 5),
            ),
        ];
    }

    /**
     * Commit the file.
     *
     * `$domains` and `$includeRoles` are the mailbox review's decisions: a
     * row whose domain was unticked, or a role address when those were
     * left out, is counted as `excluded` and skipped — a count, not a
     * `NewsletterImportRow` each, because a deliberately unticked domain of
     * four thousand addresses is a decision and not four thousand problems.
     *
     * @param  array<string, int|null>  $mapping
     * @param  array<int, int>  $groupIds
     * @param  ?list<string>  $domains  lower-cased; null means every domain
     */
    public static function run(NewsletterImport $import, string $path, array $mapping, array $groupIds, ?array $domains = null, bool $includeRoles = true): NewsletterImport
    {
        $parsed = Spreadsheet::read($path);
        $emailColumn = $mapping['email'] ?? null;
        $allowed = $domains === null ? null : array_flip(array_map('strtolower', $domains));
        $source = $import->isMailbox() ? 'mailbox' : 'import';

        $tally = ['imported' => 0, 'updated' => 0, 'invalid' => 0, 'duplicates' => 0, 'suppressed' => 0, 'excluded' => 0];
        $seen = [];
        $problems = [];

        foreach ($parsed['rows'] as $i => $row) {
            $line = $i + 2;
            $email = $emailColumn === null ? null : trim($row[$emailColumn] ?? '');
            $key = strtolower((string) $email);

            if ($key !== '' && isset($seen[$key])) {
                $tally['duplicates']++;
                $problems[] = self::problem($import, $line, $email, 'duplicate', 'Repeated in this file.');

                continue;
            }

            $seen[$key] = true;

            if ($key !== '' && (
                ($allowed !== null && ! isset($allowed[AddressKinds::domain($key)]))
                || (! $includeRoles && AddressKinds::isRole($key))
            )) {
                $tally['excluded']++;

                continue;
            }

            $result = SubscriberIntake::take(
                $email,
                self::attributes($row, $mapping),
                $groupIds,
                $source,
            );

            match ($result['outcome']) {
                SubscriberIntake::CREATED => $tally['imported']++,
                SubscriberIntake::UPDATED => $tally['updated']++,
                SubscriberIntake::DUPLICATE => $tally['duplicates']++,
                SubscriberIntake::SUPPRESSED => $tally['suppressed']++,
                SubscriberIntake::INVALID => $tally['invalid']++,
                default => null,
            };

            if (in_array($result['outcome'], [SubscriberIntake::INVALID, SubscriberIntake::SUPPRESSED], true)) {
                $problems[] = self::problem($import, $line, $email, $result['outcome'], $result['reason']);
            }
        }

        // One insert rather than a row at a time: a file with two thousand bad
        // lines would otherwise be two thousand round trips inside a request
        // that is already reading a file.
        foreach (array_chunk($problems, 500) as $chunk) {
            NewsletterImportRow::insert($chunk);
        }

        $import->update([
            'status' => 'completed',
            'mapping' => $mapping,
            'total_rows' => count($parsed['rows']),
            ...$tally,
        ]);

        return $import->fresh();
    }

    /**
     * Which of these addresses the table holds, in batches, lower-cased.
     *
     * @param  class-string<Model>  $model
     * @param  list<string>  $emails
     * @return array<string, true>
     */
    private static function known(string $model, array $emails): array
    {
        $found = [];

        foreach (array_chunk($emails, 1000) as $chunk) {
            foreach ($model::query()->whereIn('email', $chunk)->pluck('email') as $email) {
                $found[strtolower((string) $email)] = true;
            }
        }

        return $found;
    }

    /** @return array<string, string|null> */
    private static function attributes(array $row, array $mapping): array
    {
        $get = fn (string $field) => isset($mapping[$field]) && $mapping[$field] !== null
            ? trim((string) ($row[$mapping[$field]] ?? ''))
            : null;

        return [
            'email' => $get('email'),
            'first_name' => $get('first_name'),
            'last_name' => $get('last_name'),
            'company' => $get('company'),
            'phone' => $get('phone'),
        ];
    }

    private static function problem(NewsletterImport $import, int $line, ?string $email, string $outcome, ?string $reason): array
    {
        return [
            'newsletter_import_id' => $import->id,
            'line_number' => $line,
            'email' => $email === '' ? null : mb_substr((string) $email, 0, 190),
            'outcome' => $outcome,
            'reason' => $reason,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
