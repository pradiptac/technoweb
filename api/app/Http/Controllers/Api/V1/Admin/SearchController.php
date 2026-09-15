<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Page;
use App\Models\Product;
use App\Models\StoreProduct;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The console's front door: one term, every record type the caller may open,
 * five of each.
 *
 * What the command palette (Ctrl+K) reads. It fans out to the same LIKE
 * clauses the individual indexes use — a ticket by reference, subject or
 * customer; a lead by name, address or company; a product by name or SKU —
 * rather than a search engine, for the reason `/search` on the public site
 * is LIKE: the corpus is hundreds, the database is already there, and one
 * round trip for eight lists is the point.
 *
 * **Role-filtered by the same enum the routes use**, not by a list kept here.
 * Each group names the role its screen is behind, and a group the caller
 * cannot open is absent rather than empty — a palette offering a link that
 * 403s is the drift `admin-nav.tsx` filters the sidebar to avoid. It sits in
 * the staff-wide group (beside `auth/me`) because every role has something to
 * find; the filter is what keeps that safe.
 *
 * `admin_path` is a console route, not the API's own — the exception the SEO
 * overview already makes, for the same reason: the palette exists to *open*
 * the record, and the console and the site are one origin.
 */
class SearchController extends Controller
{
    private const PER_GROUP = 5;

    /**
     * A status enum's label, read through `getAttribute()` because the
     * analyser types the cast column as a string — the finding the baseline
     * already carries for every enum cast in the models.
     */
    private static function label(mixed $status): ?string
    {
        if ($status instanceof \UnitEnum && method_exists($status, 'label')) {
            return $status->label();
        }

        return is_string($status) ? $status : null;
    }

    public function __invoke(Request $request): JsonResponse
    {
        $term = trim($request->string('q')->value());
        $user = $request->user();

        if (mb_strlen($term) < 2 || ! $user instanceof User) {
            return response()->json(['data' => []]);
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $term).'%';
        $groups = [];

        if ($user->hasRole(Role::Admin, Role::SupportEngineer)) {
            $groups[] = [
                'type' => 'ticket', 'label' => 'Tickets',
                'items' => Ticket::with('customer')
                    ->where(fn ($w) => $w->where('reference', 'like', $like)
                        ->orWhere('subject', 'like', $like)
                        ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', $like)->orWhere('company', 'like', $like)))
                    ->latest()->limit(self::PER_GROUP)->get()
                    ->map(fn (Ticket $t) => [
                        'label' => $t->subject,
                        'sub' => $t->reference.' · '.$t->customer?->getAttribute('name').' · '.self::label($t->getAttribute('status')),
                        'admin_path' => "/admin/tickets/{$t->reference}",
                    ]),
            ];

            $groups[] = [
                'type' => 'customer', 'label' => 'Customers',
                'items' => Customer::search($term)->latest()->limit(self::PER_GROUP)->get()
                    ->map(fn (Customer $c) => [
                        'label' => $c->name,
                        'sub' => implode(' · ', array_filter([$c->company, $c->email])),
                        'admin_path' => "/admin/customers/{$c->id}",
                    ]),
            ];
        }

        if ($user->hasRole(Role::Admin, Role::SalesManager)) {
            $groups[] = [
                'type' => 'lead', 'label' => 'Leads',
                'items' => Lead::where(fn ($w) => $w->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('company', 'like', $like)
                    ->orWhere('subject', 'like', $like))
                    ->latest()->limit(self::PER_GROUP)->get()
                    ->map(fn (Lead $l) => [
                        'label' => $l->name ?: ($l->email ?: 'Lead #'.$l->id),
                        'sub' => implode(' · ', array_filter([$l->company, self::label($l->getAttribute('status'))])),
                        'admin_path' => "/admin/leads/{$l->id}",
                    ]),
            ];
        }

        if ($user->hasRole(Role::Admin, Role::ContentManager)) {
            $groups[] = [
                'type' => 'product', 'label' => 'Products',
                'items' => Product::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))
                    ->orderBy('name')->limit(self::PER_GROUP)->get()
                    ->map(fn (Product $p) => [
                        'label' => $p->name,
                        'sub' => implode(' · ', array_filter([$p->sku, self::label($p->getAttribute('status'))])),
                        'admin_path' => "/admin/products/{$p->id}",
                    ]),
            ];

            $groups[] = [
                'type' => 'post', 'label' => 'Blog posts',
                'items' => BlogPost::where('title', 'like', $like)->latest()->limit(self::PER_GROUP)->get()
                    ->map(fn (BlogPost $b) => [
                        'label' => $b->title,
                        'sub' => self::label($b->getAttribute('status')),
                        'admin_path' => "/admin/blog/{$b->id}",
                    ]),
            ];

            $groups[] = [
                'type' => 'page', 'label' => 'Pages',
                'items' => Page::where('title', 'like', $like)->orderBy('title')->limit(self::PER_GROUP)->get()
                    ->map(fn (Page $p) => [
                        'label' => $p->title,
                        'sub' => '/'.$p->slug,
                        'admin_path' => "/admin/pages/{$p->id}",
                    ]),
            ];
        }

        if ($user->hasRole(Role::Admin, Role::StoreManager)) {
            $groups[] = [
                'type' => 'order', 'label' => 'Orders',
                'items' => Order::where(fn ($w) => $w->where('order_number', 'like', $like)
                    ->orWhere('customer_name', 'like', $like)
                    ->orWhere('customer_email', 'like', $like))
                    ->latest()->limit(self::PER_GROUP)->get()
                    ->map(fn (Order $o) => [
                        'label' => $o->order_number,
                        'sub' => implode(' · ', array_filter([$o->customer_name, self::label($o->getAttribute('status'))])),
                        'admin_path' => "/admin/store/orders/{$o->order_number}",
                    ]),
            ];

            $groups[] = [
                'type' => 'store_product', 'label' => 'Shop products',
                'items' => StoreProduct::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))
                    ->orderBy('name')->limit(self::PER_GROUP)->get()
                    ->map(fn (StoreProduct $p) => [
                        'label' => $p->name,
                        'sub' => $p->sku,
                        'admin_path' => "/admin/store/products/{$p->id}",
                    ]),
            ];
        }

        // Empty groups are dropped: a heading over nothing is noise in a list
        // somebody is scanning with the arrow keys.
        return response()->json([
            'data' => array_values(array_filter($groups, fn ($g) => $g['items']->isNotEmpty())),
        ]);
    }
}
