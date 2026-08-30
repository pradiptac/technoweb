<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\NewsletterSubscriberResource;
use App\Models\Customer;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Symfony\Component\HttpFoundation\StreamedResponse;

class NewsletterSubscriberController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $subscribers = NewsletterSubscriber::query()
            ->with('groups')
            /*
             * The suppression flag comes from a correlated subquery rather
             * than a join, so a subscriber appears once regardless of how the
             * lists line up — and rather than N queries, which a page of a
             * hundred would otherwise cost.
             */
            ->addSelect(['suppressed' => NewsletterSuppression::query()
                ->selectRaw('1')
                ->whereColumn('newsletter_suppressions.email', 'newsletter_subscribers.email')
                ->limit(1)])
            ->search($request->string('q')->value() ?: null)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('group'), fn ($q) => $q->whereHas('groups',
                fn ($g) => $g->where('newsletter_groups.id', $request->integer('group'))))
            ->when($request->boolean('suppressed'), fn ($q) => $q->whereIn('email',
                NewsletterSuppression::query()->select('email')))
            ->latest('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return NewsletterSubscriberResource::collection($subscribers)->additional([
            'meta' => [
                'statuses' => SubscriberStatus::options(),
                'total_active' => NewsletterSubscriber::where('status', SubscriberStatus::Active)->count(),
                'total_suppressed' => NewsletterSuppression::count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'company' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
        ]);

        $result = SubscriberIntake::take(
            $data['email'], $data, $data['group_ids'] ?? [], 'manual'
        );

        /*
         * A suppressed address is a 422 here, not a silent success.
         *
         * The public form answers identically whatever happens, because
         * anything else leaks who is on the list. This is a signed-in
         * administrator adding somebody deliberately, and "it did nothing and
         * did not say so" is the worst of both — they need to know the address
         * is on the do-not-mail list and that lifting it is a separate,
         * deliberate act.
         */
        if ($result['outcome'] === SubscriberIntake::SUPPRESSED) {
            return response()->json([
                'message' => 'That address has asked not to be contacted.',
                'errors' => ['email' => ['This address is on the do-not-mail list. Remove it from Unsubscribes first, and only if they have asked you to.']],
            ], 422);
        }

        return response()->json([
            'data' => new NewsletterSubscriberResource($result['subscriber']->load('groups')),
            'outcome' => $result['outcome'],
        ], $result['outcome'] === SubscriberIntake::CREATED ? 201 : 200);
    }

    public function show(NewsletterSubscriber $subscriber): JsonResource
    {
        return new NewsletterSubscriberResource($subscriber->load('groups'));
    }

    public function update(Request $request, NewsletterSubscriber $subscriber): JsonResource
    {
        $data = $request->validate([
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'company' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:40'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
        ]);

        /*
         * The email is deliberately not editable, and neither is the status.
         *
         * Changing an address here would move a subscription onto an inbox
         * that never consented to it, silently — the same reasoning that makes
         * a customer's email change re-trigger verification. And the status
         * moves through unsubscribe and suppression, each of which does
         * something besides writing the column.
         */
        $subscriber->update(collect($data)->except('group_ids')->all());

        if ($request->has('group_ids')) {
            $subscriber->groups()->sync($data['group_ids'] ?? []);
        }

        return new NewsletterSubscriberResource($subscriber->fresh()->load('groups'));
    }

    /**
     * Remove a subscriber.
     *
     * The row goes; the suppression, if there is one, **stays** — that is the
     * whole reason suppressions are keyed on the address rather than on a
     * subscriber id. Deleting somebody and re-importing them from a
     * spreadsheet must not resurrect a subscription they withdrew.
     */
    public function destroy(NewsletterSubscriber $subscriber): JsonResponse
    {
        $subscriber->delete();

        return response()->json(null, 204);
    }

    /** Unsubscribe on somebody's behalf — they rang up and asked. */
    public function unsubscribe(Request $request, NewsletterSubscriber $subscriber): JsonResource
    {
        $subscriber->update([
            'status' => SubscriberStatus::Unsubscribed,
            'unsubscribed_at' => now(),
        ]);

        NewsletterSuppression::add(
            $subscriber->email,
            SuppressionReason::Manual,
            $request->string('note')->value() ?: 'Unsubscribed by staff.',
        );

        return new NewsletterSubscriberResource($subscriber->fresh()->load('groups'));
    }

    /**
     * Add a pasted list of addresses.
     *
     * The third way an audience arrives, beside a spreadsheet and the customer
     * list — and the one people actually reach for when they have eleven
     * addresses in an email from a colleague. Adding those one at a time
     * through a four-field form is eleven form submissions to do something
     * that is one paste.
     *
     * Accepts what a paste actually looks like rather than a format nobody
     * will follow: one per line, or comma- or semicolon-separated, and
     * `Name <someone@example.com>` as mail clients write it. The name in angle
     * brackets is kept, because it is free and it is the difference between
     * "Hello there" and "Hello Priya" in the first campaign.
     */
    public function paste(Request $request): JsonResponse
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:200000'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
        ]);

        $tally = ['added' => 0, 'updated' => 0, 'already' => 0, 'suppressed' => 0, 'invalid' => 0];
        $rejected = [];
        $seen = [];

        foreach (self::parseAddresses($data['text']) as $entry) {
            $key = mb_strtolower($entry['email']);

            // Repeated within the paste itself, which is the common case when
            // somebody copies two overlapping lists together.
            if (isset($seen[$key])) {
                $tally['already']++;

                continue;
            }

            $seen[$key] = true;

            $result = SubscriberIntake::take(
                $entry['email'],
                ['first_name' => $entry['first_name'], 'last_name' => $entry['last_name']],
                $data['group_ids'] ?? [],
                'manual',
            );

            match ($result['outcome']) {
                SubscriberIntake::CREATED => $tally['added']++,
                SubscriberIntake::UPDATED => $tally['updated']++,
                SubscriberIntake::DUPLICATE => $tally['already']++,
                SubscriberIntake::SUPPRESSED => $tally['suppressed']++,
                default => $tally['invalid']++,
            };

            if (in_array($result['outcome'], [SubscriberIntake::INVALID, SubscriberIntake::SUPPRESSED], true)
                && count($rejected) < 50) {
                $rejected[] = ['value' => $entry['email'], 'reason' => $result['reason']];
            }
        }

        return response()->json(['data' => [
            ...$tally,
            // Named rather than counted: "12 invalid" with no way to see which
            // twelve means retyping the whole paste to find the typo.
            'rejected' => $rejected,
        ]]);
    }

    /**
     * Pull addresses out of pasted text.
     *
     * Split on the separators a paste actually contains — newlines, commas,
     * semicolons and tabs — and then read each piece. Deliberately **not** a
     * single regular expression scanning for anything email-shaped: that
     * quietly finds addresses inside words and inside URLs, and an importer
     * that invents recipients is worse than one that misses a malformed line
     * somebody can see and fix.
     *
     * @return array<int, array{email: string, first_name: ?string, last_name: ?string}>
     */
    private static function parseAddresses(string $text): array
    {
        $pieces = preg_split('/[\r\n,;\t]+/', $text) ?: [];
        $entries = [];

        foreach ($pieces as $piece) {
            $piece = trim($piece);

            if ($piece === '') {
                continue;
            }

            $name = null;

            // `Priya Nair <priya@example.com>` — the shape a mail client
            // produces when somebody copies a recipient row.
            if (preg_match('/^(.*?)<([^>]+)>$/', $piece, $matches) === 1) {
                $name = trim($matches[1], " \t\"'");
                $piece = trim($matches[2]);
            }

            [$first, $last] = $name === null || $name === ''
                ? [null, null]
                : array_pad(explode(' ', $name, 2), 2, null);

            $entries[] = [
                'email' => $piece,
                'first_name' => $first,
                'last_name' => $last,
            ];
        }

        return $entries;
    }

    /**
     * Add existing portal customers to the list.
     *
     * Every address goes through `SubscriberIntake`, so a customer who
     * unsubscribed last year is refused here exactly as they would be in a
     * spreadsheet. The specification is emphatic about that, and it is the
     * path where it is easiest to get wrong: "add all customers" feels like an
     * internal operation rather than a mailing decision.
     */
    public function importCustomers(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['required', 'in:all,selected'],
            'customer_ids' => ['required_if:scope,selected', 'array'],
            'customer_ids.*' => ['integer'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
        ]);

        $tally = ['added' => 0, 'updated' => 0, 'already' => 0, 'suppressed' => 0, 'invalid' => 0];

        Customer::query()
            ->when($data['scope'] === 'selected', fn ($q) => $q->whereIn('id', $data['customer_ids']))
            ->select(['id', 'name', 'email', 'company', 'phone'])
            // Chunked: "all customers" on a busy install is not a list to hold
            // in memory to produce five counters.
            ->chunkById(500, function ($customers) use (&$tally, $data) {
                foreach ($customers as $customer) {
                    // The portal stores one `name`; the newsletter stores two.
                    // Split on the first space, which is wrong for some names
                    // and is why the greeting falls back to "there" rather
                    // than to a mangled fragment.
                    [$first, $last] = array_pad(explode(' ', trim((string) $customer->name), 2), 2, null);

                    $result = SubscriberIntake::take($customer->email, [
                        'first_name' => $first,
                        'last_name' => $last,
                        'company' => $customer->company,
                        'phone' => $customer->phone,
                    ], $data['group_ids'] ?? [], 'customer', $customer->id);

                    match ($result['outcome']) {
                        SubscriberIntake::CREATED => $tally['added']++,
                        SubscriberIntake::UPDATED => $tally['updated']++,
                        SubscriberIntake::DUPLICATE => $tally['already']++,
                        SubscriberIntake::SUPPRESSED => $tally['suppressed']++,
                        default => $tally['invalid']++,
                    };
                }
            });

        return response()->json(['data' => $tally]);
    }

    /**
     * Export as CSV.
     *
     * Streamed rather than built in memory, and every cell escaped on the way
     * out — a value beginning `=` is a formula to Excel, and an export is a
     * file somebody opens in Excel. See `Csv::escape()`.
     */
    public function export(Request $request): StreamedResponse
    {
        $query = NewsletterSubscriber::query()
            ->with('groups')
            ->search($request->string('q')->value() ?: null)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('group'), fn ($q) => $q->whereHas('groups',
                fn ($g) => $g->where('newsletter_groups.id', $request->integer('group'))));

        $name = 'subscribers-'.now()->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');

            Csv::write($handle, ['Email', 'First name', 'Last name', 'Company', 'Phone', 'Status', 'Groups', 'Subscribed'], (function () use ($query) {
                foreach ($query->lazyById(500) as $s) {
                    yield [
                        $s->email, $s->first_name, $s->last_name, $s->company, $s->phone,
                        $s->status->label(),
                        $s->groups->pluck('name')->implode(', '),
                        $s->subscribed_at?->toDateString(),
                    ];
                }
            })());

            fclose($handle);
        }, $name, ['Content-Type' => 'text/csv']);
    }

    /** The groups picker, so a form does not need a second endpoint. */
    public function groups(): JsonResponse
    {
        return response()->json(['data' => NewsletterGroup::orderBy('name')->get(['id', 'name'])]);
    }
}
