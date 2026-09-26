<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\RunWordPressImport;
use App\Models\WordPressImport;
use App\Support\Net\SafeHttp;
use App\Support\QueueHealth;
use App\Support\SealedCache;
use App\Support\WordPress\Decisions;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Importer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Importing a WordPress / WooCommerce site: start a scan, watch it, review
 * what it found, settle the decisions, commit, and read the result.
 *
 * `role:admin`, because one import writes content, the store's catalogue and
 * customer accounts at once — three roles' worth of records. See
 * `docs/wordpress-import.md`.
 *
 * One import at a time: two would share a queue, a review screen and, for
 * the same site, a map.
 */
class WordPressImportController extends Controller
{
    /** The last twenty imports, newest first. */
    public function index(): JsonResponse
    {
        $imports = WordPressImport::query()->with('uploader:id,name')->latest('id')->limit(20)->get();

        return response()->json([
            'data' => $imports->map(fn (WordPressImport $import) => self::summary($import, full: false))->all(),
            'meta' => [
                'active' => ($active = WordPressImport::query()->whereIn('status', ['pending', 'scanning', 'analysing', 'ready', 'running', 'failed'])->latest('id')->first())
                    ? self::summary($active) : null,
                'delivering' => self::draining(),
                'sections' => WordPressImport::SECTIONS,
            ],
        ]);
    }

    /** Start a scan. 202: the queue does the reading. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'site_url' => ['required', 'string', 'max:255'],
            'sections' => ['required', 'array', 'min:1'],
            'sections.*' => ['string', 'distinct', Rule::in(WordPressImport::SECTIONS)],
            'wp_user' => ['required', 'string', 'max:120'],
            'wp_password' => ['required', 'string', 'max:200'],
            'wc_key' => ['nullable', 'required_with:wc_secret', 'string', 'max:200', 'regex:/^ck_[A-Za-z0-9]+$/'],
            'wc_secret' => ['nullable', 'required_with:wc_key', 'string', 'max:200', 'regex:/^cs_[A-Za-z0-9]+$/'],
        ], [
            'wc_key.regex' => 'A WooCommerce consumer key starts with ck_.',
            'wc_secret.regex' => 'A WooCommerce consumer secret starts with cs_.',
        ]);

        $sections = array_values(array_unique($data['sections']));

        $url = self::siteUrl($data['site_url']);
        $allowPrivate = (bool) config('wordpress_import.allow_private_hosts');

        if ($refusal = SafeHttp::refusal($url, $allowPrivate, $allowPrivate)) {
            throw ValidationException::withMessages(['site_url' => $refusal]);
        }

        if (WordPressImport::query()->inFlight()->exists()) {
            throw ValidationException::withMessages(['site_url' => 'An import is already running. Wait for it, or cancel it, first.']);
        }

        if (! self::draining()) {
            throw ValidationException::withMessages(['queue' => 'Nothing is draining the queue, so the scan would never start. On the server add the cron entry `* * * * * cd /path/to/api && php artisan schedule:run`, or run `php artisan queue:work`.']);
        }

        // An earlier import of this site that nobody committed is replaced, not left to expire beside this one.
        WordPressImport::query()->where('status', 'ready')->get()->each(function (WordPressImport $old) {
            Harvest::discard($old);
            $old->update(['status' => 'cancelled']);
        });

        $import = WordPressImport::query()->create([
            'uploaded_by' => $request->user()?->id,
            'site_url' => $url,
            'site' => WordPressImport::siteKey($url),
            'status' => 'pending',
            'sections' => $sections,
            'decisions' => [],
            'progress' => ['started_at' => now()->toIso8601String()],
        ]);

        $key = SealedCache::put('wordpress-import', $import->id, [
            'site_url' => $url,
            'wp_user' => $data['wp_user'],
            // Application passwords are shown with spaces; WordPress accepts them either way.
            'wp_password' => str_replace(' ', '', $data['wp_password']),
            'wc_key' => $data['wc_key'] ?? null,
            'wc_secret' => $data['wc_secret'] ?? null,
        ], hours: 6);

        RunWordPressImport::dispatch($import->id, 'scan', $key);

        return response()->json(['data' => self::summary($import)], 202);
    }

    public function show(WordPressImport $wordpressImport): JsonResponse
    {
        return response()->json(['data' => self::summary($wordpressImport->load('uploader:id,name'))]);
    }

    /** Settle review decisions; the dry run is re-run on them. 202. */
    public function update(Request $request, WordPressImport $wordpressImport): JsonResponse
    {
        if ($wordpressImport->status !== 'ready') {
            throw ValidationException::withMessages(['status' => 'Only an import waiting for review can be changed.']);
        }

        $decisions = Decisions::validate((array) $request->input('decisions', []));
        $progress = $wordpressImport->progress ?? [];
        unset($progress['analyse']);

        $wordpressImport->update([
            'decisions' => array_replace_recursive($wordpressImport->decisions ?? [], $decisions),
            'status' => 'analysing',
            'progress' => $progress,
        ]);

        RunWordPressImport::dispatch($wordpressImport->id, 'analyse');

        return response()->json(['data' => self::summary($wordpressImport)], 202);
    }

