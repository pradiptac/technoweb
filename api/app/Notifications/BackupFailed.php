<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A backup did not happen, or did not reach everywhere it was sent.
 *
 * To `backups_email`, else the support address. The message is the backup
 * worker's own sentence — the destination's refusal in its own words where
 * there was one — because "the backup failed" with no reason sends somebody
 * to the server log, and "Access Denied (HTTP 403)" sends them to the bucket
 * policy.
 */
class BackupFailed extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    public function __construct(
        private readonly string $reason,
        private readonly ?string $folder = null,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'backup_failed';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'reason' => $this->reason,
            'folder' => $this->folder ?? '',
            'url' => rtrim((string) config('app.frontend_url'), '/').'/admin/backups',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('A backup did not complete')
            ->line('The website’s backup did not complete.')
            ->line($this->reason)
            ->action('Open Backups', rtrim((string) config('app.frontend_url'), '/').'/admin/backups')
            ->line('Until a backup completes, the newest restorable copy is older than you expect.');
    }
}
