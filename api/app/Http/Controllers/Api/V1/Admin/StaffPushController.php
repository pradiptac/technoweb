<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\StaffPushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/** A staff member's browsers for alerts (docs/digest-alerts.md). */
class StaffPushController extends Controller
{
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'min:20', 'max:512']]);
        if (! MessageChannel::Push->ready()) {
            throw ValidationException::withMessages(['token' => 'Browser notifications are not set up on this site.']);
        }

        $sub = StaffPushSubscription::query()->updateOrCreate(
            ['token' => $data['token']],
            ['user_id' => $request->user()->id, 'label' => self::label((string) $request->userAgent()), 'last_seen_at' => now(), 'failed_at' => null],
        );

        return response()->json(['data' => [
            'id' => $sub->id, 'label' => $sub->label, 'last_seen_at' => $sub->last_seen_at?->toIso8601String(), 'failed' => false,
        ]]);
    }

    public function destroy(Request $request, int $id): Response
    {
        StaffPushSubscription::query()->where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->noContent();
    }

    /** "Chrome on Windows" — enough to tell two browsers apart; never the whole agent string. */
    private static function label(string $agent): string
    {
        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Edge', str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'Chrome/') => 'Chrome', str_contains($agent, 'Safari/') => 'Safari', default => 'A browser',
        };
        $os = match (true) {
            str_contains($agent, 'Android') => 'Android', str_contains($agent, 'iPhone') || str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Windows') => 'Windows', str_contains($agent, 'Mac OS') => 'macOS', str_contains($agent, 'Linux') => 'Linux',
            default => 'an unknown system',
        };

        return "{$browser} on {$os}";
    }
}
