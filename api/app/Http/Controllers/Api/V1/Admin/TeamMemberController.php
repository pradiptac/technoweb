<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\TeamMemberRequest;
use App\Http\Resources\Admin\TeamMemberResource;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Behind auth:sanctum + role:content_manager.
 *
 * A member's certifications are a child table replaced wholesale on save,
 * exactly as `SliderController::syncSlides()` does for slides: absent means
 * untouched, `[]` means cleared.
 */
class TeamMemberController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rows = TeamMember::query()
            ->withCount('certifications')
            ->when($request->filled('q'), fn ($q) => $q->where(function ($w) use ($request) {
                $term = '%'.$request->string('q')->value().'%';
                $w->where('name', 'like', $term)->orWhere('designation', 'like', $term);
            }))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->string('department')))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        // `meta.departments` rides on the index because the console's *new*
        // screen has no record to read it from — the `PopupController` rule.
        return TeamMemberResource::collection($rows)
            ->additional(['meta' => self::meta()]);
    }

    public function store(TeamMemberRequest $request): JsonResponse
    {
        $member = DB::transaction(function () use ($request) {
            $member = TeamMember::create($request->safe()->except('certifications'));
            $this->syncCertifications($member, $request->validated('certifications'));

            return $member;
        });

        return (new TeamMemberResource($member->load('certifications')))
            ->response()->setStatusCode(201);
    }

    public function show(TeamMember $teamMember): JsonResource
    {
        return (new TeamMemberResource($teamMember->load('certifications')))
            ->additional(['meta' => self::meta()]);
    }

    public function update(TeamMemberRequest $request, TeamMember $teamMember): JsonResource
    {
        DB::transaction(function () use ($request, $teamMember) {
            $teamMember->update($request->safe()->except('certifications'));
            $this->syncCertifications($teamMember, $request->validated('certifications'));
        });

        return new TeamMemberResource($teamMember->fresh()->load('certifications'));
    }

    public function destroy(TeamMember $teamMember): JsonResponse
    {
        // The certifications go with the row (cascade); the photo stays in
        // the media library.
        $teamMember->delete();

        return response()->json(null, 204);
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $rows
     */
    private function syncCertifications(TeamMember $member, ?array $rows): void
    {
        if ($rows === null) {
            return;
        }

        $member->certifications()->delete();

        foreach (array_values($rows) as $i => $row) {
            $member->certifications()->create([
                'name' => $row['name'],
                'issuer' => $row['issuer'] ?? null,
                'credential_id' => $row['credential_id'] ?? null,
                'issued_on' => $row['issued_on'] ?? null,
                'expires_on' => $row['expires_on'] ?? null,
                // The order the editor submitted, not a number they maintain.
                'sort_order' => $i,
            ]);
        }
    }

    /**
     * @return array{departments: list<string>}
     */
    private static function meta(): array
    {
        return ['departments' => TeamMember::departments()];
    }
}
