<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\RunSiteImport;
use App\Models\SiteImport;
use App\Support\Net\SafeHttp;
use App\Support\QueueHealth;
use App\Support\SiteImport\Decisions;
use App\Support\SiteImport\Importer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Importing a website that has no API: give it a live address or an uploaded
 * ZIP, watch it being read, review what would come across, settle the
 * decisions, commit, and read the result.
 *
 * `role:admin`, because one import writes pages, files, menus and redirects
 * across the whole site. See `docs/site-import.md`.
 *
 * One import at a time: two would share a queue, a review screen and, for the
 * same site, a map.
 */
class SiteImportController extends Controller
{
    private const UPLOADS = 'site-imports/uploads';

    /** The last twenty imports, newest first. */
    public function index(): JsonResponse
    {
        $imports = SiteImport::query()->with('uploader:id,name')->latest('id')->limit(20)->get();

        return response()->json([
            'data' => $imports->map(fn (SiteImport $import) => self::summary($import, full: false))->all(),
            'meta' => [
                'active' => ($active = SiteImport::query()->whereIn('status', ['pending', 'scanning', 'analysing', 'ready', 'running', 'failed'])->latest('id')->first())
                    ? self::summary($active) : null,
                'delivering' => self::draining(),
                'sections' => SiteImport::SECTIONS,
                'chunk_bytes' => UpdateController::CHUNK_BYTES,
                'limits' => [
                    'depth' => (int) config('site_import.max_depth'),
                    'pages' => (int) config('site_import.max_pages'),
                    'zip_bytes' => (int) config('site_import.zip.max_bytes'),
                ],
            ],
        ]);
    }

