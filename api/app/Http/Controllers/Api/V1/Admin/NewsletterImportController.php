<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\NewsletterImport;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\CsvImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
             * `mimes` **and** `mimetypes`, the rule the careers form
             * documents: a `.php` renamed `.csv` passes the first and fails
             * the second. `text/plain` is in the list because that is what a
             * CSV written by hand actually reports as — refusing it rejects
             * half the real files people upload.
             */
            'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel'],
            'mapping' => ['sometimes', 'array'],
        ]);

        $file = $request->file('file');
        $path = $file->store('newsletter-imports', 'local');

        $headers = Csv::read(Storage::disk('local')->path($path), 5)['headers'];

        // The submitted mapping wins where it exists, so re-analysing after
        // correcting a column does not throw the correction away.
        $mapping = array_merge(Csv::guessMapping($headers), array_filter(
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
