<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Console\Commands\PruneActivityLog;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\ActivityResource;
use App\Models\Activity;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading the activity log. Reading, and nothing else.
 *
 * There is no store, update or destroy here and there must never be. The only
 * thing that removes rows is the scheduled retention prune, which deletes by
 * age and cannot be aimed at a particular line — a log whose subject can edit
 * it is not evidence of anything.
 *
 * `role:admin`, not `support_engineer`: this records colleagues' actions,
 * which is not support-desk business.
 */
class ActivityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $activity = Activity::query()
            ->action($request->string('action')->toString() ?: null)
            ->actor($request->integer('user') ?: null)
            ->search($request->string('q')->toString() ?: null)
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 50), 100))
            ->withQueryString();

        $configured = (int) Setting::get('activity_retention_days', 90);

        return ActivityResource::collection($activity)
            ->additional(['meta' => [
                // Stated on the screen, because "there is nothing before
                // May" should read as policy rather than as a missing record.
                'retention_days' => max(PruneActivityLog::MINIMUM_DAYS, $configured),
                'actions' => Activity::query()
                    ->select('action')->distinct()->orderBy('action')->pluck('action'),
            ]])
            ->response();
    }
}