    /** Commit what the review shows — or resume a commit that stopped. 202. */
    public function commit(WordPressImport $wordpressImport): JsonResponse
    {
        $resuming = $wordpressImport->status === 'failed' && isset(($wordpressImport->progress ?? [])['commit']);

        if ($wordpressImport->status !== 'ready' && ! $resuming) {
            throw ValidationException::withMessages(['status' => 'Only a reviewed import can be committed.']);
        }

        if (! self::draining()) {
            throw ValidationException::withMessages(['queue' => 'Nothing is draining the queue, so the import would never run.']);
        }

        $progress = $wordpressImport->progress ?? [];

        if (! $resuming) {
            unset($progress['commit']);
        }

        $wordpressImport->update(['status' => 'running', 'error' => null, 'progress' => $progress, 'expires_at' => null]);

        RunWordPressImport::dispatch($wordpressImport->id, 'commit');

        return response()->json(['data' => self::summary($wordpressImport)], 202);
    }

    /**
     * Cancel a scan or a commit, or discard one waiting for review. What a
     * commit already wrote stays — it is real content by then — and the
     * harvest is deleted.
     */
    public function destroy(WordPressImport $wordpressImport): JsonResponse
    {
        if ($wordpressImport->status === 'completed') {
            throw ValidationException::withMessages(['status' => 'A finished import cannot be undone from here; what it wrote is ordinary content now.']);
        }

        $wordpressImport->update(['status' => 'cancelled', 'expires_at' => null]);
        Harvest::discard($wordpressImport);

        return response()->json(['data' => self::summary($wordpressImport)]);
    }

    /**
     * Whether queued work will run: a drained queue, or the `sync` driver,
     * which runs it inline — `Notifier`'s definition.
     */
    private static function draining(): bool
    {
        return config('queue.default') === 'sync' || QueueHealth::delivering();
    }

    /**
     * The address typed, as the site's origin plus any path WordPress lives
     * under (`https://example.in/blog`), no trailing slash, https added when
     * nothing was said.
     */
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
    public static function summary(WordPressImport $import, bool $full = true): array
    {
        $progress = $import->progress ?? [];
        $steps = count(Importer::steps());

        $summary = [
            'id' => $import->id,
            'site_url' => $import->site_url,
            'status' => $import->status,
            'sections' => $import->sections ?? [],
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

        return $summary + [
            'decisions' => $import->decisions ?? [],
            'progress' => [
                'collections' => $progress['collections'] ?? [],
                'totals' => $progress['totals'] ?? [],
                'requests' => $progress['requests'] ?? 0,
                'current' => $progress['current'] ?? null,
                'tasks_done' => $progress['tasks_done'] ?? 0,
                'tasks_total' => $progress['tasks_total'] ?? 0,
                'analyse_step' => $progress['analyse_step'] ?? null,
                'analyse_percent' => (int) round(100 * min($steps, (int) (($progress['analyse'] ?? [])['step'] ?? 0)) / max(1, $steps)),
                'commit_step' => $progress['commit_step'] ?? null,
                'commit_percent' => (int) round(100 * min($steps, (int) (($progress['commit'] ?? [])['step'] ?? 0)) / max(1, $steps)),
            ],
            'site' => isset($analysis['site']) ? [
                'name' => (string) ($analysis['site']['name'] ?? ''),
                'url' => (string) ($analysis['site']['url'] ?? ''),
                'woocommerce' => (bool) ($analysis['site']['woocommerce'] ?? false),
                'acf' => (bool) ($analysis['site']['acf'] ?? false),
                'yoast' => (bool) ($analysis['site']['yoast'] ?? false),
                'counts' => $analysis['site']['harvest_counts'] ?? [],
                'missing' => $analysis['site']['missing'] ?? [],
            ] : null,
            'analysis' => in_array($import->status, ['ready', 'running', 'completed', 'failed'], true) && isset($analysis['steps']) ? [
                'steps' => $analysis['steps'],
                'notices' => $analysis['notices'] ?? [],
                'decisions' => $analysis['decisions'] ?? [],
                'analysed_at' => $analysis['analysed_at'] ?? null,
            ] : null,
            'result' => $import->status === 'completed' || $import->status === 'running' || isset($progress['commit'])
                ? Importer::result($import) : null,
        ];
    }
}
