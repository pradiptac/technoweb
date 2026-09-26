<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\StoreProductImport;
use App\Support\ImportUpload;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\Spreadsheet;
use App\Support\Store\CatalogueExport;
use App\Support\Store\CatalogueImport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The catalogue as a spreadsheet, both ways.
 *
 * `export` writes every product and every variation in the columns
 * `analyse` and `store` read back, so the file somebody edits is the file
 * they upload. The import is the newsletter wizard's shape — a dry run that
 * writes nothing, then a commit of the same file — and the file waits on the
 * **private** disk between the two, where a spreadsheet of prices and stock
 * belongs. All three are `role:store_manager`, the role that owns the
 * figures they move.
 */
class ProductImportController extends Controller
{
    /**
     * Every product and variation, as a CSV.
     *
     * Streamed row by row through the one CSV writer, which escapes every
     * cell beginning `=`, `+`, `-` or `@` — an export is a file somebody
     * opens in Excel, and a product named `=HYPERLINK(...)` is an attack on
     * whoever does.
     */
    public function export(): StreamedResponse
    {
        $name = 'technoware-store-catalogue-'.now()->toDateString().'.csv';

        return response()->streamDownload(function () {
            $handle = fopen('php://output', 'w');

            Csv::write($handle, CatalogueImport::FIELDS, CatalogueExport::rows());

            fclose($handle);
        }, $name, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * Read the file, guess (or take) the mapping, and say what each line
     * would do. Writes no product.
     */
    public function analyse(Request $request): JsonResponse
    {
        $request->validate([
            // `extensions:` on the name and the bytes checked in
            // `Spreadsheet::read()`; the newsletter's analyse says why `mimes:`
            // is the wrong rule for a spreadsheet.
            'file' => ['required', 'file', 'max:10240', 'extensions:csv,txt,xlsx'],
            'mapping' => ['sometimes', 'array'],
        ]);

        $file = $request->file('file');

        if (Spreadsheet::isLegacyExcel($file->getRealPath())) {
            throw ValidationException::withMessages([
                'file' => 'That is an old-format Excel file (.xls). Open it in Excel and use '
                    .'File → Save As → Excel Workbook (.xlsx), or CSV UTF-8, and upload that.',
            ]);
        }

        $path = $file->store('store-imports', 'local');
        $absolute = Storage::disk('local')->path($path);

        /*
         * Every re-mapping uploads the file again, and only the copy that is
         * committed is deleted on the way out — so the ones an editor walked
         * away from would sit on the private disk for ever. Anything a day
         * old under this directory was never going to be committed.
         */
        foreach (Storage::disk('local')->files('store-imports') as $stale) {
            if (Storage::disk('local')->lastModified($stale) < now()->subDay()->getTimestamp()) {
                Storage::disk('local')->delete($stale);
            }
        }

        $peek = Spreadsheet::read($absolute, 5);

        /*
         * The submitted mapping wins where it exists, so re-analysing after
         * correcting a column does not throw the correction away — and a
         * field sent blank is an explicit "not in this file", which has to
         * be able to beat a guess or a wrong guess could never be undone.
         */
        $mapping = CatalogueImport::guessMapping($peek['headers']);
        $submitted = $request->input('mapping');

        if (is_array($submitted)) {
            foreach ($submitted as $field => $value) {
                if (array_key_exists($field, $mapping)) {
                    $mapping[$field] = $value === null || $value === '' ? null : (int) $value;
                }
            }
        }

        $analysis = CatalogueImport::dryRun($absolute, $mapping);

        return response()->json(['data' => [
            // Handed back so `store` can find the file without a second
            // upload; a hashed name under a private disk, checked on return.
            'file' => $path,
            'original_name' => $file->getClientOriginalName(),
            'headers' => $analysis['headers'],
            'fields' => CatalogueImport::FIELDS,
            'mapping' => $mapping,
            'counts' => $analysis['counts'],
            'problems' => $analysis['problems'],
            'preview' => $analysis['preview'],
        ]]);
    }

    /** Commit an analysed file with the mapping the dry run was shown under. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'string', 'max:255'],
            'original_name' => ['nullable', 'string', 'max:255'],
            'mapping' => ['required', 'array'],
            'mapping.*' => ['nullable', 'integer', 'min:0'],
        ]);

        /*
         * The path is checked rather than trusted: it comes back from the
         * browser, and without this it is a caller-supplied filesystem path.
         * Pinned to the directory `analyse` writes to, and existence-checked —
         * rebuilt from its last segment, because a prefix check let
         * `store-imports/../newsletter-imports/mailbox-3.csv` read (and
         * delete) another area's file. See `ImportUpload`.
         */
        $file = ImportUpload::resolve('store-imports', (string) $data['file']);

        if ($file === null) {
            return response()->json(['message' => 'That upload has expired. Choose the file again.'], 422);
        }

        $data['file'] = $file;

        $mapping = array_map(fn ($v) => $v === null ? null : (int) $v, $data['mapping']);

        if (! isset($mapping['sku']) && ! isset($mapping['name'])) {
            throw ValidationException::withMessages([
                'mapping' => 'Map at least the SKU column, or the name column for a file of new products.',
            ]);
        }

        $import = StoreProductImport::create([
            'uploaded_by' => $request->user()?->id,
            'filename' => $data['original_name'] ?? basename((string) $data['file']),
            'file' => $data['file'],
            'mapping' => $mapping,
            'status' => 'running',
        ]);

        $result = CatalogueImport::run($import, Storage::disk('local')->path((string) $data['file']), $mapping);

        // Read once, deleted once: the row keeps the mapping, the counts and
        // the refused lines, which is everything the file was for.
        Storage::disk('local')->delete((string) $data['file']);
        $result->update(['file' => null]);

        return response()->json(['data' => self::summary($result->fresh())], 201);
    }

    /** @return array<string, mixed> */
    public static function summary(StoreProductImport $import): array
    {
        return [
            'id' => $import->id,
            'status' => $import->status,
            'filename' => $import->filename,
            'mapping' => $import->mapping,
            'counts' => $import->counts,
            'problems' => $import->problems ?? [],
            'created_at' => $import->created_at?->toIso8601String(),
        ];
    }
}
