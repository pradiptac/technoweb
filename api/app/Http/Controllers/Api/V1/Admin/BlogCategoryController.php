<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\BlogCategoryRequest;
use App\Http\Resources\Admin\BlogCategoryAdminResource;
use App\Models\BlogCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Blog category CRUD. Behind auth:sanctum + role:content_manager.
 *
 * No SEO and no publish status, the call `Brand` already makes: a category is
 * a **facet** — a filtered listing of posts — rather than a page somebody
 * writes. Drafting one is not a thing anybody wants to do, and an empty
 * category simply does not appear, because the sidebar and the strip are built
 * from counts.
 *
 * Bound by **id**, like every other CMS entity, because the edit form can
 * change the slug it is addressed by.
 */
class BlogCategoryController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = BlogCategory::query()
            ->withCount('posts')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where('name', 'like', "%{$term}%");
            })
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return BlogCategoryAdminResource::collection($categories);
    }

    public function show(BlogCategory $blogCategory): JsonResource
    {
        return new BlogCategoryAdminResource($blogCategory->loadCount('posts'));
    }

    public function store(BlogCategoryRequest $request): JsonResponse
    {
        $category = BlogCategory::create($request->validated());

        /*
         * `(new Resource)->response()`, never `response()->json($resource)`.
         * The second serialises through `jsonSerialize()` and drops the `data`
         * wrapper, so a created record comes back shaped unlike every read of
         * one and the console reports a failure for something it just made.
         * That has happened on two modules here already.
         */
        return (new BlogCategoryAdminResource($category->loadCount('posts')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(BlogCategoryRequest $request, BlogCategory $blogCategory): JsonResource
    {
        $blogCategory->update($request->validated());

        return new BlogCategoryAdminResource($blogCategory->fresh()->loadCount('posts'));
    }

    public function destroy(BlogCategory $blogCategory): JsonResponse
    {
        /*
         * The posts survive. The pivot rows cascade and the articles stay
         * exactly where they were, simply uncategorised — the same guarantee
         * deleting a brand or a media folder gives, and the one somebody needs
         * before they will press this button.
         */
        $blogCategory->delete();

        return response()->json(['message' => 'Category deleted. The posts filed under it were kept.']);
    }
}
