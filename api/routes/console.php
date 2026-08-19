<?php

use Illuminate\Support\Facades\Schedule;

// Prune expired Sanctum tokens weekly so the table does not grow forever.
Schedule::command('sanctum:prune-expired --hours=24')->weekly();
