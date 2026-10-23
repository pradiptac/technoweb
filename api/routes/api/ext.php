<?php

use App\Http\Controllers\Api\V1\Ext\CustomerController;
use App\Http\Controllers\Api\V1\Ext\LeadController;
use App\Http\Controllers\Api\V1\Ext\MeController;
use App\Http\Controllers\Api\V1\Ext\OrderController;
use App\Http\Controllers\Api\V1\Ext\ProductController;
use App\Http\Controllers\Api\V1\Ext\SubscriberController;
use App\Http\Controllers\Api\V1\Ext\TicketController;
use Illuminate\Support\Facades\Route;

/*
 * The integration surface, authenticated by an API key rather than Sanctum:
 * required inside `Route::prefix('ext')` in routes/api.php, before the
 * `auth:sanctum` group. Each route names the scope it needs: `api.key:leads:read`.
 */

Route::get('me', MeController::class)->middleware('api.key')->name('me');

Route::middleware('api.key:leads:read')->group(function () {
    Route::get('leads', [LeadController::class, 'index'])->name('leads.index');
    Route::get('leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
});

Route::middleware('api.key:orders:read')->group(function () {
    Route::get('orders', [OrderController::class, 'index'])->name('orders.index');
    Route::get('orders/{number}', [OrderController::class, 'show'])->name('orders.show');
});

Route::middleware('api.key:customers:read')->group(function () {
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('customers/{id}', [CustomerController::class, 'show'])->name('customers.show');
});

Route::middleware('api.key:tickets:read')->group(function () {
    Route::get('tickets', [TicketController::class, 'index'])->name('tickets.index');
    Route::get('tickets/{reference}', [TicketController::class, 'show'])->name('tickets.show');
});

Route::get('subscribers', [SubscriberController::class, 'index'])->middleware('api.key:subscribers:read')->name('subscribers.index');
Route::get('store/products', [ProductController::class, 'index'])->middleware('api.key:products:read')->name('store.products.index');
