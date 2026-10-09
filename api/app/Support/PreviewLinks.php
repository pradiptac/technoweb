<?php

namespace App\Support;

use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\CareersController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\ContentTypeController;
use App\Http\Controllers\Api\V1\EventController;
use App\Http\Controllers\Api\V1\LandingPageController;
use App\Http\Controllers\Api\V1\StoreController;
use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Entry;
use App\Models\Event;
use App\Models\JobOpening;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Page;
use App\Models\PreviewLink;
use App\Models\Product;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The twelve kinds of record a draft share link can open (0.138.0).
 *
 * **The one list.** Keys are morph-map aliases, so the same word is what the
 * `preview_links` row stores, what the console sends and what the activity log
 * records; the owning role is here too, because who may share a record is
 * whoever may edit it — a content manager cannot link a shop product.
 *
 * **A preview is the public read, not a second implementation of it.**
 * `present()` hands the record to the same method the public controller's
 * `show()` calls after its own published check, so what a reviewer sees has
 * every relation, section and custom field the live page will have. The two
 * keys that exist to feed a search engine, `schema` and `faq_schema`, are
 * removed: a preview must emit no structured data.
 */
final class PreviewLinks
{
    /** How long a link may live, in days, and which one the console starts on. */
    public const DAYS = [1, 7, 30];

    public const DEFAULT_DAYS = 7;

    /** Keys of the public read that exist for search engines alone. */
    private const STRIPPED = ['schema', 'faq_schema'];

    /**
     * alias => [model, owning role].
     *
     * @return array<string, array{0: class-string<Model>, 1: string}>
     */
    private static function types(): array
    {
        return [
            'page' => [Page::class, 'content_manager'],
            'blog_post' => [BlogPost::class, 'content_manager'],
            'knowledge_article' => [KnowledgeArticle::class, 'content_manager'],
            'case_study' => [CaseStudy::class, 'content_manager'],
            'solution' => [Solution::class, 'content_manager'],
            'service' => [Service::class, 'content_manager'],
            'product' => [Product::class, 'content_manager'],
            'store_product' => [StoreProduct::class, 'store_manager'],
            'event' => [Event::class, 'content_manager'],
            'job_opening' => [JobOpening::class, 'content_manager'],
            'entry' => [Entry::class, 'content_manager'],
            'landing_page' => [LandingPage::class, 'seo_manager'],
        ];
    }

    /** @return array<int, string> */
    public static function aliases(): array
    {
        return array_keys(self::types());
    }

    public static function knows(string $alias): bool
    {
        return isset(self::types()[$alias]);
    }

    /** The staff role that owns this kind of record; an administrator passes anyway. */
    public static function roleFor(string $alias): ?string
    {
        return self::types()[$alias][1] ?? null;
    }

    /** Whether this staff member may share this kind of record — `EnsureUserHasRole`'s rule. */
    public static function allows(User $user, string $alias): bool
    {
        $role = self::roleFor($alias);

        return $role !== null && ($user->isAdmin() || $user->hasRole($role));
    }

    /**
     * The record itself, loaded the way its public read needs it to start from.
     * Queried directly rather than through a link's `subject` relation, so
     * `preventLazyLoading` has nothing to object to.
     */
    public static function find(string $alias, int $id): ?Model
    {
        $class = self::types()[$alias][0] ?? null;

        if ($class === null) {
            return null;
        }

        return match ($alias) {
            'landing_page' => LandingPage::query()->withContext()->find($id),
            'entry' => Entry::query()->with('contentType')->find($id),
            default => $class::query()->find($id),
        };
    }

    public static function titleOf(Model $record): string
    {
        return (string) ($record->getAttribute('title') ?? $record->getAttribute('name') ?? '');
    }

    /** "Draft", "Published" or "Archived" — what the banner and the console say. */
    public static function statusOf(Model $record): PublishStatus
    {
        $status = $record->getAttribute('status');

        return $status instanceof PublishStatus ? $status : PublishStatus::Draft;
    }

    /**
     * The public detail read for this record, as an array, **without** the
     * structured data. Whatever the record's status.
     *
     * @return array<string, mixed>
     */
    public static function present(string $alias, Model $record, Request $request): array
    {
        $resource = self::resource($alias, $record);

        /** @var array<string, mixed> $data */
        $data = $resource->toResponse($request)->getData(true)['data'] ?? [];

        return array_diff_key($data, array_flip(self::STRIPPED));
    }

    private static function resource(string $alias, Model $record): JsonResource
    {
        return match (true) {
            $record instanceof Page => app(ContentController::class)->presentPage($record),
            $record instanceof BlogPost => app(ContentController::class)->presentPost($record),
            $record instanceof KnowledgeArticle => app(ContentController::class)->presentKnowledgeArticle($record),
            $record instanceof CaseStudy => app(ContentController::class)->presentCaseStudy($record),
            $record instanceof Solution => app(ContentController::class)->presentSolution($record),
            $record instanceof Service => app(ContentController::class)->presentService($record),
            $record instanceof Product => app(CatalogueController::class)->presentProduct($record),
            $record instanceof StoreProduct => app(StoreController::class)->presentProduct($record),
            $record instanceof Event => app(EventController::class)->present($record),
            $record instanceof JobOpening => app(CareersController::class)->present($record),
            $record instanceof Entry => app(ContentTypeController::class)->present($record, $record->contentType),
            $record instanceof LandingPage => app(LandingPageController::class)->present($record),
            default => throw new \LogicException("No preview for [{$alias}]."),
        };
    }

    /** The row that holds a live link to this record, if any (expired ones included). */
    public static function linkFor(string $alias, int $id): ?PreviewLink
    {
        return PreviewLink::query()
            ->where('subject_type', $alias)
            ->where('subject_id', $id)
            ->with('creator')
            ->latest('id')
            ->first();
    }
}
