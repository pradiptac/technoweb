<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\MeetingHostHour;
use App\Models\MeetingTimeOff;
use App\Models\User;
use App\Support\Meetings\MeetingCalendar;
use App\Support\Meetings\MeetingSettings;
use App\Support\Meetings\MeetingText;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Meeting hosts (docs/meetings.md): each host's weekly hours, their time
 * off, and whether the connected Google account can see their free/busy.
 * `role:admin`.
 *
 * A host is whoever holds `meeting_host` **explicitly** — ticked on the
 * Staff form, not decided here — and is listed whether active or not, so a
 * deactivated host's hours are still visible. Hours are replaced wholesale;
 * an empty list puts the host back on the default hours.
 *
 * `free_busy`: `visible` when the calendar answered for them, `unknown` when
 * it would not (not shared with the connected account, or outside the
 * domain — the host shares "See only free/busy"), `not_connected` when no
 * calendar is connected. Unknown never blocks a slot.
 */
class MeetingHostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $hosts = self::hosts()->get();
        $freeBusy = self::freeBusy($hosts);

        return response()->json([
            'data' => $hosts->map(fn (User $u) => self::present($u, $freeBusy))->values(),
            'meta' => [
                'default_hours' => self::flatten(MeetingSettings::defaultHours()),
                'timezone' => MeetingSettings::timezone(),
                'timezone_label' => MeetingText::timezone(),
            ],
        ]);
    }

    public function show(User $user): JsonResponse
    {
        $user = self::host($user);

        return response()->json(['data' => self::present($user, self::freeBusy(new Collection([$user])))]);
    }

    /** `{hours: [{weekday, start, end}]}`, replaced; `[]` is the default hours. */
    public function updateHours(Request $request, User $user): JsonResponse
    {
        $user = self::host($user);

        $data = $request->validate([
            'hours' => ['present', 'array', 'max:50'],
            'hours.*.weekday' => ['required', 'integer', 'min:1', 'max:7'],
            'hours.*.start' => ['required', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'hours.*.end' => ['required', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/'],
        ], [
            'hours.*.start.regex' => 'A time on the 24-hour clock, as HH:MM.',
            'hours.*.end.regex' => 'A time on the 24-hour clock, as HH:MM.',
        ]);

        $rows = [];

        foreach ($data['hours'] as $i => $row) {
            if ($row['end'] <= $row['start']) {
                throw ValidationException::withMessages(["hours.{$i}.end" => 'The end is before the start.']);
            }

            $rows[] = ['weekday' => (int) $row['weekday'], 'start' => $row['start'], 'end' => $row['end']];
        }

        DB::transaction(function () use ($user, $rows) {
            MeetingHostHour::query()->where('user_id', $user->id)->delete();

            foreach ($rows as $row) {
                MeetingHostHour::create(['user_id' => $user->id, ...$row]);
            }
        });

        return $this->show($user->refresh());
    }

    public function storeTimeOff(Request $request, User $user): JsonResponse
    {
        $user = self::host($user);

        $data = $request->validate([
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        // A `datetime-local` posts a wall-clock time with no offset: read it
        // on the app's clock. A value with an offset is converted to it.
        $start = CarbonImmutable::parse($data['starts_at'], MeetingSettings::timezone())->setTimezone(MeetingSettings::timezone());
        $end = CarbonImmutable::parse($data['ends_at'], MeetingSettings::timezone())->setTimezone(MeetingSettings::timezone());

        if ($end->lte($start)) {
            throw ValidationException::withMessages(['ends_at' => 'The end is before the start.']);
        }

        MeetingTimeOff::create([
            'user_id' => $user->id,
            'starts_at' => $start,
            'ends_at' => $end,
            'note' => filled($data['note'] ?? null) ? trim((string) $data['note']) : null,
        ]);

        return $this->show($user)->setStatusCode(201);
    }

    public function destroyTimeOff(User $user, MeetingTimeOff $timeOff): JsonResponse
    {
        abort_unless((int) $timeOff->user_id === (int) $user->id, 404);

        $timeOff->delete();

        return $this->show($user);
    }

    /* ------------------------------------------------------------------ */

    /** Everyone holding the role explicitly, active or not. */
    /** @return Builder<User> */
    private static function hosts(): Builder
    {
        return User::query()
            ->whereHas('roles', fn ($r) => $r->where('slug', Role::MeetingHost->value))
            ->orderBy('name');
    }

    private static function host(User $user): User
    {
        abort_unless($user->roles()->where('slug', Role::MeetingHost->value)->exists(), 404);

        return $user;
    }

    /**
     * One free/busy question for everybody listed, over the next day.
     *
     * @param  Collection<int, User>  $hosts
     * @return array<int, string>
     */
    private static function freeBusy(Collection $hosts): array
    {
        $calendar = app(MeetingCalendar::class);

        if (! $calendar->connected()) {
            return array_fill_keys($hosts->pluck('id')->all(), 'not_connected');
        }

        try {
            $busy = $calendar->busy($hosts->pluck('email')->filter()->values()->all(), now(), now()->addDay());
        } catch (\Throwable $e) {
            Log::warning('Google free/busy could not be read for the hosts screen', ['error' => $e->getMessage()]);
            $busy = [];
        }

        $out = [];

        foreach ($hosts as $host) {
            $out[$host->id] = is_array($busy[$host->email] ?? null) ? 'visible' : 'unknown';
        }

        return $out;
    }

    /** @param  array<int, string>  $freeBusy */
    private static function present(User $user, array $freeBusy): array
    {
        $hours = MeetingHostHour::query()->where('user_id', $user->id)
            ->orderBy('weekday')->orderBy('start')->get();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => (bool) $user->is_active,
            'uses_default_hours' => $hours->isEmpty(),
            'hours' => $hours->map(fn (MeetingHostHour $h) => [
                'weekday' => $h->weekday,
                'start' => substr((string) $h->start, 0, 5),
                'end' => substr((string) $h->end, 0, 5),
            ])->values(),
            'time_off' => MeetingTimeOff::query()->where('user_id', $user->id)
                ->where('ends_at', '>', now())
                ->orderBy('starts_at')->get()
                ->map(fn (MeetingTimeOff $t) => [
                    'id' => $t->id,
                    'starts_at' => $t->starts_at->toIso8601String(),
                    'ends_at' => $t->ends_at->toIso8601String(),
                    'note' => $t->note,
                    'label' => MeetingText::date($t->starts_at).' '.MeetingText::local($t->starts_at)->format('H:i')
                        .' – '.MeetingText::date($t->ends_at).' '.MeetingText::local($t->ends_at)->format('H:i').' '.MeetingText::timezone(),
                ])->values(),
            'upcoming_count' => Meeting::query()->upcoming()->where('host_id', $user->id)->count(),
            'free_busy' => $freeBusy[$user->id] ?? 'unknown',
        ];
    }

    /**
     * @param  array<int, list<array{0: string, 1: string}>>  $hours
     * @return list<array{weekday: int, start: string, end: string}>
     */
    private static function flatten(array $hours): array
    {
        $out = [];

        foreach ($hours as $weekday => $spans) {
            foreach ($spans as [$start, $end]) {
                $out[] = ['weekday' => (int) $weekday, 'start' => $start, 'end' => $end];
            }
        }

        return $out;
    }
}
