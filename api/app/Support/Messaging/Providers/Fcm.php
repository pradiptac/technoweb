<?php

namespace App\Support\Messaging\Providers;

use App\Models\Setting;
use App\Support\Mail\MailBrand;
use App\Support\Seo\GoogleServiceAccount;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Browser push through Firebase Cloud Messaging's HTTP v1 API.
 *
 * The access token is `GoogleServiceAccount`'s exchange on the FCM key
 * file's own row, the send URL is addressed by the Firebase project (the
 * public `push_project_id`, else the key file's own `project_id`), and the
 * address is the registration token the browser handed us. FCM has no
 * webhook and no templates; what it does say is **`UNREGISTERED`** when a
 * token is dead — the browser unsubscribed, the site data was cleared — and
 * that opts the contact out for good (`revoke`), because it will never
 * deliver again.
 */
class Fcm extends Provider
{
    public const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    public const KEY = 'push_fcm_service_account';

    protected function name(): string
    {
        return 'Firebase';
    }

    public function configured(): bool
    {
        return $this->allFilled([self::KEY]) && $this->project() !== null;
    }

    private function project(): ?string
    {
        $public = trim((string) Setting::get('push_project_id'));

        return $public !== '' ? $public : GoogleServiceAccount::projectId(self::KEY);
    }

    public function send(OutgoingMessage $message): string
    {
        $link = $message->link();

        return $this->push($message->to, $message->title() ?? MailBrand::name(), $message->body(), $message->template->mediaUrl(), $link);
    }

    public function test(string $to): string
    {
        return $this->push($to, MailBrand::name().' test', self::TEST_BODY, null, null);
    }

    private function push(string $token, string $title, string $body, ?string $image, ?string $link): string
    {
        try {
            $access = GoogleServiceAccount::accessToken(self::SCOPE, self::KEY);
        } catch (RuntimeException $e) {
            throw new ProviderException($e->getMessage(), config: true);
        }

        $absolute = $link !== null && str_starts_with($link, '/')
            ? rtrim((string) config('app.frontend_url'), '/').$link
            : $link;

        $payload = [
            'token' => $token,
            'notification' => array_filter(['title' => $title, 'body' => $body, 'image' => $image]),
            // The service worker reads `data.link` on a click, since the
            // Web Push payload carries no fcm_options to a hand-written worker.
            'data' => array_filter(['link' => $absolute]),
            'webpush' => array_filter(['fcm_options' => $absolute !== null && str_starts_with($absolute, 'https://') ? ['link' => $absolute] : null]),
        ];

        $res = $this->call(fn () => Http::withToken($access)->acceptJson()->timeout(self::TIMEOUT)
            ->post('https://fcm.googleapis.com/v1/projects/'.$this->project().'/messages:send', [
                'message' => array_filter($payload),
            ]));

        if (! $res->successful()) {
            $code = null;
            foreach ((array) $res->json('error.details', []) as $detail) {
                $code ??= is_array($detail) ? ($detail['errorCode'] ?? null) : null;
            }

            throw ProviderException::fromResponse('Firebase', $res, $this->words($res), revoke: $code === 'UNREGISTERED');
        }

        return (string) $res->json('name');
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('error.message');

        return is_string($message) ? $message : null;
    }
}
