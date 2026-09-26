<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ScanMailboxForSubscribers;
use App\Models\NewsletterImport;
use App\Models\Setting;
use App\Support\ImportUpload;
use App\Support\Net\PublicHost;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\CsvImporter;
use App\Support\Newsletter\MailboxImport;
use App\Support\Newsletter\ScanCredentials;
use App\Support\Newsletter\Spreadsheet;
use App\Support\QueueHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The CSV import wizard.
 *
 * Two endpoints for the five steps the specification describes, because only
 * two of them touch the server: `analyse` reads the file and reports what
 * *would* happen, and `store` commits. Choosing a file, mapping the columns
 * and picking groups all happen in the browser against the analysis.
 *
 * The file is held on the **private** disk between the two — the same disk
 * ticket attachments and CVs use. A spreadsheet of customer addresses is
 * exactly the sort of thing that must not be fetchable by URL, and the public
 * disk is where the media library puts things deliberately meant to be.
 */
class NewsletterImportController extends Controller
{
    /**
     * Read the file, guess the mapping, and report the counts. Writes no
     * subscribers.
     */
    public function analyse(Request $request): JsonResponse
    {
        $request->validate([
            /*
             * `mimes` alone here, which departs from the rule the careers form
             * documents — and the reason is worth stating.
             *
             * That rule pairs `mimes:` with `mimetypes:`, because a `.php`
             * renamed `.pdf` passes the first and fails the second. It cannot
             * be applied to a spreadsheet: an `.xlsx` is a zip, and browsers
             * report it as any of several types depending on the operating
             * system and what is installed — so a `mimetypes:` list either
             * refuses real spreadsheets or is so wide it asserts nothing.
             *
             * `mimes:` is worse than useless here rather than merely
             * unhelpful: it validates the extension *guessed from the MIME
             * type*, and an xlsx is a zip — so whether a real spreadsheet
             * passes depends on how complete the server's magic database is.
             * A file that imports on one machine and is refused on another is
             * the worst kind of rule.
             *
             * So: `extensions:` on the name, and the **bytes** checked in
             * `Spreadsheet::read()`, which dispatches on the magic number.
             * That is a stronger test than either — the legacy `.xls` is named
             * and refused below, and anything that is neither a zip nor text
             * yields no importable rows. Nothing here is executed, served or
             * kept: the file is deleted as soon as it has been read.
             */
            'file' => ['required', 'file', 'max:10240', 'extensions:csv,txt,xlsx'],
            'mapping' => ['sometimes', 'array'],
        ]);

        $file = $request->file('file');

        /*
         * The old binary `.xls` is refused by name rather than let through.
         *
         * It is a different format from `.xlsx` — an OLE compound document
         * rather than a zip of XML — and reading it genuinely does need a
         * library. Parsed as text it yields one unreadable column and several
         * thousand "not a valid address" rows, which reads as the importer
         * being broken rather than as the file being the wrong kind. Saying
         * what it is, and what to do about it, takes one sentence.
         */
        if (Spreadsheet::isLegacyExcel($file->getRealPath())) {
            throw ValidationException::withMessages([
                'file' => 'That is an old-format Excel file (.xls). Open it in Excel and use '
                    .'File → Save As → Excel Workbook (.xlsx), or CSV UTF-8, and upload that.',
            ]);
        }

        $path = $file->store('newsletter-imports', 'local');

        $peek = Spreadsheet::read(Storage::disk('local')->path($path), 5);
        $headers = $peek['headers'];

        // The submitted mapping wins where it exists, so re-analysing after
        // correcting a column does not throw the correction away. The sample
        // rows are passed so the email column can be found from the data when
        // no heading names it — including when there is no header row at all.
        $mapping = array_merge(Csv::guessMapping($headers, $peek['rows']), array_filter(
            (array) $request->input('mapping', []),
            fn ($v) => $v !== null && $v !== '',
        ));

        $analysis = CsvImporter::dryRun(Storage::disk('local')->path($path), $mapping);

        return response()->json(['data' => [
            // The stored path is handed back so `store` can find the file
            // again without a second upload. It is a hashed name under a
            // private disk and is checked on the way back in.
            'file' => $path,
            'original_name' => $file->getClientOriginalName(),
            'headers' => $analysis['headers'],
            'mapping' => $mapping,
            'counts' => $analysis['counts'],
            'domains' => $analysis['domains'],
            'roles' => $analysis['roles'],
            'problems' => $analysis['problems'],
            'preview' => $analysis['preview'],
        ]]);
    }