    /** One piece of an uploaded ZIP, appended in order. The import is started with its name. */
    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9._-]+\.zip$/'],
            'index' => ['required', 'integer', 'min:0'],
            'total' => ['required', 'integer', 'min:1', 'max:'.(int) ceil((int) config('site_import.zip.max_bytes') / UpdateController::CHUNK_BYTES) + 1],
            'chunk' => ['required', 'file', 'max:'.(int) ceil(UpdateController::CHUNK_BYTES / 1024)],
        ]);
        // A multipart body carries every field as text: '0' === 0 is false.
        $data['index'] = (int) $data['index'];
        $data['total'] = (int) $data['total'];

        $disk = Storage::disk('local');
        $stored = self::stored($request, $data['name']);
        $part = $stored.'.part';
        $bytes = (string) file_get_contents($data['chunk']->getRealPath());

        if ($data['index'] === 0) {
            $disk->delete([$part, $stored]);
        }

        $disk->makeDirectory(self::UPLOADS);
        file_put_contents($disk->path($part), $bytes, FILE_APPEND);

        if ((int) filesize($disk->path($part)) > (int) config('site_import.zip.max_bytes')) {
            $disk->delete($part);

            throw ValidationException::withMessages(['chunk' => 'That ZIP is over '.round((int) config('site_import.zip.max_bytes') / 1048576).' MB.']);
        }

        $last = $data['total'] === $data['index'] + 1;

        if ($last) {
            // A ZIP starts with "PK"; anything else is not one, whatever it is called.
            if (! str_starts_with((string) file_get_contents($disk->path($part), false, null, 0, 2), 'PK')) {
                $disk->delete($part);

                throw ValidationException::withMessages(['chunk' => 'That is not a ZIP file.']);
            }

            $disk->move($part, $stored);
        }

        return response()->json(['data' => ['received' => $data['index'] + 1, 'complete' => $last, 'file' => $data['name']]]);
    }

    /** Start a scan. 202: the queue does the reading. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source' => ['required', Rule::in(['url', 'zip'])],
            'start_url' => ['required_if:source,url', 'nullable', 'string', 'max:255'],
            'zip' => ['required_if:source,zip', 'nullable', 'string', 'max:120', 'regex:/^[A-Za-z0-9._-]+\.zip$/'],
            'depth' => ['nullable', 'integer', 'min:0', 'max:'.(int) config('site_import.max_depth')],
            'max_pages' => ['nullable', 'integer', 'min:1', 'max:'.(int) config('site_import.max_pages')],
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', 'distinct', Rule::in(SiteImport::SECTIONS)],
        ]);

        $zip = $data['source'] === 'zip';
        $url = $zip ? (string) $data['zip'] : self::siteUrl((string) $data['start_url']);
        $allowPrivate = (bool) config('site_import.allow_private_hosts');

        if (! $zip && ($refusal = SafeHttp::refusal($url, $allowPrivate, allowHttp: true))) {
            throw ValidationException::withMessages(['start_url' => $refusal]);
        }

        $upload = $zip ? self::stored($request, $data['zip']) : null;

        if ($zip && ! Storage::disk('local')->exists((string) $upload)) {
            throw ValidationException::withMessages(['zip' => 'That upload is no longer here. Choose the ZIP again.']);
        }

        if (SiteImport::query()->inFlight()->exists()) {
            throw ValidationException::withMessages([$zip ? 'zip' : 'start_url' => 'An import is already running. Wait for it, or cancel it, first.']);
        }

        if (! self::draining()) {
            throw ValidationException::withMessages(['queue' => 'Nothing is draining the queue, so the scan would never start. On the server add the scheduler’s cron line — System → Status shows the exact line for this server — or run `php artisan queue:work`.']);
        }

        // An earlier import that nobody committed is replaced, not left to expire beside this one.
        SiteImport::query()->where('status', 'ready')->get()->each(function (SiteImport $old) {
            RunSiteImport::discardFiles($old);
            $old->update(['status' => 'cancelled']);
        });

        $import = SiteImport::query()->create([
            'uploaded_by' => $request->user()?->id,
            'source' => $data['source'],
            'site_url' => $url,
            'site' => SiteImport::siteKey($data['source'], $url),
            'status' => 'pending',
            'sections' => array_values(array_unique($data['sections'] ?? SiteImport::SECTIONS)),
            'settings' => [
                'depth' => (int) ($data['depth'] ?? 3),
                'max_pages' => (int) ($data['max_pages'] ?? 300),
            ],
            'decisions' => [],
            'progress' => ['started_at' => now()->toIso8601String()],
        ]);

        if ($zip) {
            $path = 'site-imports/'.$import->id.'/source.zip';
            Storage::disk('local')->move((string) $upload, $path);
            $import->update(['zip_path' => $path]);
        }

        RunSiteImport::dispatch($import->id, 'scan');

        return response()->json(['data' => self::summary($import->fresh() ?? $import)], 202);
    }

    public function show(SiteImport $siteImport): JsonResponse
    {
        return response()->json(['data' => self::summary($siteImport->load('uploader:id,name'))]);
    }

    /** Settle review decisions; the dry run is re-run on them. 202. */
    public function update(Request $request, SiteImport $siteImport): JsonResponse
    {
        if ($siteImport->status !== 'ready') {
            throw ValidationException::withMessages(['status' => 'Only an import waiting for review can be changed.']);
        }

        $decisions = Decisions::validate((array) $request->input('decisions', []), $siteImport->decisions ?? []);
        $progress = $siteImport->progress ?? [];
        unset($progress['analyse']);

        $siteImport->update([
            // Replaced key by key: a list is the new list, not merged into the old one.
            'decisions' => array_replace($siteImport->decisions ?? [], $decisions),
            'status' => 'analysing',
            'progress' => $progress,
        ]);

        RunSiteImport::dispatch($siteImport->id, 'analyse');

        return response()->json(['data' => self::summary($siteImport)], 202);
    }

    /** Commit what the review shows — or resume a commit that stopped. 202. */
    public function commit(SiteImport $siteImport): JsonResponse
    {
        $resuming = $siteImport->status === 'failed' && isset(($siteImport->progress ?? [])['commit']);

        if ($siteImport->status !== 'ready' && ! $resuming) {
            throw ValidationException::withMessages(['status' => 'Only a reviewed import can be committed.']);
        }

        if (! self::draining()) {
            throw ValidationException::withMessages(['queue' => 'Nothing is draining the queue, so the import would never run.']);
        }

        $progress = $siteImport->progress ?? [];

        if (! $resuming) {
            unset($progress['commit']);
        }

        $siteImport->update(['status' => 'running', 'error' => null, 'progress' => $progress, 'expires_at' => null]);

        RunSiteImport::dispatch($siteImport->id, 'commit');

        return response()->json(['data' => self::summary($siteImport)], 202);
    }

    /**
     * Cancel a scan or a commit, or discard one waiting for review. What a
     * commit already wrote stays — it is real content by then — and the
     * harvest and the ZIP are deleted.
     */
    public function destroy(SiteImport $siteImport): JsonResponse
    {
        if ($siteImport->status === 'completed') {
            throw ValidationException::withMessages(['status' => 'A finished import cannot be undone from here; what it wrote is ordinary content now.']);
        }

        $siteImport->update(['status' => 'cancelled', 'expires_at' => null]);
        RunSiteImport::discardFiles($siteImport);

        return response()->json(['data' => self::summary($siteImport)]);
    }

    /** Whether queued work will run: a drained queue, or the `sync` driver. */
    private static function draining(): bool
    {
        return config('queue.default') === 'sync' || QueueHealth::delivering();
    }

    /** Where an uploaded ZIP waits, under the uploader's id so two people's `site.zip` are two files. */
    private static function stored(Request $request, string $name): string
    {
        return self::UPLOADS.'/'.$request->user()->id.'-'.$name;
    }

    /** The address typed, as an origin and path, https added when nothing was said. */
    private static function siteUrl(string $typed): string
    {
        $typed = trim($typed);

        if (! preg_match('#^[a-z][a-z0-9+.-]*://#i', $typed)) {
            $typed = 'https://'.$typed;
        }

        $parts = parse_url($typed) ?: [];

        return strtolower(($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? ''))
            .(isset($parts['port']) ? ':'.$parts['port'] : '')
            .rtrim((string) ($parts['path'] ?? ''), '/');
    }

    /** @return array<string, mixed> */
    public static function summary(SiteImport $import, bool $full = true): array
    {
        $progress = $import->progress ?? [];
        $steps = count(Importer::steps());

        $summary = [
            'id' => $import->id,
            'source' => $import->source,
            'site_url' => $import->site_url,
            'status' => $import->status,
            'sections' => $import->sections ?? [],
            'settings' => $import->settings ?? [],
            'error' => $import->error,
            'uploaded_by' => $import->relationLoaded('uploader') ? $import->uploader?->name : null,
            'created_at' => $import->created_at?->toIso8601String(),
            'completed_at' => $import->completed_at?->toIso8601String(),
            'expires_at' => $import->expires_at?->toIso8601String(),
            'can_resume' => $import->status === 'failed' && isset($progress['commit']),
        ];

        if (! $full) {
            return $summary + ['site_name' => (string) ((($import->analysis ?? [])['site'] ?? [])['name'] ?? '')];
        }

        $analysis = $import->analysis ?? [];
        $site = (array) ($analysis['site'] ?? []);

        return $summary + [
            'decisions' => $import->decisions ?? [],
            'progress' => [
                'phase' => $progress['phase'] ?? null,
                'pages' => $progress['pages'] ?? 0,
                'queued' => $progress['queued'] ?? 0,
                'requests' => $progress['requests'] ?? 0,
                'current' => $progress['current'] ?? null,
                'capped' => $progress['capped'] ?? false,
                'zip_files' => $progress['zip_files'] ?? 0,
                'analyse_step' => $progress['analyse_step'] ?? null,
                'analyse_percent' => (int) round(100 * min($steps, (int) (($progress['analyse'] ?? [])['step'] ?? 0)) / max(1, $steps)),
                'commit_step' => $progress['commit_step'] ?? null,
                'commit_percent' => (int) round(100 * min($steps, (int) (($progress['commit'] ?? [])['step'] ?? 0)) / max(1, $steps)),
            ],
            'site' => $site !== [] ? [
                'name' => (string) ($site['name'] ?? ''),
                'url' => (string) ($site['url'] ?? ''),
                'pages' => (int) ($site['pages'] ?? 0),
                'home_path' => $site['home_path'] ?? null,
                'chrome_blocks' => (int) ($site['chrome_removed'] ?? 0),
                'menus' => array_map(fn ($items) => count((array) $items), (array) ($site['menus'] ?? [])),
                'capped' => (bool) ($site['capped'] ?? false),
                'skipped' => collect((array) ($site['skipped'] ?? []))->map(fn ($entry, $reason) => ['reason' => $reason] + $entry)->values()->all(),
                'notes' => (array) ($site['notes'] ?? []),
            ] : null,
            'analysis' => in_array($import->status, ['ready', 'running', 'completed', 'failed'], true) && isset($analysis['steps']) ? [
                'steps' => $analysis['steps'],
                'notices' => $analysis['notices'] ?? [],
                'pages' => $analysis['pages'] ?? [],
                'decisions' => $analysis['decisions'] ?? [],
                'analysed_at' => $analysis['analysed_at'] ?? null,
            ] : null,
            'result' => $import->status === 'completed' || $import->status === 'running' || isset($progress['commit'])
                ? Importer::result($import) : null,
        ];
    }
}
