<?php

namespace App\Jobs;

use App\Enums\SeoAiAction;
use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Support\Seo\Ai\SeoAssistant;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * One AI SEO action against one record, on the queue.
 *
 * What a bulk run from the overview is made of: the editor names the records
 * that fail a check and the action to run, `SeoAiController::bulk()` queues
 * one of these per record, and each lands as a `pending` suggestion on that
 * record's SEO panel for the editor to accept or reject one by one. The job
 * writes nothing to the record — the assistant's rule, kept by the assistant
 * — and the queue is drained by the scheduler like the mail is.
 *
 * `SeoAssistant::run()` never throws; a refusal (switched off, the cap
 * reached mid-run, the provider silent) comes back as a failed result and
 * is logged at `warning`, the one level that clears the shipped
 * `LOG_LEVEL`. One attempt: a second try at a refused call is a second bill
 * for the same answer, and a provider outage is what the editor's next
 * press will discover anyway.
 */
class RunSeoSuggestion implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(
        public readonly string $type,
        public readonly int $id,
        public readonly SeoAiAction $action,
        public readonly ?int $userId,
    ) {}

    public function handle(SeoAssistant $assistant): void
    {
        $record = SeoController::locate($this->type, $this->id);

        if ($record === null) {
            return; // Deleted between the press and the run; nothing to suggest about.
        }

        $result = $assistant->run($this->action, $record, $this->userId);

        if (! $result->ok) {
            Log::warning('A queued SEO suggestion was refused', [
                'action' => $this->action->value,
                'record' => $this->type.':'.$this->id,
                'reason' => $result->error,
            ]);
        }
    }
}
