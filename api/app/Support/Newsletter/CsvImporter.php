<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterImport;
use App\Models\NewsletterImportRow;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;

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
     * @param  array<string, int|null>  $mapping
     * @return array<string, mixed>
     */
    public static function dryRun(string $path, array $mapping, int $limit = Csv::MAX_ROWS): array
    {
        $parsed = Csv::read($path, $limit);
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

            if (NewsletterSuppression::has($email)) {
                $counts['suppressed']++;
                $samples[] = ['line' => $line, 'email' => $email, 'outcome' => 'suppressed', 'reason' => 'Has asked not to be contacted.'];

                continue;
            }

            if (NewsletterSubscriber::where('email', $email)->exists()) {
                $counts['already_subscribed']++;

                continue;
            }

            $counts['valid']++;
        }

        return [
            'headers' => $parsed['headers'],
            'counts' => $counts,
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
     * @param  array<string, int|null>  $mapping
     * @param  array<int, int>  $groupIds
     */
    public static function run(NewsletterImport $import, string $path, array $mapping, array $groupIds): NewsletterImport
    {
        $parsed = Csv::read($path);
        $emailColumn = $mapping['email'] ?? null;

        $tally = ['imported' => 0, 'updated' => 0, 'invalid' => 0, 'duplicates' => 0, 'suppressed' => 0];
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

            $result = SubscriberIntake::take(
                $email,
                self::attributes($row, $mapping),
                $groupIds,
                'import',
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
