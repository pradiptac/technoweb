<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Alt text proposed by the model — `POST /admin/media/{id}/alt-suggest`. */
class AltTextTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $user = User::create(['name' => 'Mia', 'email' => 'mia@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]));

        return $user;
    }

    private function setting(string $key, ?string $value, string $type = 'string', string $group = 'seo'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function enable(): void
    {
        $this->setting('seo_ai_enabled', '1', 'boolean');
        $this->setting('openai_api_key', 'sk-test', 'string', 'integrations');
    }

    private function fakeProvider(string $says): object
    {
        $fake = new class($says) implements AiProvider
        {
            public int $calls = 0;

            public array $lastMessages = [];

            public function __construct(private string $says) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                $this->calls++;
                $this->lastMessages = $messages;

                return AiReply::of($this->says, 12);
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'fake';
            }
        };
        $this->app->instance(AiProvider::class, $fake);

        return $fake;
    }

    private function picture(string $mime = 'image/png', string $path = 'media/2026/09/switch.png'): Media
    {
        Storage::fake('public');
        Storage::disk('public')->put($path, 'not-really-a-picture');

        return Media::create(['disk' => 'public', 'path' => $path, 'filename' => 'cbs350-front.png', 'mime' => $mime, 'size' => 20]);
    }

    public function test_it_sends_the_picture_and_hands_back_one_sentence_without_writing_it(): void
    {
        $this->enable();
        $fake = $this->fakeProvider('{"alt": "Cisco CBS350 24-port switch, front view  with SFP uplinks", "decorative": false}');
        $media = $this->picture();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/alt-suggest")
            ->assertOk()
            ->assertJsonPath('data.alt', 'Cisco CBS350 24-port switch, front view with SFP uplinks');

        $this->assertNull($media->fresh()->alt_text, 'suggest-only: the field changes through the ordinary PATCH');

        // The picture travelled as data, not as a link the provider might not be able to fetch.
        $parts = $fake->lastMessages[1]['content'];
        $this->assertSame('image_url', $parts[1]['type']);
        $this->assertStringStartsWith('data:image/png;base64,', $parts[1]['image_url']['url']);
        $this->assertStringContainsString('cbs350-front.png', $parts[0]['text']);
    }

    public function test_a_decorative_verdict_is_an_empty_alt(): void
    {
        $this->enable();
        $this->fakeProvider('{"alt": "", "decorative": true}');
        $media = $this->picture();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/alt-suggest")
            ->assertOk()
            ->assertJsonPath('data.alt', '');
    }

    public function test_a_vector_is_refused_before_the_model_is_asked(): void
    {
        $this->enable();
        $fake = $this->fakeProvider('{"alt": "x"}');
        $media = $this->picture('image/svg+xml', 'media/2026/09/logo.svg');

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/alt-suggest")
            ->assertStatus(422)
            ->assertJsonPath('errors.ai.0', 'Only a JPEG, PNG, WebP or GIF can be described; a vector has no picture to look at.');

        $this->assertSame(0, $fake->calls);
    }

    public function test_it_refuses_when_switched_off(): void
    {
        $this->setting('seo_ai_enabled', '0', 'boolean');
        $fake = $this->fakeProvider('{"alt": "x"}');
        $media = $this->picture();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/media/{$media->id}/alt-suggest")
            ->assertStatus(422);

        $this->assertSame(0, $fake->calls);
    }
}
