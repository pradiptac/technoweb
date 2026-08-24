<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\TicketResource;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Enquiry;
use App\Models\Product;
use App\Models\Ticket;
use App\Support\TicketMetrics;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => [
            'counts' => [
                'open_tickets' => Ticket::open()->count(),
                'overdue_tickets' => Ticket::overdue()->count(),
                'customers' => Customer::where('is_active', true)->count(),
                'products' => Product::published()->count(),
                'blog_posts' => BlogPost::published()->count(),
                'new_enquiries' => Enquiry::where('status', 'new')->count(),
            ],
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
            'status_breakdown' => Ticket::selectRaw('status, count(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status')
                ->mapWithKeys(fn ($n, $s) => [TicketStatus::from($s)->label() => (int) $n]),
        ]]);
    }
}
