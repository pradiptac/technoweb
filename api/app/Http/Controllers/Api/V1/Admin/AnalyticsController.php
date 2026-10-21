<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\Analytics\Collector;
use App\Support\Analytics\Kinds;
use App\Support\Analytics\Labels;
use App\Support\Analytics\Report;
use App\Support\Money;
use App\Support\Newsletter\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** The staff face of native analytics (C3, docs/analytics.md). Every figure is Report's; every label is the API's. */
class AnalyticsController extends Controller
{
    public const DIMENSIONS = ['total', 'page', 'entry', 'channel', 'source', 'campaign', 'device', 'browser', 'os', 'country', 'target'];

    private const MAX_DAYS = 400;

    /**
     * The window every endpoint shares: `from`/`to` as Y-m-d, default the last 30 days,
     * `to` never in the future, a backwards pair swapped, over 400 days a 422.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function range(Request $request): array
    {
        $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d']]);
        $tz = (string) config('app.timezone');
        $today = now()->setTimezone($tz)->startOfDay();
        $to = $request->filled('to') ? Carbon::createFromFormat('Y-m-d', $request->string('to')->value(), $tz)->startOfDay() : $today->copy();
        $from = $request->filled('from') ? Carbon::createFromFormat('Y-m-d', $request->string('from')->value(), $tz)->startOfDay() : $to->copy()->subDays(29);
        if ($from->gt($to)) {
            [$from, $to] = [$to, $from];
        }
        $to = $to->gt($today) ? $today->copy() : $to;
        $from = $from->gt($to) ? $to->copy() : $from;
        if ($from->diffInDays($to) > self::MAX_DAYS) {
            throw ValidationException::withMessages(['from' => 'Choose a range of '.self::MAX_DAYS.' days or fewer.']);
        }

        return [$from, $to];
    }

    private function label(Carbon $from, Carbon $to): string
    {
        $f = $from->copy()->locale('en');
        $t = $to->copy()->locale('en');

        return $from->isSameDay($to) ? $t->isoFormat('D MMM YYYY') : $f->isoFormat('D MMM').' – '.$t->isoFormat('D MMM YYYY');
    }

    private function compare(Request $request): string
    {
        return $request->validate(['compare' => ['nullable', Rule::in(['previous', 'year', 'none'])]])['compare'] ?? 'previous';
    }

    /** @return array{0: string, 1: string, 2: int} */
    private function query(Request $request): array
    {
        $v = $request->validate([
            'dimension' => ['required', Rule::in(self::DIMENSIONS)],
            'kind' => ['nullable', Rule::in([...Kinds::EVENTS, ...Kinds::CONVERSIONS])],
            'limit' => ['nullable', 'integer', 'between:1,100'],
        ]);

        return [$v['dimension'], $v['kind'] ?? 'pageview', (int) ($v['limit'] ?? 10)];
    }

    /** Keeps 50.0 a float on the wire, so a share never changes type with its value. */
    private function json(array $body): JsonResponse
    {
        return response()->json($body, 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = self::range($request);
        $compare = $this->compare($request);
        $summary = Report::summary($from, $to, $compare);

        $days = (int) $from->diffInDays($to) + 1;
        $prev = match ($compare) {
            'previous' => [$from->copy()->subDays($days), $from->copy()->subDay()],
            'year' => [$from->copy()->subYear(), $to->copy()->subYear()],
            default => null,
        };
        $before = $prev === null ? [] : Report::series($prev[0], $prev[1]);

        $series = [];
        foreach (Report::series($from, $to) as $i => $p) {
            $series[] = ['day' => $p['day'], 'label' => Carbon::parse($p['day'])->locale('en')->isoFormat('ddd D MMM'),
                'views' => $p['views'], 'visitors' => $p['visitors'], 'previous_views' => $before[$i]['views'] ?? null];
        }

        return $this->json(['data' => [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'label' => $this->label($from, $to)],
            'compare' => $compare,
            ...$summary,
            'series' => $series,
        ], 'meta' => ['enabled' => Collector::enabled()]]);
    }

    /** @return array{0: list<array<string, mixed>>, 1: int} */
    private function rows(string $dimension, string $kind, int $limit, Carbon $from, Carbon $to): array
    {
        $all = Report::breakdown($dimension, $from, $to, $kind, PHP_INT_MAX);
        $total = array_sum(array_column($all, 'views'));
        $rows = array_map(fn ($r) => [
            ...$r,
            // The entry dimension counts entries, not people: its visitors column is not a figure.
            'visitors' => $dimension === 'entry' ? null : $r['visitors'],
            'share' => $total > 0 ? round($r['views'] / $total * 100, 1) : null,
        ], array_slice($all, 0, $limit));

        return [$rows, $total];
    }

