<?php

use Illuminate\Support\Facades\Schedule;

// Prune expired Sanctum tokens weekly so the table does not grow forever.
Schedule::command('sanctum:prune-expired --hours=24')->weekly();

/*
 * Activity log retention.
 *
 * Daily rather than weekly: the period is a promise about how long staff
 * actions are kept, and a weekly prune makes "90 days" mean anything up to 97.
 */
Schedule::command('technoware:prune-activity')->dailyAt('03:10');

/*
 * Candidate data retention. Same reasoning, higher stakes: this deletes CVs.
 */
Schedule::command('technoware:prune-applications')->dailyAt('03:25');

/*
 * Spent and expired sign-in codes.
 *
 * Housekeeping rather than retention — nothing is promised about these and
 * nothing reads them after ten minutes. Hourly rather than daily because the
 * table is written to on every sign-in attempt, including the failed ones,
 * which is exactly the traffic that grows when somebody is working through a
 * list of addresses.
 */
Schedule::command('technoware:prune-sign-in-codes')->hourly();
