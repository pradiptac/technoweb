<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\NewsletterImport;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\CsvImporter;
use App\Support\Newsletter\Spreadsheet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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
            'problems' => $analysis['problems'],
            'preview' => $analysis['preview'],
        ]]);
    }

    /** Commit an analysed file. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'string', 'max:255'],
            'original_name' => ['nullable', 'string', 'max:255'],
            'mapping' => ['required', 'array'],
            'mapping.email' => ['required', 'integer', 'min:0'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
        ]);

        /*
         * The path is checked rather than trusted.
         *
         * It comes back from the browser, so without this it is a
         * caller-supplied filesystem path — `../../.env` would be read and its
         * first column treated as email addresses. Pinned to the directory
         * this endpoint writes to, and existence-checked.
         */
        if (! str_starts_with($data['file'], 'newsletter-imports/') || ! Storage::disk('local')->exists($data['file'])) {
            return response()->json(['message' => 'That upload has expired. Choose the file again.'], 422);
        }

        $import = NewsletterImport::create([
            'uploaded_by' => $request->user()?->id,
            'filename' => $data['original_name'] ?? basename($data['file']),
            'status' => 'running',
        ]);

        $result = CsvImporter::run(
            $import,
            Storage::disk('local')->path($data['file']),
            $data['mapping'],
            $data['group_ids'] ?? [],
        );

        // The spreadsheet is deleted once it has been read. Keeping it would
        // leave a file of customer addresses on disk for no purpose the
        // `newsletter_imports` row does not already serve.
        Storage::disk('local')->delete($data['file']);

        return response()->json(['data' => [
            'id' => $result->id,
            'filename' => $result->filename,
            'total_rows' => $result->total_rows,
            'imported' => $result->imported,
            'updated' => $result->updated,
            'invalid' => $result->invalid,
            'duplicates' => $result->duplicates,
            'suppressed' => $result->suppressed,
        ]], 201);
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
            'status' => $i->status,
            'total_rows' => $i->total_rows,
            'imported' => $i->imported,
            'updated' => $i->updated,
            'invalid' => $i->invalid,
            'duplicates' => $i->duplicates,
            'suppressed' => $i->suppressed,
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
