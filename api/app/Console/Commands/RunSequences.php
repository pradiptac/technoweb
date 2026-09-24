<?php

namespace App\Console\Commands;

use App\Support\Newsletter\Sequences;
use Illuminate\Console\Command;

/**
 * Sends every automation-sequence step that has fallen due.
 *
 * The scheduler runs this every ten minutes beside `decide-subject-tests`.
 * The rule is in `Sequences::run()`: an enrolment past its `next_at` in an
 * active sequence gets a recipient row on the step campaign and a batch job
 * — the same job a campaign uses — and its cursor moves on, or it is
 * cancelled with a reason when the subscriber can no longer be mailed. Ten
 * minutes is a cadence, not a risk: an enrolment is advanced as its row is
 * written, and the step campaign's recipient index means one person gets
 * one step once whatever the runner does twice.
 */
class RunSequences extends Command
{
    protected $signature = 'technoware:run-sequences';

    protected $description = 'Send every automation-sequence step that is due, and advance or complete each enrolment';

    public function handle(): int
    {
        $tally = Sequences::run();

        $this->info(sprintf(
            '%d sent, %d completed, %d cancelled, %d held.',
            $tally['sent'], $tally['completed'], $tally['cancelled'], $tally['held'],
        ));

        return self::SUCCESS;
    }
}
