<?php

namespace App\Support\Copilot;

use App\Enums\CustomerStatus;
use App\Enums\LeadStatus;
use App\Enums\OrderStatus;
use App\Enums\PublishStatus;
use App\Enums\Role;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Page;
use App\Models\ProductReview;
use App\Models\StoreProduct;
use App\Models\Ticket;
use App\Models\User;
use App\Support\Money;
use App\Support\QueueHealth;

/**
 * Everything the console can be asked (0.177.0, `docs/copilot.md`).
 *
 * **One list, and it is the whole feature.** The copilot cannot answer a
 * question that is not here, which is the point rather than a limitation:
 * a question that is here was written by somebody who knew what the figure
 * means, reads it out of a scope the console already trusts, and links to
 * the screen that would show the same number. A copilot that composes its
 * own queries can answer more questions and cannot be trusted with any of
 * them.
 *
 * **Every answer is an existing scope.** `Ticket::open()`, `Lead::overdue()`,
 * `OrderReturn::waiting()` — the same expressions the dashboard tiles and
 * the list filters use. Not "similar to": the same. So a figure here and
 * the figure on the screen it links to cannot drift, and widening a scope
 * moves both at once.
 *
 * **Roles are the API's, not the drawer's.** Each question names the role
 * entitled to ask it and `for()` filters the list before anything else
 * happens — before the words are matched, before a model is shown
 * anything. An administrator passes every one, the implicit pass
 * `EnsureUserHasRole` already grants everywhere.
 */
final class Questions
{
    /**
     * Every question, in the order the drawer suggests them.
     *
     * @return list<Question>
     */
    public static function all(): array
    {
        return [
            ...self::support(),
            ...self::sales(),
            ...self::store(),
            ...self::content(),
            ...self::admin(),
        ];
    }

    /**
     * The ones this account may ask.
     *
     * @param  list<string>  $roles
     * @return list<Question>
     */
    public static function for(array $roles): array
    {
        if (in_array(Role::Admin->value, $roles, true)) {
            return self::all();
        }

        return array_values(array_filter(
            self::all(),
            fn (Question $q) => in_array($q->role, $roles, true),
        ));
    }

    public static function find(string $key, array $roles): ?Question
    {
        foreach (self::for($roles) as $question) {
            if ($question->key === $key) {
                return $question;
            }
        }

        return null;
    }

    /* ------------------------------------------------------------ support */

    /** @return list<Question> */
    private static function support(): array
    {
        $role = Role::SupportEngineer->value;

        return [
            new Question(
                'tickets_open', $role,
                'How many tickets are open?',
                'open tickets queue outstanding unresolved how many tickets',
                fn () => self::count(
                    Ticket::open()->count(),
                    fn (int $n) => $n === 1 ? 'One ticket is open.' : "{$n} tickets are open.",
                    'Nothing is open. The queue is clear.',
                    '/admin/tickets?open=1',
                ),
            ),
            new Question(
                'tickets_overdue', $role,
                'How many tickets are overdue?',
                'overdue tickets late sla breached past due missed',
                fn () => self::count(
                    Ticket::overdue()->count(),
                    fn (int $n) => $n === 1 ? 'One ticket is past its due time.' : "{$n} tickets are past their due time.",
                    'Nothing is overdue.',
                    '/admin/tickets?overdue=1',
                ),
            ),
            new Question(
                'tickets_unassigned', $role,
                'How many tickets have nobody on them?',
                'unassigned tickets nobody assigned unclaimed who is free unowned',
                fn () => self::count(
                    Ticket::open()->whereNull('assigned_to')->count(),
                    fn (int $n) => $n === 1 ? 'One open ticket has nobody on it.' : "{$n} open tickets have nobody on them.",
                    'Every open ticket has somebody on it.',
                    '/admin/tickets?unassigned=1',
                ),
            ),
            new Question(
                'tickets_mine', $role,
                'How many tickets are assigned to me?',
                'my tickets mine assigned to me my queue what am i working on',
                function () {
                    $id = auth()->id();

                    return self::count(
                        $id === null ? 0 : Ticket::open()->where('assigned_to', $id)->count(),
                        fn (int $n) => $n === 1 ? 'One open ticket is yours.' : "{$n} open tickets are yours.",
                        'Nothing open is assigned to you.',
                        '/admin/tickets?assigned_to='.($id ?? ''),
                    );
                },
            ),
            new Question(
                'tickets_reported', $role,
                'Has anybody reported a reply?',
                'reported replies complaint unhappy customer reported bad reply',
                fn () => self::count(
                    Ticket::reported()->count(),
                    fn (int $n) => $n === 1 ? 'One ticket has a reply a customer reported.' : "{$n} tickets have a reply a customer reported.",
                    'Nobody has reported a reply.',
                    '/admin/tickets?reported=1',
                ),
            ),
        ];
    }

