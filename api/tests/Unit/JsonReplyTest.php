<?php

namespace Tests\Unit;

use App\Support\Chat\JsonReply;
use App\Support\Seo\Ai\SeoAssistant;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Reading the JSON a model was asked for (`JsonReply`, and
 * `SeoAssistant::decode()`, which every JSON caller in the SEO module uses
 * and which is the same reader).
 *
 * The models are no longer one maker's (0.116.0, OpenRouter): a GPT model
 * answers with a bare object, a Gemini model fences it or introduces it —
 * in JSON mode, with the object whole inside. Forgiving about the wrapping,
 * never about the contents.
 */
class JsonReplyTest extends TestCase
{
    private const OBJECT = ['title' => 'Managed office Wi-Fi', 'items' => [['n' => 1, 'note' => 'a {brace} in text']]];

    public static function wrapped(): array
    {
        $json = json_encode(self::OBJECT);
        $pretty = json_encode(self::OBJECT, JSON_PRETTY_PRINT);

        return [
            'a bare object' => [$json],
            'surrounding whitespace' => ["\n\n  {$json}  \n"],
            'a byte-order mark' => ["\xEF\xBB\xBF{$json}"],
            'a json fence' => ["```json\n{$json}\n```"],
            'a fence with no language' => ["```\n{$json}\n```"],
            'a fence in capitals, CRLF' => ["```JSON\r\n{$pretty}\r\n```"],
            'a fence on one line' => ["```json {$json}```"],
            'a sentence, then a fence' => ["Here is the JSON you asked for:\n\n```json\n{$pretty}\n```"],
            'a fence, then a sentence' => ["```json\n{$json}\n```\n\nLet me know if you want it changed."],
            'a sentence, then the object' => ["Sure! Here is the page:\n{$json}"],
            'the object, then a sentence' => ["{$json}\n\nI hope that helps."],
            'prose holding a brace of its own' => ["Using the {shape} you gave, here it is: {$json}"],
            'a fence never closed' => ["```json\n{$json}"],
        ];
    }

    #[DataProvider('wrapped')]
    public function test_the_object_is_read_through_its_wrapping(string $reply): void
    {
        $this->assertSame(self::OBJECT, JsonReply::decode($reply));
        $this->assertSame(self::OBJECT, SeoAssistant::decode($reply), 'the SEO module reads through the same reader');
    }

    public static function unreadable(): array
    {
        return [
            'nothing' => [''],
            'whitespace' => ["  \n "],
            'prose' => ['Certainly! Here are some ideas for your page.'],
            'prose with braces' => ['I would use {title} and {description} here.'],
            'a bare string' => ['"ready"'],
            'a number' => ['42'],
            // Cut off by the token cap. Repairing it would be an answer the
            // model did not give.
            'a truncated object' => ['{"title": "Managed office Wi-Fi", "items": [{"n": 1'],
            'a truncated object in a fence' => ["```json\n{\"title\": \"Managed\n```"],
            'an empty fence' => ["```json\n```"],
        ];
    }

    #[DataProvider('unreadable')]
    public function test_what_is_not_json_is_null_and_never_repaired(string $reply): void
    {
        $this->assertNull(JsonReply::decode($reply));
        $this->assertNull(SeoAssistant::decode($reply));
    }

    public function test_text_after_the_object_that_holds_a_brace_does_not_hide_it(): void
    {
        // The last closing brace belongs to the object when the tail has
        // none; when the tail has one the fence is what finds the object.
        $reply = "```json\n{\"a\": 1}\n```\nUse it as {given}.";

        $this->assertSame(['a' => 1], JsonReply::decode($reply));
    }
}
