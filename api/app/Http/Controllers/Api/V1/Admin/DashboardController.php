<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CustomerStatus;
use App\Enums\LeadStatus;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\TicketResource;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Enquiry;
use App\Models\Lead;
use App\Models\Product;
use App\Models\Ticket;
use App\Support\TicketMetrics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => [
            'counts' => [
                'open_tickets' => Ticket::open()->count(),
                'overdue_tickets' => Ticket::overdue()->count(),
                'customers' => Customer::where('status', CustomerStatus::Active)->count(),
                'products' => Product::published()->count(),
                'blog_posts' => BlogPost::published()->count(),
                'new_enquiries' => Enquiry::where('status', 'new')->count(),
            ],
            /*
             * The sales pipeline, and **only for somebody who can open it**.
             *
             * `/admin` is `role:support_engineer` and `/admin/leads` is
             * `role:sales_manager`, so putting these figures on every dashboard
             * would show a support engineer numbers whose tile answers 403 when
             * pressed — a menu of locked doors, which is the argument
             * `admin-nav.tsx` already makes for filtering the sidebar.
             *
             * Null rather than zeroes when the caller is not entitled to it:
             * zero is a measurement, and this is an absence of one. The console
             * renders nothing at all for null.
             *
             * This is a *convenience*, not the access control. `EnsureUserHasRole`
             * is that, on `/admin/leads` itself.
             */
            'leads' => $request->user()?->hasRole(Role::Admin, Role::SalesManager)
                ? [
                    'new' => Lead::where('status', LeadStatus::New)->count(),
                    'open' => Lead::query()->open()->count(),
                    // The one that is actually urgent: somebody was promised a
                    // reply by a date that has passed.
                    'overdue' => Lead::query()->overdue()->count(),
                    'unassigned' => Lead::query()->open()->whereNull('assigned_to')->count(),
                ]
                : null,
            'recent_tickets' => TicketResource::collection(
                Ticket::with(['customer', 'assignee'])->latest()->limit(8)->get()
            ),
            'high_priority' => TicketResource::collection(
                Ticket::with(['customer', 'assignee'])
                    ->open()
                    ->whereIn('priority', ['critical', 'high'])
                    ->orderBy('due_at')
                    ->limit(5)
                    ->get()
            ),
            /*
             * The charts. Every figure here is a decision about which window
             * and which average — see TicketMetrics, which is where those
             * decisions are argued rather than buried in a query.
             */
            'metrics' => [
                'window_days' => TicketMetrics::WINDOW,
                'volume' => TicketMetrics::dailyVolume(),
                'volume_trend' => TicketMetrics::volumeTrend(),
                'first_response_hours' => TicketMetrics::firstResponseHours(),
                'resolution_hours' => TicketMetrics::resolutionHours(),
                'sla_first_response' => TicketMetrics::slaFirstResponse(),
                'open_by_priority' => TicketMetrics::openBy('priority'),
                'open_by_category' => TicketMetrics::openBy('category'),
            ],
            /*
             * Keyed by the enum value, not its label.
             *
             * It used to send "In progress", which is a decision about how to
             * word something on a screen, taken in the data layer. The cost
             * showed up the moment the dashboard wanted to colour those bars
             * the same way it colours the badges: it had a sentence where it
             * needed a status, so every bar fell back to grey. `open_by_priority`
             * above always sent raw values; this is the same endpoint agreeing
             * with itself.
             */
            'status_breakdown' => Ticket::selectRaw('status, count(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status')
                ->map(fn ($n) => (int) $n),
        ]]);
    }
}
