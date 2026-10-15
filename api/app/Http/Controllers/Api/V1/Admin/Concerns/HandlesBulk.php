<?php

namespace App\Http\Controllers\Api\V1\Admin\Concerns;

use App\Enums\PublishStatus;
use App\Http\Requests\BulkActionRequest;
use App\Support\PublishStamp;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Bulk actions on a console list (0.139.0, `docs/admin-console.md`
 * "Bulk actions").
 *
 * `POST /admin/{entity}/bulk` takes `ids` and one `action` — publish, draft,
 * archive or delete — and answers **200 always** with what it did and what it
 * refused, the shape `TicketController::bulk()` set:
 *
 *     {updated: [ids], refused: [{id, title, message}]}
 *
 * ### One record at a time, through the single-record path
 *
 * A mass `update()` or `delete()` skips model events, and the events are the
 * work: a product's slug released, a category's children promoted to its
 * parent, a redirect written, an IndexNow ping, a private upload removed with
 * its download. So each record is loaded, handled and committed on its own —
 * its own transaction — and a delete calls the same `remove()` method the
 * controller's `destroy()` calls, a status change the same `save()` an edit
 * makes. A rule has one definition and both paths read it.
 *
 * ### A record that may not move is refused in its own words
 *
 * `$guard` runs before a status is applied and throws what the edit screen
 * would have shown: a landing page that fails `LandingPageQuality`, a download
 * with no file, an event with no join link. `remove()` may throw as `destroy()`
 * does — an event with registrations, a category still in use. Both an
 * `HttpException` and a `ValidationException` are turned into one sentence on
 * that record, and the rest of the batch goes on; a triage pass over fifty
 * rows should not stop at the one it cannot move.
 *
 * An id that does not exist (or is outside `$query`'s scope — another content
 * type's entry) is simply absent from both lists.
 */
trait HandlesBulk
{
    /**
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query  Every record this list may touch; the ids are narrowed from it.
     * @param  Closure(TModel): void  $remove  What `destroy()` does, without its response.
     * @param  (Closure(TModel, PublishStatus): void)|null  $guard  Throws to refuse a status change.
     */
    protected function runBulk(
        BulkActionRequest $request,
        Builder $query,
        Closure $remove,
        ?Closure $guard = null,
    ): JsonResponse {
        $action = (string) $request->input('action');
        $target = match ($action) {
            'publish' => PublishStatus::Published,
            'draft' => PublishStatus::Draft,
            'archive' => PublishStatus::Archived,
            default => null,
        };

        /** @var list<int> $ids */
        $ids = array_map('intval', (array) $request->input('ids'));
        $records = $query->whereKey($ids)->get()->keyBy(fn (Model $m) => (int) $m->getKey());

        $updated = [];
        $refused = [];

        // In the order the rows were ticked, which is the order they were
        // shown in.
        foreach ($ids as $id) {
            $record = $records->get($id);

            if ($record === null) {
                continue;
            }

            try {
                DB::transaction(function () use ($record, $target, $remove, $guard) {
                    if ($target === null) {
                        $remove($record);

                        return;
                    }

                    $this->applyStatus($record, $target, $guard);
                });

                $updated[] = $id;
            } catch (ValidationException $e) {
                $refused[] = $this->refusal($record, (string) collect($e->errors())->flatten()->first());
            } catch (HttpException $e) {
                $refused[] = $this->refusal($record, $e->getMessage());
            }
        }

        // Read by `ActivityLogger`: a bulk delete is as worth a line as a
        // single one, and it counts what was deleted, not what was asked for.
        // Set on the application's request, which the middleware holds — a
        // form request is a copy, and its attributes go nowhere.
        if ($target === null && $updated !== []) {
            request()->attributes->set('bulk_deleted', count($updated));
        }

        return response()->json(['updated' => $updated, 'refused' => $refused]);
    }

    /**
     * One record's status, through the model's ordinary `save()` so every
     * hook fires. Asking for the status it already has changes nothing and
     * is not judged again — a published page the cap would now refuse is not
     * un-published by being published twice.
     *
     * @template TModel of Model
     *
     * @param  TModel  $record
     * @param  (Closure(TModel, PublishStatus): void)|null  $guard
     */
    private function applyStatus(Model $record, PublishStatus $target, ?Closure $guard): void
    {
        if ($record->getAttribute('status') === $target) {
            return;
        }

        if ($guard !== null) {
            $guard($record, $target);
        }

        $attributes = ['status' => $target->value];

        // Only the models that have the column: `preventSilentlyDiscardingAttributes`
        // would throw for the rest.
        if ($record->isFillable('published_at')) {
            $attributes = PublishStamp::apply($attributes, $record);
        }

        $record->update($attributes);
    }

    /** @return array{id: int, title: string, message: string} */
    private function refusal(Model $record, string $message): array
    {
        return [
            'id' => (int) $record->getKey(),
            'title' => (string) ($record->getAttribute('title') ?? $record->getAttribute('name') ?? '#'.$record->getKey()),
            'message' => $message !== '' ? $message : 'That could not be done.',
        ];
    }
}
