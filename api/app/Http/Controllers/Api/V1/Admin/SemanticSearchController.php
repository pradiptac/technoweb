<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\IndexSearch;
use App\Models\SearchPassage;
use App\Models\Setting;
use App\Support\Chat\ChatSettings;
use App\Support\Search\Embeddings;
use App\Support\Search\Semantic;
use App\Support\Search\SemanticSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/** Search by meaning's console (docs/semantic-search.md): the status panel, Test this model and Re-index now. Administrators only. */
class SemanticSearchController extends Controller
{
    public function show(): JsonResponse
    {
        $model = SemanticSettings::model();

        return response()->json(['data' => [
            'enabled' => SemanticSettings::enabled(),
            'model' => $model,
            'passages' => [
                'total' => SearchPassage::count(),
                'embedded' => SearchPassage::query()->where('model', $model)->whereNotNull('embedded_at')->count(),
                'waiting' => SearchPassage::query()->whereNull('embedded_at')->count(),
            ],
            'today' => ['phrases' => (int) Cache::get(Semantic::TODAY_KEY_PREFIX.now()->toDateString(), 0), 'cap' => SemanticSettings::dailyCap()],
            'error' => Setting::get('semantic_search_error') ?: null,
            'last_index_at' => Cache::get(IndexSearch::LAST_RUN_KEY),
            'indexing' => Cache::has(IndexSearch::RUNNING_KEY),
        ]]);
    }

    public function test(): JsonResponse
    {
        if (ChatSettings::apiKey() === null) {
            return $this->refuse('Save an OpenRouter API key first.', 'model');
        }

        // Forget an older refusal, so what is read below is this attempt's.
        SemanticSettings::clearError();
        $vectors = Embeddings::embed(['A test from the console.'], 15);

        if ($vectors === null || ! isset($vectors[0])) {
            $message = (string) (Setting::get('semantic_search_error') ?: 'OpenRouter did not answer in time.');

            return $this->refuse($message, 'model');
        }

        return response()->json(['data' => ['model' => SemanticSettings::model(), 'dimensions' => count($vectors[0])]]);
    }

    public function reindex(): JsonResponse
    {
        if (! SemanticSettings::enabled()) {
            return $this->refuse('Switch search by meaning on first.');
        }

        if (! Cache::add(IndexSearch::RUNNING_KEY, 1, IndexSearch::RUNNING_TTL)) {
            return $this->refuse('Indexing is already running — it will finish on its own.');
        }

        IndexSearch::dispatch();

        return response()->json(['message' => 'Indexing has started. It runs in the background.'], 202);
    }

    private function refuse(string $message, string $field = 'semantic'): JsonResponse
    {
        return response()->json(['message' => $message, 'errors' => [$field => [$message]]], 422);
    }
}
