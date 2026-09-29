<?php

namespace App\Http\Resources\Admin;

use App\Models\MeetingType;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A meeting type as the console edits it (docs/meetings-contract.md,
 * `AdminMeetingType`).
 *
 * `host_ids` empty means every eligible host. `hosts` names the allowed
 * list with `eligible` beside each, because a type restricted to people who
 * have since lost the role offers **nobody** — the screen has to be able to
 * say so. Load `hosts` (with `roles`) and `meetings_count` first; the
 * controller passes the eligible ids.
 *
 * @mixin MeetingType
 */
class MeetingTypeResource extends JsonResource
{
    /** @var list<int> */
    public static array $eligible = [];

    public function toArray(Request $request): array
    {
        $hosts = $this->relationLoaded('hosts') ? $this->hosts : collect();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'minutes' => $this->minutes,
            'buffer_before' => $this->buffer_before,
            'buffer_after' => $this->buffer_after,
            'is_public' => $this->is_public,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
            'host_ids' => $hosts->pluck('id')->map(fn ($id) => (int) $id)->sort()->values(),
            'hosts' => $hosts->sortBy('name')->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'eligible' => in_array((int) $u->id, self::$eligible, true),
            ])->values(),
            'meetings_count' => (int) ($this->meetings_count ?? 0),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
