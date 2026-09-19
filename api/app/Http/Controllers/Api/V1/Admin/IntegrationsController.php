<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\Newsletter\HunterClient;
use App\Support\Newsletter\SubscriberVerifier;
use App\Support\Seo\SearchConsole;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Proving a third-party key works, from the screen it was typed into.
 *
 * The `/settings/mail/test` shape: one real call, the provider's own words
 * on failure, and a success that clears the banner the last failure wrote.
 */
class IntegrationsController extends Controller
{
    /** Hunter: the account endpoint is free and says what the plan has left. */
    public function hunter(): JsonResponse
    {
        if (! HunterClient::configured()) {
            return response()->json(['message' => 'No Hunter API key is saved. Type one above and save first.'], 422);
        }

        try {
            $account = (new HunterClient)->account();
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        SubscriberVerifier::clearError();
        SubscriberVerifier::forgetAccount();

        return response()->json(['data' => $account]);
    }

    /**
     * Prove the Search Console credential: one real query over the last 28
     * days, and the count of pages that came back. Google's own words on a
     * refusal — a property the account was never added to reads exactly
     * like a wrong key otherwise.
     */
    public function searchConsole(): JsonResponse
    {
        if (! SearchConsole::configured()) {
            return response()->json(['message' => 'No Search Console service account is saved. Paste the JSON key file above and save first.'], 422);
        }

        try {
            return response()->json(['data' => SearchConsole::test()]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