    /* -------------------------------------------------------------- sales */

    /** @return list<Question> */
    private static function sales(): array
    {
        $role = Role::SalesManager->value;

        return [
            new Question(
                'leads_new', $role,
                'How many new leads are there?',
                'new leads enquiries fresh untouched who has got in touch',
                fn () => self::count(
                    Lead::where('status', LeadStatus::New)->count(),
                    fn (int $n) => $n === 1 ? 'One lead is new and nobody has answered it.' : "{$n} leads are new and nobody has answered them.",
                    'Every lead has been picked up.',
                    '/admin/leads?status=new',
                ),
            ),
            new Question(
                'leads_overdue', $role,
                'Which follow-ups are overdue?',
                'overdue follow ups followups late leads chase missed callback',
                fn () => self::count(
                    Lead::query()->overdue()->count(),
                    fn (int $n) => $n === 1 ? 'One lead is past its follow-up date.' : "{$n} leads are past their follow-up date.",
                    'No follow-up is overdue.',
                    '/admin/leads?overdue=1',
                ),
            ),
            new Question(
                'leads_unassigned', $role,
                'How many leads have nobody on them?',
                'unassigned leads nobody owns unclaimed lead who is taking',
                fn () => self::count(
                    Lead::query()->open()->whereNull('assigned_to')->count(),
                    fn (int $n) => $n === 1 ? 'One open lead has nobody on it.' : "{$n} open leads have nobody on them.",
                    'Every open lead has an owner.',
                    '/admin/leads?unassigned=1',
                ),
            ),
            new Question(
                'leads_week', $role,
                'How many leads came in this week?',
                'leads this week recent enquiries how many came in volume',
                fn () => self::count(
                    Lead::where('created_at', '>=', now()->startOfWeek())->count(),
                    fn (int $n) => $n === 1 ? 'One lead has come in this week.' : "{$n} leads have come in this week.",
                    'No lead has come in this week yet.',
                    '/admin/leads',
                ),
            ),
        ];
    }

    /* -------------------------------------------------------------- store */

