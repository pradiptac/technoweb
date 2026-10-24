<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\OAuth\CallbackPath;
use App\Support\OAuth\OAuthConnection;
use App\Support\Social\LinkedInPoster;
use App\Support\Social\SocialRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The company's LinkedIn connection (C7): the `MeetingsGoogleController`
 * round trip on its own OAuth slot, plus the choice of which page posts go to.
 * The token is stored by `OAuthConnection` and appears in no response.
 */
class SocialAccountController extends Controller
{
    public const CALLBACK = '/admin/settings/social/linkedin/callback';

    /** GET admin/settings/social. */
    public function status(): JsonResponse
    {
        $connection = OAuthConnection::linkedIn();
        $organization = trim((string) Setting::get('social_linkedin_organization_id'));
        $name = trim((string) Setting::get('social_linkedin_organization_name'));

        return response()->json(['data' => ['linkedin' => [
            'configured' => filled(Setting::get('social_linkedin_oauth_client_id')) && filled(Setting::get('social_linkedin_oauth_client_secret')),
            'connected' => $connection->isConnected(),
            'ready' => app(LinkedInPoster::class)->ready(),
            'account' => Setting::get('social_linkedin_oauth_account'),
            'organization' => $organization === '' ? null : ['id' => $organization, 'name' => $name === '' ? null : $name],
            'expires_at' => $connection->expiresAt()?->toIso8601String(),
            'error' => Setting::get('social_linkedin_error'),
            'callback_path' => self::CALLBACK,
        ]]]);
    }

    /** POST admin/settings/social/linkedin/authorize. */
    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate(['redirect_uri' => ['required', 'url', 'max:300']]);
        $redirect = CallbackPath::assert($data['redirect_uri'], self::CALLBACK);

        try {
            $result = OAuthConnection::linkedIn()->authorizeUrl($redirect);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    /**
     * POST admin/settings/social/linkedin/callback. The connection succeeds on its own; when
     * LinkedIn lists exactly one page it is chosen, otherwise the administrator picks one
     * (or types its ID) through `organization`.
     */
    public function callback(Request $request, LinkedInPoster $poster): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:4000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            $oauth = OAuthConnection::linkedIn();
            $stored = $oauth->consumeState($data['state']);
            $oauth->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if (blank(Setting::get('social_linkedin_organization_id'))) {
            try {
                $pages = $poster->organizations();
                if (count($pages) === 1) {
                    $this->choose($pages[0]['id'], $pages[0]['name']);
                }
            } catch (\Throwable) {
                // Left blank: the screen offers the list again, and the ID can be typed.
            }
        }

        return response()->json(['data' => ['account' => Setting::get('social_linkedin_oauth_account'), 'organization_id' => Setting::get('social_linkedin_organization_id')]]);
    }

    /** POST admin/settings/social/linkedin/disconnect. The chosen page is kept for a reconnection. */
    public function disconnect(): JsonResponse
    {
        OAuthConnection::linkedIn()->disconnect();

        return response()->json(['data' => ['connected' => false]]);
    }

    /** GET admin/settings/social/linkedin/organizations: the pages the signed-in person administers. */
    public function organizations(LinkedInPoster $poster): JsonResponse
    {
        if (! $poster->connection()->isConnected()) {
            return response()->json(['message' => 'Connect LinkedIn first.'], 422);
        }

        try {
            return response()->json(['data' => $poster->organizations()]);
        } catch (SocialRefused $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable) {
            return response()->json(['message' => "We couldn't reach LinkedIn. Try again shortly."], 422);
        }
    }

    /** POST admin/settings/social/linkedin/organization: the page posts go to, chosen from the list or typed. */
    public function organization(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'string', 'regex:/^\d{1,20}$/'],
            'name' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        $this->choose($data['id'], $data['name'] ?? null);

        return response()->json(['data' => ['id' => $data['id'], 'name' => filled($data['name'] ?? null) ? trim($data['name']) : null]]);
    }

    private function choose(string $id, ?string $name): void
    {
        Setting::put('social_linkedin_organization_id', $id);
        Setting::put('social_linkedin_organization_name', filled($name) ? trim($name) : null);
    }
}
