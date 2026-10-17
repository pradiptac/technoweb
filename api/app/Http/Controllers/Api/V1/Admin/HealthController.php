<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\HealthFinding;
use App\Models\HealthLink;
use App\Models\HealthSnapshot;
use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use App\Support\Health\Score;
use App\Support\PaginatedEnvelope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * The site health centre's list (docs/health.md). Staff-wide behind the union
 * of owning roles; every read and write is narrowed to the kinds this account
 * owns (`Kinds::allows`), and a finding outside them is a 404. The score and
 * its trend are an administrator's alone.
 */
class HealthController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $aliases = Kinds::aliasesFor($user);
        $group = $request->string('group')->value();
        $checks = isset(Findings::GROUPS[$group])
            ? array_keys(array_filter(Findings::CHECKS, fn ($c) => $c[0] === $group))
            : null;

        $rows = HealthFinding::query()
            ->whereIn('subject_type', $aliases)
            ->when($request->boolean('ignored'), fn ($q) => $q->whereNotNull('ignored_at'), fn ($q) => $q->whereNull('ignored_at'))
            ->when($checks !== null, fn ($q) => $q->whereIn('check', $checks))
            ->when(isset(Findings::SEVERITIES[$request->string('severity')->value()]), fn ($q) => $q->where('severity', $request->string('severity')->value()))
            ->when(in_array($request->string('type')->value(), $aliases, true), fn ($q) => $q->where('subject_type', $request->string('type')->value()))
            ->orderByRaw("field(severity, 'error', 'warning', 'notice')")
            ->orderBy('first_seen_at')
            ->orderBy('id')
            ->paginate(max(1, min($request->integer('per_page', 50), 100)))
            ->withQueryString();

        $subjects = $this->subjects($rows->getCollection());
        $rows->getCollection()->transform(fn (HealthFinding $f) => $this->present($f, $subjects));

        $meta = [
            'summary' => Score::counts($aliases),
            'last_sweep_at' => Cache::get(Score::LAST_SWEEP_KEY),
            'groups' => $this->options(Findings::GROUPS),
            'severities' => $this->options(Findings::SEVERITIES),
            'kinds' => array_map(fn ($a) => ['value' => $a, 'label' => Kinds::label($a)], $aliases),
        ];

        if ($user->isAdmin()) {
            $meta['score'] = $this->score();
            $meta['links_due'] = HealthLink::query()->where('next_check_at', '<=', now())->count();
        }

        return response()->json(PaginatedEnvelope::from($rows, $meta));
    }

    public function ignore(Request $request, int $finding): JsonResponse
    {
        $row = $this->owned($request, $finding);
        $row->forceFill(['ignored_at' => $row->ignored_at ?? now(), 'ignored_by' => $row->ignored_by ?? $request->user()->id])->save();

        return response()->json(['data' => $this->present($row, $this->subjects(collect([$row])))]);
    }

    public function restore(Request $request, int $finding): JsonResponse
    {
        $row = $this->owned($request, $finding);
        $row->forceFill(['ignored_at' => null, 'ignored_by' => null])->save();

        return response()->json(['data' => $this->present($row, $this->subjects(collect([$row])))]);
    }

    public function recheck(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(Kinds::aliases())],
            'id' => ['required', 'integer'],
        ]);

        abort_unless(Kinds::allows($request->user(), $data['type']), 404);
        $model = Kinds::classFor($data['type'])::find($data['id']);
        abort_if($model === null, 404);

        Findings::replace($model, Checker::run($model));
        $rows = HealthFinding::query()->where('subject_type', $data['type'])->where('subject_id', $data['id'])->orderBy('id')->get();
        $subjects = $this->subjects($rows);

        return response()->json(['data' => $rows->map(fn ($f) => $this->present($f, $subjects))->values()]);
    }

    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct'],
            'action' => ['required', Rule::in(['ignore', 'restore'])],
        ]);

        $aliases = Kinds::aliasesFor($request->user());
        $updated = [];

        // A foreign id is treated exactly like a missing one: in neither list, so it cannot be probed.
        foreach (HealthFinding::query()->whereIn('id', $data['ids'])->whereIn('subject_type', $aliases)->get() as $row) {
            $row->forceFill($data['action'] === 'ignore'
                ? ['ignored_at' => $row->ignored_at ?? now(), 'ignored_by' => $row->ignored_by ?? $request->user()->id]
                : ['ignored_at' => null, 'ignored_by' => null])->save();
            $updated[] = $row->id;
        }

        return response()->json(['updated' => $updated, 'refused' => []]);
    }

    private function owned(Request $request, int $id): HealthFinding
    {
        $row = HealthFinding::find($id);
        abort_if($row === null || ! Kinds::allows($request->user(), $row->subject_type), 404);

        return $row;
    }

    /**
     * Every subject on the page, loaded once per kind.
     *
     * @param  Collection<int, HealthFinding>  $rows
     * @return array<string, Model>
     */
    private function subjects($rows): array
    {
        $out = [];
        foreach ($rows->groupBy('subject_type') as $alias => $group) {
            $class = Kinds::classFor($alias);
            if ($class === null) {
                continue;
            }
            foreach ($class::query()->whereKey($group->pluck('subject_id')->unique()->all())->get() as $model) {
                $out[$alias.':'.$model->getKey()] = $model;
            }
        }

        return $out;
    }

    /** @param  array<string, Model>  $subjects */
    private function present(HealthFinding $f, array $subjects): array
    {
        $model = $subjects[$f->subject_type.':'.$f->subject_id] ?? null;
        $tab = Findings::tabFor($f->field, $f->subject_type);
        $path = $model ? Kinds::adminPath($model) : null;

        return [
            'id' => $f->id,
            'check' => $f->check,
            'group' => Findings::CHECKS[$f->check][0] ?? null,
            'severity' => $f->severity,
            'sentence' => Findings::sentence($f),
            'field' => $f->field,
            'field_label' => Findings::fieldLabel($f->field),
            'detail' => $f->detail ?? (object) [],
            'subject' => [
                'type' => $f->subject_type,
                'type_label' => Kinds::label($f->subject_type),
                'id' => $f->subject_id,
                'title' => $model ? Kinds::title($model) : null,
            ],
            'admin_path' => $path && $tab ? $path.'?tab='.$tab : $path,
            'first_seen_at' => $f->first_seen_at->toIso8601String(),
            'ignored_at' => $f->ignored_at?->toIso8601String(),
        ];
    }

    /** @return array{value: ?int, series: list<array{date: string, score: ?int}>, change: ?int} */
    private function score(): array
    {
        $value = Score::now();
        $series = HealthSnapshot::query()->where('date', '>=', now()->subDays(90)->toDateString())->orderBy('date')->get()
            ->map(fn ($s) => ['date' => $s->date->toDateString(), 'score' => $s->score])->values()->all();
        $then = HealthSnapshot::query()->where('date', '<=', now()->subDays(30)->toDateString())->orderByDesc('date')->value('score');

        return ['value' => $value, 'series' => $series, 'change' => $value !== null && $then !== null ? $value - (int) $then : null];
    }

    /** @param  array<string, string>  $map */
    private function options(array $map): array
    {
        return array_map(fn ($v, $l) => ['value' => $v, 'label' => $l], array_keys($map), $map);
    }
}