    /**
     * Commit an analysed file — or a mailbox scan that is ready.
     *
     * With `import_id` the row is a mailbox scan in `ready`: the file is the
     * one the scan wrote (the request's `file` is ignored — the server knows
     * where it put it), the mapping is the scan's, and `domains[]` and
     * `include_roles` are the review's decisions. Without it, the CSV wizard
     * as it always was.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'import_id' => ['sometimes', 'nullable', 'integer', 'exists:newsletter_imports,id'],
            'file' => ['required_without:import_id', 'nullable', 'string', 'max:255'],
            'original_name' => ['nullable', 'string', 'max:255'],
            'mapping' => ['required_without:import_id', 'nullable', 'array'],
            'mapping.email' => ['required_with:mapping', 'integer', 'min:0'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
            'domains' => ['sometimes', 'nullable', 'array', 'max:5000'],
            'domains.*' => ['string', 'max:255'],
            'include_roles' => ['sometimes', 'boolean'],
        ]);

        $domains = isset($data['domains']) && is_array($data['domains'])
            ? array_values(array_unique(array_map(fn ($d) => strtolower(trim((string) $d)), $data['domains'])))
            : null;
        $includeRoles = (bool) ($data['include_roles'] ?? true);

        if (! empty($data['import_id'])) {
            return $this->commitScan($request, (int) $data['import_id'], $data['mapping'] ?? null, $data['group_ids'] ?? [], $domains, $includeRoles);
        }

        /*
         * The path is checked rather than trusted.
         *
         * It comes back from the browser, so without this it is a
         * caller-supplied filesystem path — `../../.env` would be read and its
         * first column treated as email addresses. Pinned to the directory
         * this endpoint writes to, and existence-checked — by rebuilding it
         * from its last segment, since a prefix check alone let
         * `newsletter-imports/../store-imports/…` through. See `ImportUpload`.
         */
        $file = ImportUpload::resolve('newsletter-imports', (string) $data['file']);

        if ($file === null) {
            return response()->json(['message' => 'That upload has expired. Choose the file again.'], 422);
        }

        $data['file'] = $file;

        $import = NewsletterImport::create([
            'uploaded_by' => $request->user()?->id,
            'filename' => $data['original_name'] ?? basename((string) $data['file']),
            'status' => 'running',
        ]);

        $result = CsvImporter::run(
            $import,
            Storage::disk('local')->path((string) $data['file']),
            $data['mapping'],
            $data['group_ids'] ?? [],
            $domains,
            $includeRoles,
        );

        // The spreadsheet is deleted once it has been read. Keeping it would
        // leave a file of customer addresses on disk for no purpose the
        // `newsletter_imports` row does not already serve.
        Storage::disk('local')->delete((string) $data['file']);

