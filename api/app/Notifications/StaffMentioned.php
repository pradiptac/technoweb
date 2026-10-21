<?php

namespace App\Notifications;

use App\Models\StaffNotification;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A staff member was mentioned in a note (C2, docs/notifications.md). The
 * line names the record and never quotes the note, so a customer's details
 * do not spread into email.
 */
class StaffMentioned extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    public function __construct(public readonly StaffNotification $row) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_mentioned';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) ($notifiable->name ?? ''),
            'line' => $this->row->line,
            'url' => self::base().$this->row->path,
            'preferences_url' => self::base().'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->row->line)
            ->greeting('Hello '.($notifiable->name ?? '').',')
            ->line($this->row->line)
            ->action('Open it', self::base().$this->row->path)
            ->line('Choose what reaches you on Your account → Notifications.');
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
