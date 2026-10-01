<?php

namespace App\Support\System;

use Illuminate\Database\Migrations\Migrator;
use Symfony\Component\Console\Output\NullOutput;

/**
 * `migrate`, a few files per request.
 *
 * The setup wizard and the updater both run migrations from a browser, on
 * hosts whose `max_execution_time` is often 30 seconds and whose PHP cannot
 * start a process of its own. So each call runs pending migrations one file
 * at a time — each its own batch, exactly as `migrate --step` would — until
 * `$seconds` have gone, and reports how far it got. The next call carries on.
 * A migration that fails throws, with the database's own words, and the next
 * call retries that file.
 */
final class SlicedMigrator
{
    /** @return array{total: int, remaining: int, ran_now: list<string>, done: bool} */
    public static function run(float $seconds): array
    {
        /** @var Migrator $migrator */
        $migrator = app('migrator');
        $migrator->setOutput(new NullOutput);

        if (! $migrator->repositoryExists()) {
            $migrator->getRepository()->createRepository();
        }

        $files = $migrator->getMigrationFiles([database_path('migrations')]);
        $pending = array_diff_key($files, array_flip($migrator->getRepository()->getRan()));
        $started = microtime(true);
        $ran = [];

        foreach ($pending as $name => $file) {
            if ($ran !== [] && microtime(true) - $started >= $seconds) {
                break;
            }

            $migrator->requireFiles([$file]);
            $migrator->runPending([$file], ['step' => true]);
            $ran[] = (string) $name;
        }

        $remaining = count($pending) - count($ran);

        return ['total' => count($files), 'remaining' => $remaining, 'ran_now' => $ran, 'done' => $remaining === 0];
    }
}
