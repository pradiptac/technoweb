<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Digest\Digest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/** A staff member's digest (docs/digest-alerts.md). Every word is the copilot's. */
class StaffDigest extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    public function __construct(public readonly Digest $digest) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_digest';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) ($notifiable->name ?? ''),
            'figures' => $this->figuresHtml(),
            'clear' => $this->clearLine(),
            'url' => self::base().'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->digest->allZero ? 'Your digest: all clear' : 'Your digest');
        if (! $this->digest->allZero) {
            $mail->line(new HtmlString($this->figuresHtml()));
        }
        if ($this->clearLine() !== '') {
            $mail->line($this->clearLine());
        }

        return $mail->line(new HtmlString('<a href="'.e(self::base().'/admin/profile').'">Change when your digest arrives</a>'));
    }

    private function figuresHtml(): string
    {
        $rows = array_map(function (array $i): string {
            $text = e($i['sentence']).($i['change'] !== null ? ' <em>('.e($i['change']).')</em>' : '');

            return '<li>'.($i['href'] !== null ? '<a href="'.e(self::base().$i['href']).'">'.$text.'</a>' : $text).'</li>';
        }, $this->digest->items);

        return $rows === [] ? '' : '<ul>'.implode('', $rows).'</ul>';
    }

    private function clearLine(): string
    {
        return $this->digest->clear === [] ? '' : 'All clear: '.implode('; ', $this->digest->clear).'.';
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
