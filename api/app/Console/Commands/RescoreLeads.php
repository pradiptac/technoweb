<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Support\Crm\LeadScore;
use Illuminate\Console\Command;

/**
 * Restates every lead's score on the current rubric.
 *
 * A score is the score *at intake*, and `LeadIntake` never rewrites it: a
 * number describes the moment it was taken, and a rubric change that quietly
 * restated history would make last month's "hot" mean something different
 * from this month's. That stays the default. This command is the deliberate
 * exception — run when the rubric or the intent word list has changed and the
 * desk wants the whole table on one footing again.
 *
 * It **reports by default and writes nothing**, the `technoware:landing-pages`
 * shape: the band-to-band movement is printed so the change can be read
 * before it is made, and `--write` is what applies it. `returning` is
 * recomputed as "another lead from this address that arrived earlier", which
 * is what intake would have seen at the time rather than what it sees now —
 * a lead cannot become "returning" because of an enquiry that came after it.
 */
class RescoreLeads extends Command
{
    protected $signature = 'technoware:rescore-leads {--write : Apply the new scores; without it the command only reports}';

    protected $description = 'Restate every lead\'s score and band on the current rubric';

    public function handle(): int
    {
        $write = (bool) $this->option('write');
        $moves = [];
        $total = 0;
        $changed = 0;

        Lead::query()->orderBy('id')->chunkById(200, function ($leads) use ($write, &$moves, &$total, &$changed) {
            foreach ($leads as $lead) {
                $total++;
                $returning = $lead->email !== null && $lead->email !== ''
                    && Lead::query()->where('email', $lead->email)->where('id', '<', $lead->id)->exists();

                $score = LeadScore::for([
                    'email' => $lead->email,
                    'phone' => $lead->phone,
                    'company' => $lead->company,
                    'message' => $lead->message,
                    'source_path' => $lead->source_path,
                    'returning' => $returning,
                ]);

                if ($score['score'] === (int) $lead->score && $score['band'] === $lead->score_band) {
                    continue;
                }

                $changed++;
                $key = $lead->score_band.' → '.$score['band'];
                $moves[$key] = ($moves[$key] ?? 0) + 1;

                if ($write) {
                    $lead->forceFill([
                        'score' => $score['score'],
                        'score_band' => $score['band'],
                        'score_reasons' => $score['reasons'],
                    ])->saveQuietly();
                }
            }
        });

        $this->line(sprintf('%d lead%s read, %d would change.', $total, $total === 1 ? '' : 's', $changed));

        ksort($moves);
        foreach ($moves as $move => $count) {
            $this->line(sprintf('  %-22s %d', $move, $count));
        }

        if (! $write && $changed > 0) {
            $this->comment('Nothing written. Re-run with --write to apply.');
        } elseif ($write) {
            $this->info(sprintf('%d lead%s restated.', $changed, $changed === 1 ? '' : 's'));
        }

        return self::SUCCESS;
    }
}
