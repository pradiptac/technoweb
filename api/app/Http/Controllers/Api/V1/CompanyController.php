<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CertificationResource;
use App\Http\Resources\ClientResource;
use App\Http\Resources\TeamMemberResource;
use App\Models\Certification;
use App\Models\Client;
use App\Models\TeamMember;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The company profile: the team, the clients and the certifications.
 *
 * Three plain collections that answer 200 when empty — the `/popups`
 * argument. An empty list is the ordinary state of a fresh install, and
 * every one of these is read on the homepage and the About page, where a
 * 404 would be an error condition on every render.
 */
class CompanyController extends Controller
{
    public function team(): AnonymousResourceCollection
    {
        $members = TeamMember::query()
            ->published()
            // Filtered *here*, on the eager load, so the public resource never
            // has to know which rows to leave out: a lapsed certification
            // simply does not arrive.
            ->with(['certifications' => fn ($q) => $q->current()])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return TeamMemberResource::collection($members);
    }

    public function clients(): AnonymousResourceCollection
    {
        $clients = Client::query()
            ->published()
            ->with('industry')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return ClientResource::collection($clients);
    }

    public function certifications(): AnonymousResourceCollection
    {
        $rows = Certification::query()
            ->live()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return CertificationResource::collection($rows);
    }
}