    /** @return list<Question> */
    private static function store(): array
    {
        $role = Role::StoreManager->value;

        return [
            new Question(
                'orders_awaiting_dispatch', $role,
                'How many orders are waiting to be dispatched?',
                'orders awaiting dispatch to send pack shipping waiting parcels',
                fn () => self::count(
                    Order::whereIn('status', [
                        OrderStatus::Paid->value,
                        OrderStatus::Processing->value,
                        OrderStatus::ReadyForDispatch->value,
                    ])->whereNotNull('shipping_address')->count(),
                    fn (int $n) => $n === 1 ? 'One order is waiting to be dispatched.' : "{$n} orders are waiting to be dispatched.",
                    'Nothing is waiting to go out.',
                    '/admin/store/orders?status=paid',
                ),
            ),
            new Question(
                'orders_unpaid', $role,
                'How many orders are unpaid?',
                'unpaid orders not paid owing awaiting payment outstanding money',
                fn () => self::count(
                    Order::whereNull('paid_at')
                        ->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::Refunded->value])
                        ->count(),
                    fn (int $n) => $n === 1 ? 'One order has not been paid.' : "{$n} orders have not been paid.",
                    'Every live order has been paid.',
                    '/admin/store/orders?unpaid=1',
                ),
            ),
            new Question(
                'store_out_of_stock', $role,
                'What has run out of stock?',
                'out of stock sold out empty shelf reorder nothing left',
                fn () => self::count(
                    StoreProduct::where('status', PublishStatus::Published)->outOfStock()->count(),
                    fn (int $n) => $n === 1 ? 'One published product is out of stock.' : "{$n} published products are out of stock.",
                    'Nothing published is out of stock.',
                    '/admin/store/products?out_of_stock=1',
                ),
            ),
            new Question(
                'store_returns', $role,
                'Is anybody waiting on a return?',
                'returns waiting rma refund request send back replacement',
                fn () => self::count(
                    OrderReturn::waiting()->count(),
                    fn (int $n) => $n === 1 ? 'One return is waiting for an answer.' : "{$n} returns are waiting for an answer.",
                    'No return is waiting.',
                    '/admin/store/returns',
                ),
            ),
            new Question(
                'store_reviews', $role,
                'Are there reviews to approve?',
                'reviews waiting pending moderate approve ratings',
                fn () => self::count(
                    ProductReview::waiting()->count(),
                    fn (int $n) => $n === 1 ? 'One review is waiting to be read.' : "{$n} reviews are waiting to be read.",
                    'No review is waiting.',
                    '/admin/store/reviews',
                ),
            ),
            new Question(
                'store_revenue_month', $role,
                'How much have we taken this month?',
                'revenue sales takings money this month turnover total paid',
                function () {
                    $paise = (int) Order::paid()
                        ->where('placed_at', '>=', now()->startOfMonth())
                        ->sum('total_paise');

                    /*
                     * Zero is an answer here and null is not: a month with no
                     * paid order has genuinely taken nothing, where "no
                     * average" means nothing was measured. The two are
                     * different claims and this is the first kind.
                     */
                    return [
                        'figure' => Money::format($paise),
                        'sentence' => $paise === 0
                            ? 'Nothing has been taken this month yet.'
                            : Money::format($paise).' has been taken this month, across paid orders.',
                        'href' => '/admin/store/reports',
                    ];
                },
            ),
        ];
    }

    /* ------------------------------------------------------------ content */

    /** @return list<Question> */
    private static function content(): array
    {
        $role = Role::ContentManager->value;

        return [
            new Question(
                'content_drafts', $role,
                'What is still a draft?',
                'drafts unpublished not live waiting to publish pages posts',
                function () {
                    $pages = Page::where('status', PublishStatus::Draft)->count();
                    $posts = BlogPost::where('status', PublishStatus::Draft)->count();
                    $n = $pages + $posts;

                    return [
                        'figure' => $n,
                        'sentence' => $n === 0
                            ? 'No page or post is a draft.'
                            : "{$n} drafts: {$pages} ".($pages === 1 ? 'page' : 'pages')." and {$posts} ".($posts === 1 ? 'post' : 'posts').'.',
                        'href' => '/admin/pages?status=draft',
                    ];
                },
            ),
            new Question(
                'content_posts_month', $role,
                'How many posts went out this month?',
                'posts published this month blog articles written how many',
                fn () => self::count(
                    BlogPost::where('status', PublishStatus::Published)
                        ->where('published_at', '>=', now()->startOfMonth())
                        ->count(),
                    fn (int $n) => $n === 1 ? 'One post has been published this month.' : "{$n} posts have been published this month.",
                    'No post has been published this month.',
                    '/admin/blog?status=published',
                ),
            ),
        ];
    }

    /* -------------------------------------------------------------- admin */

    /** @return list<Question> */
    private static function admin(): array
    {
        $role = Role::Admin->value;

        return [
            new Question(
                'customers_pending', $role,
                'Is anybody waiting for an account?',
                'customers pending approval waiting registrations approve accounts',
                fn () => self::count(
                    Customer::where('status', CustomerStatus::Pending)->count(),
                    fn (int $n) => $n === 1 ? 'One customer is waiting to be approved.' : "{$n} customers are waiting to be approved.",
                    'Nobody is waiting for an account.',
                    '/admin/customers?status=pending',
                ),
            ),
            new Question(
                'mail_queue', $role,
                'Is mail going out?',
                'mail queue stuck email not sending backlog scheduler delivering',
                function () {
                    $queue = QueueHealth::read();
                    $pending = (int) ($queue['pending'] ?? 0);
                    $delivering = (bool) ($queue['delivering'] ?? false);

                    /*
                     * The backlog alone cannot answer this, and that is the
                     * whole reason the question is worth asking: before a
                     * send there is nothing queued to be late, so a healthy
                     * install and one with no cron entry look identical.
                     * `delivering` is the pulse, which is what actually
                     * distinguishes them.
                     */
                    return [
                        'figure' => $pending,
                        'sentence' => match (true) {
                            ! $delivering => 'Nothing is draining the queue, so mail is not going out. The scheduler is what delivers it — System → Status has the command.',
                            $pending === 0 => 'Mail is going out and nothing is waiting.',
                            default => "Mail is going out. {$pending} ".($pending === 1 ? 'message is' : 'messages are').' waiting their turn.',
                        },
                        'href' => '/admin/system/status#scheduler',
                    ];
                },
            ),
            new Question(
                'staff_count', $role,
                'How many staff accounts are there?',
                'staff accounts users team members colleagues how many people',
                fn () => self::count(
                    User::where('is_active', true)->count(),
                    fn (int $n) => $n === 1 ? 'One staff account is active.' : "{$n} staff accounts are active.",
                    'No staff account is active, which should not be possible.',
                    '/admin/staff?active=1',
                ),
            ),
        ];
    }

    /* ------------------------------------------------------------ helpers */

    /**
     * A counted answer, with its own sentence for none.
     *
     * "0 tickets are open" is a sentence a machine writes; "Nothing is open"
     * is the one a person would. The zero case is worth its own words on
     * every question, which is why it is a parameter rather than a format.
     *
     * @param  callable(int): string  $some
     * @return array{figure: mixed, sentence: string, href: ?string}
     */
    private static function count(int $n, callable $some, string $none, ?string $href): array
    {
        return [
            'figure' => $n,
            'sentence' => $n === 0 ? $none : $some($n),
            // Nothing to open when there is nothing to look at.
            'href' => $n === 0 ? null : $href,
        ];
    }
}
