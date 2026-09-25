<?php

namespace App\Notifications;

use App\Models\ContentBlock;
use App\Models\Lead;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Somebody downloaded a gated file or registered for a webinar through a CTA
 * banner (2026-09-24). To the sales desk, queued like the rest.
 *
 * **The lead is written before this is dispatched** — the email is the
 * announcement, the row is the record, the rule `LeadIntake` is built on.
 */
class BlockLeadCaptured extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    public function __construct(
        private readonly Lead $lead,
        private readonly ContentBlock $block,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'block_lead_captured';
    }

    private function what(): string
    {
        return $this->block->layout === 'webinar' ? 'registered for' : 'downloaded';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        $details = '';
        foreach (['Email' => $this->lead->email, 'Phone' => $this->lead->phone, 'Company' => $this->lead->company] as $label => $value) {
            if (filled($value)) {
                $details .= '<p><strong>'.e($label).':</strong> '.e($value).'</p>';
            }
        }

        return [
            'name' => $this->lead->name ?: 'Somebody',
            'action' => $this->what(),
            'banner' => (string) $this->block->datum('heading', $this->block->name),
            'details' => $details,
            'source_path' => $this->lead->source_path ?? '',
            'url' => rtrim((string) config('app.frontend_url'), '/').'/admin/leads/'.$this->lead->id,
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $banner = (string) $this->block->datum('heading', $this->block->name);
        $mail = (new MailMessage)
            ->subject(ucfirst($this->what()).': '.$banner)
            ->greeting('A new lead from a banner on the website.')
            ->line('**'.($this->lead->name ?: 'Somebody').'** '.$this->what().' “'.$banner.'”.');

        foreach (['Email' => $this->lead->email, 'Phone' => $this->lead->phone, 'Company' => $this->lead->company] as $label => $value) {
            if (filled($value)) {
                $mail->line("**{$label}:** {$value}");
            }
        }

        if (filled($this->lead->source_path)) {
            $mail->line('**On the page:** '.$this->lead->source_path);
        }

        return $mail->action('Open this lead', rtrim((string) config('app.frontend_url'), '/').'/admin/leads/'.$this->lead->id);
    }
}
