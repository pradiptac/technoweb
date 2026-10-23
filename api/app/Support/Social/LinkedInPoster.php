<?php

namespace App\Support\Social;

use App\Models\Setting;
use App\Support\OAuth\OAuthConnection;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/** Posts to the connected LinkedIn page. Bounded at 15 s; a refusal is `SocialRefused`, a lost connection is let through. */
class LinkedInPoster
{
    /**
     * The `LinkedIn-Version` header. Taken from the "Latest Version" table at
     * https://learn.microsoft.com/en-us/linkedin/marketing/versioning on
     * 2026-10-24 (202610). LinkedIn supports each version for about a year, so
     * move this forward before 2027-10 and check that page again.
     */
    public const LINKEDIN_VERSION = '202610';

    private const API = 'https://api.linkedin.com/rest';

    public function connection(): OAuthConnection
    {
        return OAuthConnection::linkedIn();
    }

    /** Connected, a page chosen, the token not ended, and LinkedIn has not just said the token is dead. */
    public function ready(): bool
    {
        $connection = $this->connection();

        return $connection->isConnected()
            && filled(Setting::get('social_linkedin_organization_id'))
            && blank(Setting::get('social_linkedin_error'))
            && ($connection->expiresAt()?->isFuture() ?? false);
    }

    /** @return array{id: string, url: string} */
    public function post(string $text, string $url, string $title): array
    {
        $response = $this->request()->post(self::API.'/posts', [
            'author' => 'urn:li:organization:'.Setting::get('social_linkedin_organization_id'),
            'commentary' => $text,
            'visibility' => 'PUBLIC',
            'distribution' => ['feedDistribution' => 'MAIN_FEED', 'targetEntities' => [], 'thirdPartyDistributionChannels' => []],
            'content' => ['article' => ['source' => $url, 'title' => $title]],
            'lifecycleState' => 'PUBLISHED',
            'isReshareDisabledByAuthor' => false,
        ]);

        $this->check($response);
        $id = $response->header('x-restli-id');

        return ['id' => $id, 'url' => $id === '' ? '' : 'https://www.linkedin.com/feed/update/'.$id];
    }

    /** @return list<array{id: string, name: string}> the pages the signed-in person administers */
    public function organizations(): array
    {
        $acls = $this->request()->get(self::API.'/organizationAcls', ['q' => 'roleAssignee', 'role' => 'ADMINISTRATOR', 'state' => 'APPROVED']);
        $this->check($acls);

        $out = [];
        foreach ((array) $acls->json('elements', []) as $element) {
            $id = preg_replace('/^urn:li:organization:/', '', (string) ($element['organization'] ?? ''));
            if ($id === '' || ! ctype_digit($id)) {
                continue;
            }

            $named = $this->request()->get(self::API.'/organizations/'.$id);
            $out[] = ['id' => $id, 'name' => $named->successful() ? (string) $named->json('localizedName', 'Page '.$id) : 'Page '.$id];
        }

        return $out;
    }

    private function request(): PendingRequest
    {
        return Http::withToken($this->connection()->accessToken())
            ->withHeaders(['LinkedIn-Version' => self::LINKEDIN_VERSION, 'X-Restli-Protocol-Version' => '2.0.0'])
            ->acceptJson()
            ->timeout(15);
    }

    private function check(Response $response): void
    {
        if ($response->successful()) {
            return;
        }

        $message = trim((string) $response->json('message', ''));

        throw new SocialRefused(
            $message !== '' ? mb_substr($message, 0, 300) : "LinkedIn refused this (HTTP {$response->status()}).",
            $response->status(),
        );
    }
}
