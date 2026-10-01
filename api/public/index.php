<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Maintenance mode — in the install's own storage when it has one (bootstrap/home.php).
$home = require __DIR__.'/../bootstrap/home.php';

if (file_exists($maintenance = ($home !== null ? $home.'/storage' : __DIR__.'/../storage').'/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../vendor/autoload.php';

(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());
