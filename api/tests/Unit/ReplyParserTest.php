<?php

namespace Tests\Unit;

use App\Support\InboundMail\ReplyParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * How an emailed reply is read: which ticket it names, and where the new
 * words end.
 *
 * The quoting cases are written the way each client actually formats a
 * reply rather than the way one might expect — the same reason the
 * sanitiser's positive tests assert against what a browser emits. A
 * marker written from memory is a test that passes against the parser
 * and fails against Outlook.
 */
class ReplyParserTest extends TestCase
{
    /* --------------------------------------------------------- the reference */

    public function test_the_reference_is_read_from_our_own_subject_shapes(): void
    {
        $this->assertSame('TW-2026-00007', ReplyParser::reference('Re: [TW-2026-00007] We have your ticket: Switch rebooting'));
        $this->assertSame('TW-2026-00007', ReplyParser::reference('RE: TW-2026-00007 New reply: Switch rebooting'));
        $this->assertSame('TW-2026-00007', ReplyParser::reference('tw-2026-00007 again'));
        $this->assertNull(ReplyParser::reference('Switch rebooting'));
        $this->assertNull(ReplyParser::reference('TW-2026-7 is not a reference'));
    }

    public function test_the_reference_and_the_reply_prefixes_come_off_a_subject(): void
    {
        $this->assertSame('We have your ticket: Switch rebooting', ReplyParser::withoutReference('Re: [TW-2026-00007] We have your ticket: Switch rebooting'));
        $this->assertSame('Switch rebooting', ReplyParser::withoutReference('RE: Fwd: TW-2026-00007 - Switch rebooting'));
        $this->assertSame('Switch rebooting', ReplyParser::withoutReference('Switch rebooting'));
    }

    /* ------------------------------------------------------------ the quoting */

    #[DataProvider('quotedReplies')]
    public function test_quoted_text_is_cut_where_each_client_puts_it(string $text): void
    {
        $this->assertSame("Thanks, it is still happening.\nTwice this morning.", ReplyParser::stripQuoted($text));
    }

    /** @return array<string, array{string}> */
    public static function quotedReplies(): array
    {
        $new = "Thanks, it is still happening.\nTwice this morning.";

        return [
            'gmail' => [$new."\n\nOn Thu, 18 Sep 2026 at 10:00, Technoware Support <support@technoware.in> wrote:\n> Your reference is TW-2026-00007.\n> Quote it if you call."],
            'gmail wrapped date' => [$new."\n\nOn Thu, 18 Sep 2026 at 10:00, Technoware Support\n<support@technoware.in> wrote:\n\n> Your reference is TW-2026-00007."],
            'outlook desktop' => [$new."\r\n\r\n-----Original Message-----\r\nFrom: Technoware Support\r\nSent: Thursday\r\nTo: Neil\r\nSubject: [TW-2026-00007]\r\n\r\nYour reference is TW-2026-00007."],
            'outlook web' => [$new."\n\n________________________________\nFrom: Technoware Support <support@technoware.in>\nSent: 18 September 2026 10:00\nTo: Neil Basu\nSubject: [TW-2026-00007] We have your ticket\n\nYour reference is TW-2026-00007."],
            'apple mail style from/date' => [$new."\n\nFrom: Technoware Support <support@technoware.in>\nDate: Thursday, 18 September 2026 at 10:00\nSubject: [TW-2026-00007]\n\nYour reference is TW-2026-00007."],
            'plain > quoting' => [$new."\n\n> Your reference is TW-2026-00007.\n> Quote it if you call.\n"],
            'french' => [$new."\n\nLe jeu. 18 sept. 2026 à 10:00, Technoware Support <support@technoware.in> a écrit :\n> Votre référence est TW-2026-00007."],
            'german' => [$new."\n\nAm Do., 18. Sept. 2026 um 10:00 Uhr schrieb Technoware Support <support@technoware.in>:\n> Ihre Referenz ist TW-2026-00007."],
        ];
    }

    public function test_a_reply_that_is_only_quoted_text_is_kept_whole(): void
    {
        $text = "> This is what you wrote\n> and I am sending it back";

        $this->assertSame($text, ReplyParser::stripQuoted($text));
    }

    public function test_text_with_no_quoting_is_returned_as_typed(): void
    {
        $this->assertSame("Hello\n\nThe unit is fine now.", ReplyParser::stripQuoted("Hello\n\nThe unit is fine now.\n\n"));
    }
}
