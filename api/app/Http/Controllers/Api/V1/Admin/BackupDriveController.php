<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\OAuth\CallbackPath;
use App\Support\OAuth\OAuthConnection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Connecting the Google Drive backups are kept in: the consent round trip,
 * on its own OAuth slot (`OAuthConnection::backupDrive()`), coming back to
 * exactly one console path.
 */
class BackupDriveController extends Controller
{
    public const CALLBACK = '/admin/backups/drive/callback';

    public function status(): JsonResponse
    {
        $oauth = OAuthConnection::backupDrive();

        return response()->json(['data' => [
            'is_connected' => $oauth->isConnected(),
            'account' => Setting::get('backup_gdrive_oauth_account'),
            'connected_at' => Setting::get('backup_gdrive_oauth_connected_at'),
            'client_configured' => filled(Setting::get('backup_gdrive_oauth_client_id')) && filled(Setting::get('backup_gdrive_oauth_client_secret')),
            'error' => Setting::get('backup_gdrive_error'),
            'callback_path' => self::CALLBACK,
        ]]);
    }

    public function authorize(Request $request): JsonResponse
    {
        $data = $request->validate(['redirect_uri' => ['required', 'url', 'max:300']]);
        $redirect = CallbackPath::assert($data['redirect_uri'], self::CALLBACK);

        try {
            $result = OAuthConnection::backupDrive()->authorizeUrl($redirect);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $result['url']]]);
    }

    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:4000'],
            'state' => ['required', 'string', 'max:200'],
        ]);

        try {
            $oauth = OAuthConnection::backupDrive();
            $stored = $oauth->consumeState($data['state']);
            $account = $oauth->exchange($data['code'], $stored['redirect']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['account' => $account]]);
    }

    public function disconnect(): JsonResponse
    {
        OAuthConnection::backupDrive()->disconnect();
        // The folder belongs to the account that was connected; a new consent starts a new one.
        Setting::put('backup_gdrive_folder_id', null);

        return response()->json(['data' => ['is_connected' => false]]);
    }
}
