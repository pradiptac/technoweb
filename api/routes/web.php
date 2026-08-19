<?php

use Illuminate\Support\Facades\Route;

// This application is an API only — the public site is served by Next.js.
Route::get('/', fn () => response()->json([
    'name' => config('app.name').' API',
    'docs' => '/api/v1',
]));
