<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * Things that went wrong since the last check, for one staff member
 * (docs/digest-alerts.md). One email per check however many lines; each line
 * names a record by its reference and links to it in the console.
 */
class StaffAlerts extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    /** @param list<array{line: string, href: string}> $lines */
    public function __construct(public readonly array $lines) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_alerts';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) ($notifiable->name ?? ''),
            'count' => (string) count($this->lines),
            'alerts' => $this->listHtml(),
            'url' => self::base().'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(count($this->lines) === 1 ? 'Something needs you' : count($this->lines).' things need you')
            ->line(new HtmlString($this->listHtml()))
            ->line(new HtmlString('<a href="'.e(self::base().'/admin/profile').'">Choose which alerts you get</a>'));
    }

    private function listHtml(): string
    {
        $items = array_map(fn (array $l) => '<li><a href="'.e(self::base().$l['href']).'">'.e($l['line']).'</a></li>', $this->lines);

        return '<ul>'.implode('', $items).'</ul>';
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
