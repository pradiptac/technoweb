<?php

use App\Http\Controllers\Api\V1\Ext\MeController;
use Illuminate\Support\Facades\Route;

/*
 * The integration surface, authenticated by an API key rather than Sanctum:
 * required inside `Route::prefix('ext')` in routes/api.php, before the
 * `auth:sanctum` group. Each route names the scope it needs: `api.key:leads:read`.
 */

Route::get('me', MeController::class)->middleware('api.key')->name('me');