    public function breakdown(Request $request): JsonResponse
    {
        [$from, $to] = self::range($request);
        [$dimension, $kind, $limit] = $this->query($request);
        [$rows, $total] = $this->rows($dimension, $kind, $limit, $from, $to);

        return $this->json(['data' => $rows, 'meta' => ['dimension' => $dimension, 'kind' => $kind, 'total' => $total, 'enabled' => Collector::enabled()]]);
    }

    /** One page, from the raw hits (at most the last 90 days). */
    public function pages(Request $request): JsonResponse
    {
        $path = $request->validate(['path' => ['required', 'string', 'max:255']])['path'];
        [$from, $to] = self::range($request);
        if ($from->lt($to->copy()->subDays(89))) {
            $from = $to->copy()->subDays(89);
        }

        $hits = fn () => DB::table('analytics_hits')->where('kind', 'pageview')->where('path', $path)
            ->whereBetween('day', [$from->toDateString(), $to->toDateString()]);
        $byDay = $hits()->groupBy('day')->selectRaw('day, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(entry) as entries')->get()->keyBy(fn ($r) => (string) $r->day);

        $series = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $r = $byDay[$d->toDateString()] ?? null;
            $series[] = ['day' => $d->toDateString(), 'label' => $d->copy()->locale('en')->isoFormat('ddd D MMM'), 'views' => (int) ($r->views ?? 0), 'visitors' => (int) ($r->visitors ?? 0)];
        }
        $sources = $hits()->groupBy('source')->selectRaw("COALESCE(source, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors")->orderByDesc('views')->limit(10)->get()
            ->map(fn ($r) => ['key' => (string) $r->k, 'label' => Labels::of('source', (string) $r->k), 'views' => (int) $r->views, 'visitors' => (int) $r->visitors])->all();

        $conversions = DB::table('analytics_hits')->whereIn('kind', Kinds::CONVERSIONS)->where('path', $path)
            ->whereBetween('day', [$from->toDateString(), $to->toDateString()])
            ->groupBy('kind')->selectRaw('kind, COUNT(*) as n, SUM(value_paise) as value')->orderByDesc('n')->get()
            ->map(fn ($r) => ['kind' => (string) $r->kind, 'label' => Kinds::label((string) $r->kind), 'count' => (int) $r->n, 'value_paise' => $r->value === null ? null : (int) $r->value])->all();

        return $this->json(['data' => ['path' => $path, 'series' => $series, 'entries' => (int) $byDay->sum('entries'), 'sources' => $sources, 'conversions' => $conversions],
            'meta' => ['enabled' => Collector::enabled()]]);
    }

    public function search(Request $request): JsonResponse
    {
        [$from, $to] = self::range($request);
        if ($from->lt($to->copy()->subDays(89))) {
            $from = $to->copy()->subDays(89);
        }
        $scope = $request->validate(['scope' => ['nullable', Rule::in(['site', 'shop', 'all'])]])['scope'] ?? 'all';

        return $this->json(['data' => Report::search($from, $to, $scope === 'all' ? null : $scope), 'meta' => ['enabled' => Collector::enabled()]]);
    }

    public function now(): JsonResponse
    {
        return $this->json(['data' => Report::now(), 'meta' => ['enabled' => Collector::enabled()]])->header('Cache-Control', 'no-store');
    }

    public function export(Request $request): StreamedResponse
    {
        [$from, $to] = self::range($request);
        [$dimension, $kind] = $this->query($request);
        [$rows] = $this->rows($dimension, $kind, PHP_INT_MAX, $from, $to);

        return response()->streamDownload(function () use ($rows, $dimension) {
            $handle = fopen('php://output', 'w');
            Csv::write($handle, [ucfirst($dimension), 'Views', 'Visitors', 'Value (INR)', 'Share (%)'],
                array_map(fn ($r) => [$r['label'], $r['views'], $r['visitors'], $r['value_paise'] > 0 ? Money::toRupeeString($r['value_paise']) : null, $r['share']], $rows));
            fclose($handle);
        }, "analytics-{$dimension}-".now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }
}
