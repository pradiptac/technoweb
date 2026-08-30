<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Models\NewsletterGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NewsletterGroupController extends Controller
{
    public function index(): JsonResponse
    {
        $groups = NewsletterGroup::query()
            ->withCount([
                'subscribers',
                // The number that matters before a send: how many of these
                // people can actually be mailed. A group of 900 with 40
                // mailable is a group somebody needs to look at.
                'subscribers as active_count' => fn ($q) => $q->where('newsletter_subscribers.status', SubscriberStatus::Active->value),
            ])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $groups->map(fn (NewsletterGroup $g) => [
            'id' => $g->id,
            'source' => $g->source,
            'managed' => $g->isManaged(),
            'name' => $g->name,
            'slug' => $g->slug,
            'description' => $g->description,
            'is_active' => $g->is_active,
            'subscriber_count' => $g->subscribers_count,
            'active_count' => $g->active_count,
        ])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('newsletter_groups', 'name')],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['boolean'],
        ]);

        return response()->json(['data' => NewsletterGroup::create($data)], 201);
    }

    public function update(Request $request, NewsletterGroup $group): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120', Rule::unique('newsletter_groups', 'name')->ignore($group->id)],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['boolean'],
        ]);

        $group->update($data);

        return response()->json(['data' => $group->fresh()]);
    }

    /**
     * Delete a group.
     *
     * The pivot cascades, so the memberships go — and the subscribers stay. A
     * group is a label; the addresses are the expensive thing, and losing a
     * thousand of them to one confirmation dialog is not a mistake anybody
     * recovers from. Same rule the media library follows for folders, and the
     * dialog says so for the same reason.
     */
    public function destroy(NewsletterGroup $group): JsonResponse
    {
        /*
         * The customers group is not deletable.
         *
         * It would come straight back on the next sync, under a new id, having
         * lost every campaign's record of having been sent to it — so the
         * button would appear to work and quietly destroy history. Refusing it
         * with a sentence is the honest version of what already happens.
         */
        if ($group->isManaged()) {
            return response()->json([
                'message' => 'This group is kept in step with the portal customer list and cannot be deleted. '
                    .'Switch it off instead if you do not want to send to it.',
            ], 422);
        }

        $group->delete();

        return response()->json(null, 204);
    }

    /** Add or remove subscribers in bulk, from the group's own screen. */
    public function members(Request $request, NewsletterGroup $group): JsonResponse
    {
        /*
         * A derived group cannot be edited by hand.
         *
         * Membership is recomputed from the customer table, so anything added
         * or removed here survives until the next sync and then vanishes —
         * which is worse than being refused, because the screen said it worked.
         */
        if ($group->isManaged()) {
            return response()->json([
                'message' => 'This group is worked out from the portal customer list, so its members '
                    .'cannot be changed by hand — an edit here would be undone on the next update.',
            ], 422);
        }

        $data = $request->validate([
            'action' => ['required', 'in:add,remove'],
            'subscriber_ids' => ['required', 'array'],
            'subscriber_ids.*' => ['integer'],
        ]);

        if ($data['action'] === 'add') {
            // Without detaching: adding twenty people to a group must not
            // remove everybody already in it.
            $group->subscribers()->syncWithoutDetaching($data['subscriber_ids']);
        } else {
            $group->subscribers()->detach($data['subscriber_ids']);
        }

        return response()->json(['data' => ['count' => $group->subscribers()->count()]]);
    }
}
