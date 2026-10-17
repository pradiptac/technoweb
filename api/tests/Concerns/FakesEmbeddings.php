<?php

namespace Tests\Concerns;

use App\Models\Setting;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * OpenRouter's embeddings endpoint, faked with deterministic vectors: each
 * text becomes an 8-dimensional vector from a few topic words, so "network
 * keeps dropping" and an article about Wi-Fi disconnections score high
 * without sharing a word. The stub is registered once per test and reads the
 * status and the vector function when it is called, so calling
 * `fakeEmbeddings()` again changes behaviour (Laravel answers from the first
 * stub registered for a URL, so a second `Http::fake()` would never be heard).
 */
trait FakesEmbeddings
{
    private bool $embeddingsStubbed = false;

    private int $embeddingStatus = 200;

    /** @var callable|null */
    private $embeddingVectorFor = null;

    /** topic => the words that point at it */
    private array $topics = [
        ['wifi', 'wi-fi', 'wireless', 'network', 'dropping', 'disconnect', 'disconnects', 'signal'],
        ['firewall', 'security', 'threat', 'attack', 'utm'],
        ['storage', 'nas', 'backup', 'disk', 'raid'],
        ['camera', 'cctv', 'surveillance', 'video'],
        ['switch', 'switches', 'ports', 'poe'],
        ['server', 'rack', 'datacenter'],
        ['laptop', 'notebook', 'thinkpad'],
        ['printer', 'printing', 'toner'],
    ];

    protected function enableSemanticSearch(): void
    {
        foreach ([
            'semantic_search_enabled' => ['1', 'boolean'],
            'semantic_search_model' => ['openai/text-embedding-3-small', 'string'],
        ] as $key => [$value, $type]) {
            Setting::updateOrCreate(['key' => $key], ['group' => 'semantic_search', 'value' => $value, 'type' => $type]);
        }
        // A credential row is encrypted at rest, so it is written through the model's own setter.
        $row = Setting::firstOrNew(['key' => 'openrouter_api_key'], ['group' => 'integrations', 'type' => 'string', 'is_secret' => true]);
        $row->setPlainValue('sk-or-v1-test');
        $row->save();
        Setting::flushCache();
    }

    /** @return list<float> */
    protected function vectorFor(string $text): array
    {
        $words = preg_split('/[^a-z0-9-]+/', mb_strtolower($text)) ?: [];
        $v = array_fill(0, count($this->topics), 0.0);
        foreach ($this->topics as $i => $topic) {
            $v[$i] = (float) count(array_intersect($words, $topic));
        }
        // A text about nothing in particular points a little at everything, so it never scores 1.
        if (array_sum($v) === 0.0) {
            $v = array_fill(0, count($this->topics), 0.1);
        }

        return $v;
    }

    protected function fakeEmbeddings(?callable $vectorFor = null, int $status = 200): void
    {
        $this->embeddingVectorFor = $vectorFor;
        $this->embeddingStatus = $status;

        if ($this->embeddingsStubbed) {
            return;
        }
        $this->embeddingsStubbed = true;

        Http::preventStrayRequests();
        Http::fake(['openrouter.ai/api/v1/embeddings' => function (Request $request) {
            if ($this->embeddingStatus !== 200) {
                return Http::response(['error' => ['code' => $this->embeddingStatus, 'message' => 'Refused for the test']], $this->embeddingStatus);
            }
            $vectorFor = $this->embeddingVectorFor ?? fn (string $text) => $this->vectorFor($text);
            $inputs = (array) $request->data()['input'];

            return Http::response(['data' => array_map(
                fn ($text, $i) => ['object' => 'embedding', 'index' => $i, 'embedding' => $vectorFor((string) $text)],
                $inputs, array_keys($inputs),
            ), 'usage' => ['total_tokens' => 10]]);
        }]);
    }
}
