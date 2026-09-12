<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientRequest;
use App\Http\Resources\Admin\ClientResource;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Behind auth:sanctum + role:content_manager. The `Popup` shape: no slug, no
 * SEO, one request for both writes.
 */
class ClientController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rows = Client::query()
            ->with('industry')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return ClientResource::collection($rows);
    }

    public function store(ClientRequest $request): JsonResponse
    {
        $client = Client::create($request->validated());

        return (new ClientResource($client->load('industry')))->response()->setStatusCode(201);
    }

    public function show(Client $client): JsonResource
    {
        return new ClientResource($client->load('industry'));
    }

    public function update(ClientRequest $request, Client $client): JsonResource
    {
        $client->update($request->validated());

        return new ClientResource($client->fresh()->load('industry'));
    }

    public function destroy(Client $client): JsonResponse
    {
        $client->delete();

        return response()->json(null, 204);
    }
}
