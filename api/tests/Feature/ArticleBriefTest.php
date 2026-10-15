<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Models\ChatEvent;
use App\Models\KnowledgeArticle;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Seo\Ai\ArticleBrief;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A knowledge-base draft written from the assistant's unanswered questions —
 * `POST /admin/chat/unanswered/brief` and `App\Support\Seo\Ai\ArticleBrief`.
 */
class ArticleBriefTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $slug): User
    {
        $user = User::create([
            'name' => 'Test '.$slug, 'email' => $slug.'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $slug], ['name' => $slug])->id);

        return $user->load('roles');
    }

    private function setting(string $key, ?string $value, string $type = 'string', string $group = 'seo'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function enable(): void
    {
        $this->setting('seo_ai_enabled', '1', 'boolean');
        $this->setting('openrouter_api_key', 'sk-test', 'string', 'integrations');
    }

    private function fakeProvider(string $says, bool $ok = true): object
    {
        $fake = new class($says, $ok) implements AiProvider
        {
            public int $calls = 0;

            public array $lastMessages = [];

            public array $lastOptions = [];

            public function __construct(private string $says, private bool $ok) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                $this->calls++;
                $this->lastMessages = $messages;
                $this->lastOptions = $options;

                return $this->ok ? AiReply::of($this->says, 42) : AiReply::failed('quota exceeded');
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

    /** @return array<int, int> */
    private function unanswered(string ...$questions): array
    {
        $ids = [];
        foreach ($questions as $q) {
            $ids[] = ChatEvent::create(['chat_conversation_id' => null, 'type' => 'unanswered', 'context' => ['question' => $q], 'created_at' => now()])->id;
        }

        return $ids;
    }

    private const REPLY = '{"title": "Setting up a guest Wi-Fi network for visitors", "excerpt": "What a guest network needs to keep visitors off the office LAN, and the questions to settle before switching one on.", "sections": [{"heading": "Why a separate network", "paragraphs": ["A guest network keeps visitors\' devices away from file servers and printers.", "The controller does the separation with a VLAN — [CHECK: which controller models the business installs]."]}, {"heading": "What to decide first", "paragraphs": ["Bandwidth per guest and whether a captive portal is wanted — [CHECK: whether the business offers a captive portal]."]}], "faqs": [{"question": "Can guests reach the office printer?", "answer": "Not on a properly separated guest VLAN — [CHECK: exceptions the business supports]."}], "links": [{"n": 1, "anchor": "enterprise Wi-Fi"}, {"n": 99, "anchor": "a page that does not exist"}]}';

    public function test_a_group_becomes_a_draft_article_and_is_marked_handled(): void
    {
        $this->enable();
        Solution::create(['title' => 'Enterprise Wi-Fi', 'slug' => 'enterprise-wifi', 'summary' => 'Surveyed wireless.', 'status' => 'published']);
        $fake = $this->fakeProvider(self::REPLY);
        $ids = $this->unanswered('do you set up guest wifi?', 'Do you set up guest WiFi?', 'can visitors use the printer');

        $res = $this->actingAs($this->staff('admin'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(201)
            ->json('data');

        $article = KnowledgeArticle::findOrFail($res['id']);
        $this->assertSame('/admin/knowledge-base/'.$article->id, $res['admin_path']);
        $this->assertSame(PublishStatus::Draft, $article->status);
        $this->assertSame('Setting up a guest Wi-Fi network for visitors', $article->title);
        $this->assertSame([ArticleBrief::TAG], $article->tags);
        $this->assertNull($article->published_at);

        // The shape: the questions it was written from, the sections, the FAQ block, the links.
        $this->assertStringContainsString('2 unanswered questions', $article->body);
        $this->assertStringContainsString('<h2>Why a separate network</h2>', $article->body);
        $this->assertStringContainsString('[CHECK: which controller models the business installs]', $article->body);
        $this->assertStringContainsString('<h2>Questions people ask</h2>', $article->body);
        $this->assertStringContainsString('<h3>Can guests reach the office printer?</h3>', $article->body);
        $this->assertStringContainsString('href="/solutions/enterprise-wifi"', $article->body);
        $this->assertStringNotContainsString('does not exist', $article->body, 'a link outside the numbered list is dropped');

        // The group is handled, and knows what handled it.
        foreach (ChatEvent::whereIn('id', $ids)->get() as $event) {
            $this->assertNotNull($event->resolved_at);
            $this->assertSame($article->id, $event->context['drafted_article_id']);
        }

        // Duplicate questions were sent once, fenced, and the model was told not to invent.
        $context = $fake->lastMessages[1]['content'];
        $this->assertSame(1, substr_count($context, 'do you set up guest wifi?') + substr_count($context, 'Do you set up guest WiFi?'));
        $this->assertStringContainsString('---VISITOR QUESTIONS---', $context);
        $this->assertStringContainsString('Never invent one', $fake->lastMessages[0]['content']);
    }

    /** An article is a long reply: more than a visitor's thirty seconds, and readable through a fence. */
    public function test_the_provider_is_given_time_and_a_fenced_reply_is_read(): void
    {
        $this->enable();
        $fake = $this->fakeProvider("```json\n".self::REPLY."\n```");
        $ids = $this->unanswered('do you set up guest wifi?');

        $this->actingAs($this->staff('admin'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(201)
            ->assertJsonPath('data.title', 'Setting up a guest Wi-Fi network for visitors');

        $this->assertSame(90, $fake->lastOptions['timeout']);
    }

    public function test_it_refuses_when_switched_off_and_writes_nothing(): void
    {
        $this->setting('seo_ai_enabled', '0', 'boolean');
        $fake = $this->fakeProvider(self::REPLY);
        $ids = $this->unanswered('do you set up guest wifi?');

        $this->actingAs($this->staff('admin'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(422)
            ->assertJsonPath('errors.ai.0', 'The AI SEO assistant is switched off. Turn it on in Settings → SEO defaults.');

        $this->assertSame(0, $fake->calls);
        $this->assertSame(0, KnowledgeArticle::count());
        $this->assertNull(ChatEvent::find($ids[0])->resolved_at);
    }

    public function test_markup_in_the_models_words_is_text_not_html(): void
    {
        $this->enable();
        $this->fakeProvider('{"title": "A title <script>alert(1)</script>", "excerpt": "x", "sections": [{"heading": "Heading", "paragraphs": ["<img src=x onerror=alert(1)> and an & ampersand"]}], "faqs": [], "links": []}');
        $ids = $this->unanswered('anything?');

        $res = $this->actingAs($this->staff('admin'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(201)
            ->json('data');

        $body = KnowledgeArticle::findOrFail($res['id'])->body;
        $this->assertStringNotContainsString('<script', $body);
        $this->assertStringNotContainsString('<img', $body);
        // Escaped, so the words survive as words — the reader sees the text the model wrote, not an element.
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $body);
        $this->assertStringContainsString('&amp; ampersand', $body);
    }

    public function test_an_unusable_answer_is_refused_and_nothing_is_written(): void
    {
        $this->enable();
        $this->fakeProvider('{"title": "", "sections": []}');
        $ids = $this->unanswered('anything?');

        $this->actingAs($this->staff('admin'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(422);

        $this->assertSame(0, KnowledgeArticle::count());
        $this->assertNull(ChatEvent::find($ids[0])->resolved_at);
    }

    public function test_the_chat_console_is_admin_only(): void
    {
        $this->enable();
        $this->fakeProvider(self::REPLY);
        $ids = $this->unanswered('anything?');

        $this->actingAs($this->staff('content_manager'))
            ->postJson('/api/v1/admin/chat/unanswered/brief', ['ids' => $ids])
            ->assertStatus(403);
    }
}
