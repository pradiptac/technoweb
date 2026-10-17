<?php

namespace App\Support\Search;

use App\Support\Chat\ChatSettings;
use App\Support\Chat\Providers\OpenRouterProvider;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * OpenRouter's embeddings endpoint (docs/semantic-search.md), with the key and
 * the attribution every AI call uses and the same routing pins, so a request
 * never falls back to a paid provider the account did not choose. Never
 * throws: any failure is null, and a refusal is written to
 * `semantic_search_error` in OpenRouter's words.
 */
final class Embeddings
{
    public const ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

    public const BATCH = 100;

    /**
     * @param  list<string>  $inputs
     * @return list<list<float>>|null unit vectors, in input order
     */
    public static function embed(array $inputs, ?float $timeout = null): ?array
    {
        $key = ChatSettings::apiKey();

        if ($inputs === [] || $key === null) {
            return $inputs === [] ? [] : null;
        }

        $model = SemanticSettings::model();

        try {
            $response = Http::withToken($key)
                ->withHeaders(OpenRouterProvider::attribution())
                ->timeout($timeout ?? 30)
                ->post(self::ENDPOINT, array_filter([
                    'model' => $model,
                    'input' => $inputs,
                    'dimensions' => str_starts_with($model, 'openai/') ? SemanticSettings::DIMENSIONS : null,
                    'provider' => OpenRouterProvider::routing($model),
                ], fn ($v) => $v !== null));
        } catch (Throwable $e) {
            // A timeout during a visitor's search is not a refusal: no error banner.
            Log::warning('Semantic search: the embeddings call failed', ['error' => $e->getMessage()]);

            return null;
        }

        $error = $response->json('error.message');
        $rows = $response->json('data');

        if (! $response->successful() || is_string($error) || ! is_array($rows) || count($rows) !== count($inputs)) {
            SemanticSettings::recordError(is_string($error) ? $error : 'OpenRouter answered '.$response->status().' with no embeddings.');

            return null;
        }

        usort($rows, fn ($a, $b) => ($a['index'] ?? 0) <=> ($b['index'] ?? 0));
        SemanticSettings::clearError();

        return array_map(fn (array $row) => Vectors::normalise(array_map('floatval', (array) ($row['embedding'] ?? []))), $rows);
    }
}
