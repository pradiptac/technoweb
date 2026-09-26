<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\VisitStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\VisitRequestResource;
use App\Models\User;
use App\Models\VisitRequest;
use App\Support\ListSort;
use App\Support\Visits\VisitActions;
use App\Support\Visits\VisitSettings;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The visits desk: read the requests, set a time, move them on.
 *
 * `role:sales_manager,support_engineer` — a site survey is how a sale starts
 * and how an installation is scoped, and on this desk either role may be the
 * one who rings the customer back. Nothing here creates a request: they
 * arrive from the public form, the rule leads and the activity log follow.
 */
class VisitController extends Controller
{
    /** The columns a header may sort by — `ListSort`'s allowlist. */
    private const SORTS = [
        'created' => 'created_at',
        'scheduled' => 'scheduled_start_at',
        'name' => 'name',
        'status' => 'status',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $this->filtered($request)
            ->with(['assignee:id,name', 'service:id,title,slug', 'solution:id,title,slug']);

        /*
         * Default: what is waiting first (oldest request first, because the
         * one that has waited longest is the one to ring), then the diary in
         * date order, then everything closed, newest first.
         */
        ListSort::apply($query, $request, self::SORTS, fn (Builder $q) => $q
            ->orderByRaw("CASE status WHEN 'requested' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END")
            ->orderByRaw("CASE WHEN status = 'confirmed' THEN scheduled_start_at END ASC")
            ->orderByRaw("CASE WHEN status = 'requested' THEN created_at END ASC")
            ->orderByDesc('created_at'));

        $visits = $query->paginate(min(max($request->integer('per_page', 20), 1), 100))->withQueryString();

        return VisitRequestResource::collection($visits)->additional(['meta' => [
            'statuses' => VisitStatus::options(),
            // Over the whole table rather than the page — headline figures
            // somebody acts on, each the same query as the link it sits on.
            'awaiting_count' => VisitRequest::where('status', VisitStatus::Requested)->count(),
            'today_count' => VisitRequest::where('status', VisitStatus::Confirmed)
                ->whereBetween('scheduled_start_at', [Carbon::today(), Carbon::today()->endOfDay()])->count(),
            'unassigned_count' => VisitRequest::where('status', VisitStatus::Confirmed)->whereNull('assigned_to')->count(),
            'assignees' => User::query()->where('is_active', true)
                ->orderBy('name')->get(['id', 'name'])
                ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]),
            'sorts' => ListSort::keys(self::SORTS),
            'default_minutes' => VisitSettings::defaultMinutes(),
            'windows' => array_map(fn (array $w) => ['value' => $w['key'], 'label' => $w['label'], 'start' => $w['start'], 'end' => $w['end']], VisitSettings::windows()),
        ]]);
    }

    private function filtered(Request $request): Builder
    {
        return VisitRequest::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->integer('assigned_to')))
            ->when($request->boolean('unassigned'), fn ($q) => $q->whereNull('assigned_to'))
            // The diary: a range on the appointment, with `whereBetween` so the
            // column's index is usable — never `whereDate` (CLAUDE.md).
            ->when($request->filled('from'), fn ($q) => $q->where('scheduled_start_at', '>=', self::day($request, 'from')))
            ->when($request->filled('to'), fn ($q) => $q->where('scheduled_start_at', '<=', self::day($request, 'to')->endOfDay()))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $request->string('q')->value());
                $q->where(fn ($w) => $w->where('reference', 'like', "%{$term}%")
                    ->orWhere('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%"));
            });
    }

    private static function day(Request $request, string $key): Carbon
    {
        $value = $request->string($key)->value();

        if (! Carbon::hasFormat($value, 'Y-m-d')) {
            throw ValidationException::withMessages([$key => 'A date as YYYY-MM-DD.']);
        }

        return Carbon::createFromFormat('Y-m-d', $value)->startOfDay();
    }

    public function show(VisitRequest $visit): VisitRequestResource
    {
        return new VisitRequestResource($visit->load(['assignee:id,name', 'service', 'solution', 'location', 'events.user:id,name']));
    }

    /**
     * Status, engineer, the desk's note, the cancel reason. The status is
     * checked against the enum, so an illegal move is a 422 naming both
     * states; `confirmed` is refused here, because a time is what confirms.
     */
    public function update(Request $request, VisitRequest $visit): VisitRequestResource
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::enum(VisitStatus::class)],
            'assigned_to' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'staff_note' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'cancel_reason' => ['nullable', 'string', 'max:500'],
        ]);

        /** @var User $actor */
        $actor = $request->user();

        if (array_key_exists('assigned_to', $data) && $data['assigned_to'] !== $visit->assigned_to) {
            $to = $data['assigned_to'] ? User::find($data['assigned_to']) : null;
            $visit->assigned_to = $data['assigned_to'];
            $visit->save();
            $visit->record('assigned', $actor, null, $to !== null ? $to->name : 'Unassigned');
        }

        if (array_key_exists('staff_note', $data)) {
            $visit->staff_note = filled($data['staff_note']) ? trim((string) $data['staff_note']) : null;
            $visit->save();
        }

        if (array_key_exists('status', $data)) {
            VisitActions::move($visit, VisitStatus::from($data['status']), $actor, $data['cancel_reason'] ?? null);
        }

        return $this->show($visit->refresh());
    }

    /**
     * Set the appointment. `start_at` is read in the app's timezone (IST),
     * which is what a `datetime-local` input posts — a wall-clock time with
     * no offset. Confirming again is a move, and says so to the customer.
     */
    public function confirm(Request $request, VisitRequest $visit): VisitRequestResource
    {
        $data = $request->validate([
            'start_at' => ['required', 'date'],
            'minutes' => ['nullable', 'integer', 'min:15', 'max:720'],
            'assigned_to' => ['nullable', 'integer', Rule::exists('users', 'id')],
        ], [
            'start_at.required' => 'Choose when the engineer will arrive.',
        ]);

        $start = Carbon::parse($data['start_at'], config('app.timezone'))->seconds(0);

        if ($start->isPast()) {
            throw ValidationException::withMessages(['start_at' => 'That time has already passed.']);
        }

        /** @var User $actor */
        $actor = $request->user();

        VisitActions::confirm(
            $visit,
            $start,
            (int) ($data['minutes'] ?? VisitSettings::defaultMinutes()),
            array_key_exists('assigned_to', $data) ? $data['assigned_to'] : $visit->assigned_to,
            $actor,
        );

        return $this->show($visit->refresh());
    }
}
