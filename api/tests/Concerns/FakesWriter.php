<?php

namespace Tests\Concerns;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;

/** A fake model for writing-help tests: records what it was sent, answers what it is told. */
trait FakesWriter
{
    protected function writerOn(): void
    {
        Setting::updateOrCreate(['key' => 'seo_ai_enabled'], ['group' => 'seo', 'value' => '1', 'type' => 'boolean']);
        // A credential row is encrypted at rest, so it is written through the model's own setter.
        $row = Setting::firstOrNew(['key' => 'openrouter_api_key'], ['group' => 'integrations', 'type' => 'string', 'is_secret' => true]);
        $row->setPlainValue('sk-test');
        $row->save();
        Setting::flushCache();
    }

    /** @param array<string, mixed>|string $says */
    protected function fakeModel(array|string $says, bool $ok = true): object
    {
        $fake = new class(is_array($says) ? (string) json_encode($says) : $says, $ok) implements AiProvider
        {
            public int $calls = 0;

            public array $lastMessages = [];

            public array $lastOptions = [];

            public function __construct(public string $says, private bool $ok) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                $this->calls++;
                $this->lastMessages = $messages;
                $this->lastOptions = $options;

                return $this->ok ? AiReply::of($this->says, 42) : AiReply::failed('quota exceeded for org-123');
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

    protected function sent(object $fake): string
    {
        return implode("\n", array_map(fn ($m) => is_string($m['content']) ? $m['content'] : json_encode($m['content']), $fake->lastMessages));
    }

    protected function staff(RoleEnum $role, string $tag = ''): User
    {
        $user = User::firstOrCreate(['email' => "writer-{$role->value}{$tag}@example.test"], [
            'name' => 'Writer', 'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }
}
