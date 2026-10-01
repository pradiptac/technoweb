<?php

/*
 * Backups: the database and the uploaded files, full and incremental, to S3
 * (or anything that speaks it), Google Drive and FTP/FTPS/SFTP. The choices
 * an editor makes are settings (the private `backups` group); what is here is
 * what only somebody with the server in front of them should decide. See
 * `docs/backups.md`.
 */

return [
    /*
     * `mysqldump` and `mysql`: a path, or blank to look on PATH. When neither
     * is found — or `proc_open` is switched off, which shared hosting often
     * does — the database is dumped and restored in PHP instead.
     */
    'mysqldump' => env('BACKUP_MYSQLDUMP_PATH'),

    /*
     * `auto` uses `mysqldump` when it is there and the database is small
     * enough to dump inside one run of the backup worker; `php` always uses
     * the PHP dumper, which is slower and can be sliced.
     */
    'dumper' => env('BACKUP_DUMPER', 'auto'),

    /** Above this estimate `auto` takes the PHP dumper, which can be paused. */
    'binary_max_bytes' => 150 * 1024 * 1024,

    /*
     * A NAS on the office network is a legitimate destination and is also an
     * SSRF from the console to the LAN. It takes somebody with the server's
     * `.env` in front of them to open it.
     */
    'allow_private_hosts' => (bool) env('BACKUP_ALLOW_PRIVATE_HOSTS', false),

    /** A zip volume closes once it holds this much (a single larger file gets one to itself). */
    'volume_bytes' => 128 * 1024 * 1024,

    /** …or this many files, whichever comes first. */
    'volume_files' => 4000,

    /** How long one run of the worker may start new work. */
    'budget_seconds' => 40,

    /** Rows per `INSERT` from the PHP dumper. */
    'php_dump_rows' => 500,

    /*
     * Tables a dump leaves out and a restore leaves alone: the queue, the
     * cache, and the backup machinery itself. Restoring must not delete the
     * row describing the restore, nor the job that is running it.
     */
    'preserve_tables' => [
        'jobs', 'failed_jobs', 'job_batches',
        'cache', 'cache_locks',
        'backups', 'backup_uploads', 'backup_restores',
    ],

    /*
     * Directories under `storage/app/private` that are scratch or the
     * backups themselves: never archived, never pruned by a restore.
     */
    'exclude_private' => [
        'backups', 'restore', 'newsletter-imports', 'store-imports', 'wordpress-imports',
    ],
];
