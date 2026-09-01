<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\LeadStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\LeadResource;
use App\Models\Lead;
use App\Models\LeadNote;
use App\Models\User;
use App\Support\Money;
use App\Support\Newsletter\Csv;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Working the pipeline.
 *
 * Read and move; nothing here creates a lead. A lead exists because somebody
 * filled in a form, and an endpoint that could invent one would make every
 * figure on this screen unauditable — the same reason the activity log has no
 * write path. Deleting is offered, because spam and test submissions are real
 * and a queue nobody can clear is a queue nobody works.
 */
class LeadController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $leads = $this->filtered($request)
            ->with('assignee:id,name')
            ->orderBy(...$this->ordering($request))
            // Every ordering ends on the id, or a page boundary can show one
            // row twice and hide another: the leads the backfill created share
            // a `created_at` to the second, and MySQL is free to order equal
            // rows differently between two queries.
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return LeadResource::collection($leads)->additional(['meta' => [
            'statuses' => LeadStatus::options(),
            'bands' => ['hot', 'warm', 'cold', 'unscored'],
            /*
             * Counted over the whole table rather than the page. Both are
             * headline figures somebody acts on, and a count of what happens to
             * be on screen is not one.
             */
            'new_count' => Lead::where('status', LeadStatus::New)->count(),
            'overdue_count' => Lead::query()->overdue()->count(),
            'assignees' => User::query()->where('is_active', true)
                ->orderBy('name')->get(['id', 'name'])
                ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name]),
            /*
             * Which pages produce enquiries — the question the source capture
             * exists to answer, and one nothing here could answer before. A top
             * ten rather than a report: anybody wanting the whole distribution
             * has the export.
             */
            'top_pages' => Lead::query()
                ->whereNotNull('source_path')
                ->selectRaw('source_path, COUNT(*) as total')
                ->groupBy('source_path')
                ->orderByDesc('total')
                ->limit(10)
                ->get()
                ->map(fn ($r) => ['path' => $r->source_path, 'total' => (int) $r->total]),
        ]]);
    }

    /**
     * The filters, in one place because two screens read them.
     *
     * The export has to return exactly what the list is showing, or "export"
     * and "the rows in front of me" are two different sets and whoever opens
     * the file works from the wrong one. Restating a filter block is precisely
     * how that drifts, so there is one.
     */
    private function filtered(Request $request): Builder
    {
        return Lead::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('band'), fn ($q) => $q->where('score_band', $request->string('band')))
            ->when($request->filled('channel'), fn ($q) => $q->where('channel', $request->string('channel')))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('assigned_to', $request->integer('assigned_to')))
            ->when($request->boolean('unassigned'), fn ($q) => $q->whereNull('assigned_to'))
            /*
             * The two filters this screen is actually opened for, and neither
             * is a status. "Still to be answered" and "promised a reply that
             * has passed" are the two jobs on a sales desk, and the status
             * column shows neither — the same argument the order queue makes
             * for `?open=` and `?unpaid=`.
             */
            ->when($request->boolean('open'), fn ($q) => $q->open())
            ->when($request->boolean('overdue'), fn ($q) => $q->overdue())
            ->when($request->filled('source_path'), fn ($q) => $q->where('source_path', 'like', $request->string('source_path')->value().'%'))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('subject', 'like', "%{$term}%")
                    ->orWhere('message', 'like', "%{$term}%"));
            });
    }

    /**
     * `?sort=` is a whitelist and an unknown value falls back.
     *
     * The rule the catalogue and the media library already follow: a sort
     * parameter is the kind of thing that arrives mangled from an old
     * bookmark, and an error page is a worse answer than the default order.
     */
    private function ordering(Request $request): array
    {
        return match ($request->string('sort')->value()) {
            'score' => ['score', 'desc'],
            'oldest' => ['created_at', 'asc'],
            'follow_up' => ['follow_up_at', 'asc'],
            default => ['created_at', 'desc'],
        };
    }

    /**
     * The same rows, as a file.
     *
     * Streamed rather than assembled in memory, and every cell escaped on the
     * way out by `Csv::write` — a value beginning `=` is a formula to Excel,
     * and this is a file somebody opens in Excel. There is one CSV writer in
     * this application; a second set of escaping rules here would be a second
     * set to keep right.
     */
    public function export(Request $request): StreamedResponse
    {
        $query = $this->filtered($request)
            ->with('assignee:id,name')
            ->orderBy(...$this->ordering($request))
            ->orderByDesc('id');

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');

            Csv::write($handle, [
                'Received', 'Name', 'Email', 'Phone', 'Company', 'Subject', 'Message',
                'Form', 'Page', 'Page title', 'Referrer', 'UTM source', 'UTM medium', 'UTM campaign',
                'Score', 'Band', 'Status', 'Owner', 'Follow up', 'Value (INR)',
            ], (function () use ($query) {
                foreach ($query->lazyById(500) as $lead) {
                    yield [
                        $lead->created_at?->toDateTimeString(),
                        $lead->name, $lead->email, $lead->phone, $lead->company, $lead->subject,
                        $lead->message,
                        $lead->form_name, $lead->source_path, $lead->source_title, $lead->referrer,
                        $lead->utm_source, $lead->utm_medium, $lead->utm_campaign,
                        $lead->score, $lead->score_band,
                        $lead->status->label(),
                        $lead->assignee?->name,
                        $lead->follow_up_at?->toDateString(),
                        /*
                         * A plain decimal, never a formatted amount. A cell
                         * reading "Rs 1,18,000" is text to Excel and cannot be
                         * summed, which is the one thing anybody opens the file
                         * to do; the unit is in the column heading instead.
                         */
                        $lead->value_paise === null ? null : Money::toRupeeString($lead->value_paise),
                    ];
                }
            })());

            fclose($handle);
        }, 'leads-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function show(Lead $lead): JsonResource
    {
        return (new LeadResource($lead->load(['assignee:id,name', 'notes.author:id,name', 'source'])))
            ->withDetail();
    }

    /**
     * Move it on, assign it, promise a date.
     *
     * One endpoint rather than four, because these are edited together on one
     * panel and four round trips to save one screen is four chances for half of
     * it to land. The status is the only field with a rule behind it, and it is
     * checked against the enum so an illegal move is a 422 naming both states
     * rather than a lead in a state nothing can move it out of.
     */
    public function update(Request $request, Lead $lead): JsonResource
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::enum(LeadStatus::class)],
            'assigned_to' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'follow_up_at' => ['sometimes', 'nullable', 'date'],
            // Paise, as everywhere else here. Rupees on the wire is where an
            // estimate becomes 1179.9999.
            'value_paise' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:99999999999'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $actor = $request->user();

        if (array_key_exists('status', $data)) {
            $next = LeadStatus::from($data['status']);

            if ($next !== $lead->status) {
                abort_if(
                    ! $lead->status->canTransitionTo($next),
                    422,
                    "A lead cannot go from {$lead->status->label()} to {$next->label()}.",
                );

                $this->stamp($lead, $next);
                // Written before the assignment, so the line reads with the
                // state it moved *from* rather than twice with the new one.
                $this->trail($lead, $actor, 'status', "{$lead->status->label()} → {$next->label()}", [
                    'from' => $lead->status->value,
                    'to' => $next->value,
                ]);
                $lead->status = $next;
            }
        }

        if (array_key_exists('assigned_to', $data) && $data['assigned_to'] !== $lead->assigned_to) {
            $to = $data['assigned_to'] ? User::find($data['assigned_to']) : null;
            $this->trail($lead, $actor, 'assigned', $to ? "Assigned to {$to->name}" : 'Unassigned');
            $lead->assigned_to = $data['assigned_to'];
        }

        foreach (['follow_up_at', 'value_paise'] as $field) {
            if (array_key_exists($field, $data)) {
                $lead->{$field} = $data[$field];
            }
        }

        $lead->save();

        // A note typed on the same panel as a status change belongs to that
        // change; posting it separately would file it a second behind in a
        // trail that is read top to bottom.
        if (filled($data['note'] ?? null)) {
            $this->trail($lead, $actor, 'note', $data['note']);
        }

        return (new LeadResource($lead->fresh(['assignee:id,name', 'notes.author:id,name', 'source'])))->withDetail();
    }

    public function note(Request $request, Lead $lead): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $this->trail($lead, $request->user(), 'note', $data['body']);

        return response()->json(['message' => 'Note added.'], 201);
    }

    public function destroy(Lead $lead): JsonResponse
    {
        /*
         * The submission it was made from is deliberately left alone. That row
         * is the record of something a person actually sent, and clearing a
         * pipeline is not a reason to destroy the evidence — the same rule that
         * keeps a form's submissions when the form itself is deleted.
         */
        $lead->delete();

        return response()->json(['message' => 'Lead deleted.']);
    }

    /**
     * Timestamps are set on arrival and not cleared by a later move.
     *
     * The rule `resolved_at` had to be taught on tickets, where closing one
     * erased the moment it was resolved and every throughput figure read that
     * column. `contacted_at` is what "how fast do we answer an enquiry" is
     * computed from, so a lead later marked Lost has to keep it.
     *
     * It is stamped by reaching a state that means somebody actually replied,
     * not by any move at all: `New → Lost` is a lead written off without ever
     * being answered, and recording that as a contact would flatter the one
     * figure the column exists to produce.
     *
     * `closed_at` is the deliberate exception and is cleared by a move back
     * into the pipeline — a revived lead was not closed, and leaving the stamp
     * on it would file it under a month it is still being worked in.
     */
    private function stamp(Lead $lead, LeadStatus $next): void
    {
        $replied = [LeadStatus::Contacted, LeadStatus::Qualified, LeadStatus::Won];

        if (! $lead->contacted_at && in_array($next, $replied, true)) {
            $lead->contacted_at = now();
        }

        $lead->closed_at = $next->isOpen() ? null : ($lead->closed_at ?? now());
    }

    private function trail(Lead $lead, ?User $actor, string $kind, string $body, array $context = []): void
    {
        LeadNote::create([
            'lead_id' => $lead->id,
            'user_id' => $actor?->id,
            // Copied rather than joined, the rule the activity log follows: a
            // trail that forgets who did something once they leave the company
            // has failed at exactly the point it is being read.
            'actor_name' => $actor?->name,
            'kind' => $kind,
            'body' => $body,
            'context' => $context ?: null,
        ]);
    }
}
