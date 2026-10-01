<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MeetingGoogleStatus;
use App\Http\Controllers\Controller;
use App\Models\Meeting;
use App\Models\Setting;
use App\Support\Meetings\GoogleCalendar;
use App\Support\OAuth\CallbackPath;
use App\Support\OAuth\OAuthConnection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Google Workspace calendar every meeting is organised on — the
 * `BackupDriveController` round trip, on its own OAuth slot
 * (`OAuthConnection::meetingsCalendar()`), coming back to exactly one
 * console path.
 */
class MeetingsGoogleController extends Controller
{
    public const CALLBACK = '/admin/meetings/google/callback';

    /** GET admin/meetings/google. */
    public function status(Request $request): JsonResponse
    {
        $calendar = trim((string) Setting::get('meetings_google_calendar_id'));

        return response()->json(['data' => [
            'is_connected' => OAuthConnection::meetingsCalendar()->isConnected(),
            'account' => Setting::get('meetings_google_oauth_account'),
            'connected_at' => Setting::get('meetings_google_oauth_connected_at'),
            'client_configured' => filled(Setting::get('meetings_google_oauth_client_id')) && filled(Setting::get('meetings_google_oauth_client_secret')),
            'calendar_id' => $calendar !== '' ? $calendar : null,
            'error' => Setting::get('meetings_google_error'),
            'callback_path' => self::CALLBACK,
            // What disconnecting would strand: events Google holds for meetings still to come.
            'synced_future_count' => $this->syncedFutureCount(),
        ]]);
    }

    /** POST admin/meetings/google/authorize. */
    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate(['redirect_uri' => ['required', 'url', 'max:300']]);
        $redirect = CallbackPath::assert($data['redirect_uri'], self::CALLBACK);

        try {
            $result = OAuthConnection::meetingsCalendar()->authorizeUrl($redirect);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    /**
     * POST admin/meetings/google/callback. The account comes from the
     * consent, and a blank calendar id is filled with it — the id of an
     * account's primary calendar is its address — so an event can later be
     * told apart from one made under another account.
     */
    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:4000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            $oauth = OAuthConnection::meetingsCalendar();
            $stored = $oauth->consumeState($data['state']);
            $account = $oauth->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if (blank(Setting::get('meetings_google_calendar_id')) && str_contains($account, '@')) {
            Setting::put('meetings_google_calendar_id', $account);
        }

        return response()->json(['data' => ['account' => $account]]);
    }

    /**
     * POST admin/meetings/google/disconnect. The events already in Google
     * stay where they are; a meeting synced under this account is marked
     * `off` the next time it changes, unless the same account comes back.
     * The console warns with `synced_future_count` before pressing this.
     */
    public function disconnect(Request $request): JsonResponse
    {
        $stranded = $this->syncedFutureCount();

        OAuthConnection::meetingsCalendar()->disconnect();

        return response()->json(['data' => ['is_connected' => false, 'synced_future_count' => $stranded]]);
    }

    /**
     * POST admin/meetings/google/test: one real freeBusy on the connected
     * calendar over the next day. Google's words on a refusal, written where
     * the panel shows them; a success clears them.
     */
    public function test(Request $request, GoogleCalendar $calendar): JsonResponse
    {
        if (! $calendar->connected()) {
            return response()->json(['message' => 'Connect a Google account first.'], 422);
        }

        try {
            $result = $calendar->probe();
        } catch (\Throwable $e) {
            OAuthConnection::meetingsCalendar()->fail($e->getMessage());

            return response()->json(['message' => $e->getMessage()], 422);
        }

        Setting::put('meetings_google_error', null);

        return response()->json(['data' => $result]);
    }

    private function syncedFutureCount(): int
    {
        return Meeting::query()
            ->upcoming()
            ->where('google_status', MeetingGoogleStatus::Synced->value)
            ->whereNotNull('google_event_id')
            ->count();
    }
}
