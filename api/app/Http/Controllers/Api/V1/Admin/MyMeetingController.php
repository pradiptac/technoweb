<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MeetingResource;
use App\Models\Meeting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * A host's own meetings (docs/meetings.md), scoped to `host_id` — the diary
 * of somebody who hosts calls and is neither sales nor support. The list,
 * the filters and the outcome are the desk's own (`MeetingController`), with
 * one more condition on every query; another host's meeting is a 404.
 *
 * A host records what happened and keeps a note; moving and cancelling stay
 * with the desk, which owns the customer's diary.
 */
class MyMeetingController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return MeetingController::listing($request, (int) $request->user()?->id);
    }

    public function show(Request $request, Meeting $meeting): MeetingResource
    {
        self::own($request, $meeting);

        return new MeetingResource(MeetingController::detail($meeting));
    }

    public function update(Request $request, Meeting $meeting): MeetingResource
    {
        self::own($request, $meeting);
        MeetingController::applyUpdate($request, $meeting);

        return new MeetingResource(MeetingController::detail($meeting->refresh()));
    }

    /** Another host's meeting is a 404, never a 403. */
    private static function own(Request $request, Meeting $meeting): void
    {
        abort_unless($meeting->host_id !== null && (int) $meeting->host_id === (int) $request->user()?->id, 404);
    }
}