        return response()->json(['data' => self::summary($result)], 201);
    }

    /**
     * @param  ?array<string, int|null>  $mapping
     * @param  array<int, int>  $groupIds
     * @param  ?list<string>  $domains
     */
    private function commitScan(Request $request, int $id, ?array $mapping, array $groupIds, ?array $domains, bool $includeRoles): JsonResponse
    {
        $import = NewsletterImport::findOrFail($id);

        if (! $import->isMailbox() || $import->status !== 'ready' || blank($import->file)) {
            return response()->json(['message' => 'That scan is not ready to import — it may have been imported, discarded or expired.'], 422);
        }

        if (! Storage::disk('local')->exists((string) $import->file)) {
            $import->update(['status' => 'expired', 'file' => null]);

            return response()->json(['message' => 'That scan\'s result has expired. Scan the mailbox again.'], 422);
        }

        $mapping ??= $import->analysis['mapping'] ?? ScanMailboxForSubscribers::MAPPING;
        $import->update(['status' => 'running']);

        $result = CsvImporter::run($import, Storage::disk('local')->path((string) $import->file), $mapping, $groupIds, $domains, $includeRoles);

        Storage::disk('local')->delete((string) $import->file);
        $result->update(['file' => null, 'expires_at' => null]);
        ScanMailboxForSubscribers::release($result);

        return response()->json(['data' => self::summary($result->fresh())], 201);
    }

    /**
     * Start reading a mailbox for addresses. 202: the work is queued.
     *
     * The credentials for a one-off IMAP source go to `ScanCredentials`,
     * never to a settings row; for a consent source only the provider's name
     * is stored, and the job mints its own token per slice.
     */
    public function scan(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source' => ['required', Rule::in(['connected', 'imap'])],
            'since' => ['nullable', 'date_format:Y-m-d'],
            'until' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:since'],
            'include_junk' => ['sometimes', 'boolean'],
            'imap' => ['required_if:source,imap', 'array'],
            'imap.host' => ['required_if:source,imap', 'string', 'max:255'],
            /*
             * The two ports IMAP is served on, and nothing else: with any
             * port and any host, "scan this mailbox" was a campaign
             * manager's way to probe what answers inside the network, the
             * error telling open from closed.
             */
            'imap.port' => ['required_if:source,imap', 'integer', Rule::in([143, 993])],
            'imap.encryption' => ['required_if:source,imap', Rule::in(['ssl', 'tls', 'none'])],
            'imap.username' => ['required_if:source,imap', 'string', 'max:255'],
            'imap.password' => ['required_if:source,imap', 'string', 'max:1000'],
        ], [
            'until.after_or_equal' => 'The end of the range is before its start.',
        ]);

        if (NewsletterImport::query()->mailbox()->inFlight()->exists()) {
            throw ValidationException::withMessages(['source' => 'A scan is already running. Wait for it to finish, or discard it.']);
        }

        if (! QueueHealth::delivering()) {
            throw ValidationException::withMessages([
                'queue' => 'Nothing is draining the queue, so the scan would never start. On the server add the cron entry '
                    .'`* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`, or run `php artisan queue:work`.',
            ]);
        }

        if ($data['source'] === 'connected') {
            $provider = MailboxImport::connectedProvider();

            if ($provider === null) {
                throw ValidationException::withMessages(['source' => 'No mailbox is connected. Connect one first.']);
            }

            $account = (string) Setting::get('newsletter_oauth_account');
            $connection = ['source' => $provider->value];
        } else {
            // A public host only: the server connects to it from inside the
            // network, on the say-so of whoever typed it.
            if ($refusal = PublicHost::refusal(trim((string) $data['imap']['host']))) {
                throw ValidationException::withMessages(['imap.host' => $refusal.' A mailbox has to be on a public host.']);
            }

            $account = trim((string) $data['imap']['username']);
            $connection = [
                'source' => 'imap',
                'host' => trim((string) $data['imap']['host']),
                'port' => (int) $data['imap']['port'],
                'encryption' => (string) $data['imap']['encryption'],
                'username' => $account,
                'password' => (string) $data['imap']['password'],
            ];
        }

        $range = match (true) {
            filled($data['since'] ?? null) && filled($data['until'] ?? null) => "{$data['since']} to {$data['until']}",
            filled($data['since'] ?? null) => "since {$data['since']}",
            filled($data['until'] ?? null) => "until {$data['until']}",
            default => 'all dates',
        };

        $import = NewsletterImport::create([
            'uploaded_by' => $request->user()?->id,
            'filename' => "{$account} (mailbox, {$range})",
            'source' => NewsletterImport::SOURCE_MAILBOX,
            'status' => 'pending',
            'progress' => [
                'since' => $data['since'] ?? null,
                'until' => $data['until'] ?? null,
                'include_junk' => (bool) ($data['include_junk'] ?? false),
                'source' => $data['source'],
                'started_at' => now()->toIso8601String(),
            ],
        ]);

        $key = ScanCredentials::put($import->id, $connection);
        ScanMailboxForSubscribers::dispatch($import->id, $key);

        return response()->json(['data' => self::summary($import) + ['delivering' => true]], 202);
    }

    /** One import, with its progress and — once ready — its review. What the screen polls. */
    public function show(NewsletterImport $import): JsonResponse
    {
        return response()->json(['data' => self::summary($import)]);
    }

    /**
     * Discard a mailbox scan that has not been committed. A running chain
     * sees `cancelled` at the top of its next slice and stops there,
     * forgetting what it held.
     */
    public function destroy(NewsletterImport $import): JsonResponse
    {
        if (! $import->isMailbox() || ! in_array($import->status, ['pending', 'scanning', 'ready', 'failed'], true)) {
            return response()->json(['message' => 'Only a mailbox scan that has not been imported can be discarded.'], 422);
        }

        if (filled($import->file) && Storage::disk('local')->exists((string) $import->file)) {
            Storage::disk('local')->delete((string) $import->file);
        }

        $import->update(['status' => 'cancelled', 'file' => null, 'expires_at' => null]);
        ScanMailboxForSubscribers::release($import);

        return response()->json(['data' => self::summary($import->fresh())]);
    }

    /**
     * The row as every endpoint here reports it. `analysis` rides only on a
     * scan that is ready — it is the review, and a screen polling a running
     * scan every three seconds does not want it repeated.
     *
     * @return array<string, mixed>
     */
    public static function summary(NewsletterImport $import): array
    {
        return [
            'id' => $import->id,
            'source' => $import->source,
            'status' => $import->status,
            'filename' => $import->filename,
            'total_rows' => $import->total_rows,
            'imported' => $import->imported,
            'updated' => $import->updated,
            'invalid' => $import->invalid,
            'duplicates' => $import->duplicates,
            'suppressed' => $import->suppressed,
            'excluded' => $import->excluded,
            'progress' => $import->progress,
            'analysis' => $import->status === 'ready' ? $import->analysis : null,
            'error' => $import->error,
            'expires_at' => $import->expires_at?->toIso8601String(),
            'created_at' => $import->created_at?->toIso8601String(),
        ];
    }

    /** Past imports, so "where did these addresses come from" has an answer. */
    public function index(Request $request): JsonResponse
    {
        $imports = NewsletterImport::with('uploader:id,name')
            ->latest('id')
            ->paginate(min($request->integer('per_page', 20), 100));

        $imports->getCollection()->transform(fn (NewsletterImport $i) => [
            'id' => $i->id,
            'filename' => $i->filename,
            'source' => $i->source,
            'status' => $i->status,
            'total_rows' => $i->total_rows,
            'imported' => $i->imported,
            'updated' => $i->updated,
            'invalid' => $i->invalid,
            'duplicates' => $i->duplicates,
            'suppressed' => $i->suppressed,
            'excluded' => $i->excluded,
            'uploaded_by' => $i->uploader?->name,
            'created_at' => $i->created_at?->toIso8601String(),
        ]);

        return response()->json($imports->toArray());
    }

    /** The rows one import could not take, with the reason for each. */
    public function rows(Request $request, NewsletterImport $import): JsonResponse
    {
        $rows = $import->rows()
            ->when($request->filled('outcome'), fn ($q) => $q->where('outcome', $request->string('outcome')))
            ->orderBy('line_number')
            ->paginate(min($request->integer('per_page', 50), 200));

        return response()->json($rows->toArray());
    }
}
