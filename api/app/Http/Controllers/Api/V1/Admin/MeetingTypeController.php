<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MeetingTypeResource;
use App\Models\MeetingType;
use App\Models\User;
use App\Support\Meetings\Availability;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Meeting types (docs/meetings.md): what can be booked, how long it is, its
 * buffers, whether the public page offers it, and who may host it.
 * `role:sales_manager`.
 *
 * `host_ids` is replaced wholesale, the `faqs` rule; empty means every
 * eligible host. Only staff who hold `meeting_host` may be named — a type
 * restricted to somebody who is not a host would offer nobody. A type that
 * has meetings cannot be deleted (the history points at it); switching it
 * off hides it from booking and leaves its meetings alone.
 */
class MeetingTypeController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        self::eligible();

        $types = MeetingType::query()
            ->with('hosts:id,name')
            ->withCount('meetings')
            ->ordered()
            ->get();

        return MeetingTypeResource::collection($types)->additional(['meta' => [
            'eligible_hosts' => Availability::eligibleQuery()->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);

        $type = MeetingType::create([
            ...collect($data)->except('host_ids')->all(),
            'slug' => $data['slug'] ?? self::uniqueSlug($data['name']),
        ]);
        $type->hosts()->sync($data['host_ids'] ?? []);

        return (new MeetingTypeResource(self::detail($type)))->response()->setStatusCode(201);
    }

    public function show(MeetingType $meetingType): MeetingTypeResource
    {
        return new MeetingTypeResource(self::detail($meetingType));
    }

    public function update(Request $request, MeetingType $meetingType): MeetingTypeResource
    {
        $data = $this->validated($request, $meetingType);

        $meetingType->fill(collect($data)->except('host_ids')->all())->save();

        if (array_key_exists('host_ids', $data)) {
            $meetingType->hosts()->sync($data['host_ids'] ?? []);
        }

        return new MeetingTypeResource(self::detail($meetingType->refresh()));
    }

    public function destroy(MeetingType $meetingType): JsonResponse
    {
        $count = $meetingType->meetings()->count();

        if ($count > 0) {
            throw ValidationException::withMessages(['type' => "This kind of meeting has {$count} ".($count === 1 ? 'meeting' : 'meetings')
                .' booked under it, so it cannot be deleted. Switch it off instead — its meetings are kept.']);
        }

        $meetingType->hosts()->detach();
        $meetingType->delete();

        return response()->json(['message' => 'Meeting type deleted.']);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?MeetingType $type): array
    {
        $sometimes = $type !== null ? ['sometimes'] : [];

        $data = $request->validate([
            'name' => [...$sometimes, 'required', 'string', 'max:120'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:140', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique(MeetingType::class, 'slug')->ignore($type?->id)],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'minutes' => [...$sometimes, 'required', 'integer', 'min:15', 'max:240'],
            'buffer_before' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'buffer_after' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'is_public' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:-100000', 'max:100000'],
            'host_ids' => ['sometimes', 'nullable', 'array', 'max:200'],
            'host_ids.*' => ['integer', 'distinct'],
        ], [
            'slug.regex' => 'Lower-case letters, numbers and single hyphens only.',
            'minutes.min' => 'A meeting is at least 15 minutes.',
            'minutes.max' => 'A meeting is at most 240 minutes.',
        ]);

        if (! empty($data['host_ids'])) {
            $eligible = Availability::eligibleQuery()->whereIn('id', $data['host_ids'])->pluck('id')->map(fn ($id) => (int) $id)->all();
            $missing = array_diff(array_map('intval', $data['host_ids']), $eligible);

            if ($missing !== []) {
                throw ValidationException::withMessages(['host_ids' => 'Only active staff holding the Meeting host role can host — tick the role on their account first.']);
            }
        }

        if (array_key_exists('slug', $data) && blank($data['slug'])) {
            unset($data['slug']);
        }

        return $data;
    }

    private static function detail(MeetingType $type): MeetingType
    {
        self::eligible();

        return $type->load('hosts:id,name')->loadCount('meetings');
    }

    private static function eligible(): void
    {
        MeetingTypeResource::$eligible = Availability::eligibleQuery()->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    private static function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'meeting';
        $slug = $base;

        for ($n = 2; MeetingType::query()->where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }
}
