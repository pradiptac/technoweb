<?php

namespace Tests\Unit;

use App\Support\Analytics\AgentParser;
use App\Support\Analytics\Bots;
use App\Support\Analytics\Geo;
use App\Support\Analytics\Source;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AnalyticsParsersTest extends TestCase
{
    public function test_bots_are_recognised_and_browsers_are_not(): void
    {
        foreach (['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'curl/8.4.0', 'python-requests/2.31', 'HeadlessChrome/120', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)', ''] as $ua) {
            $this->assertTrue(Bots::is($ua), $ua);
        }
        $this->assertTrue(Bots::is(null));
        $this->assertFalse(Bots::is('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'));
    }

    public function test_the_agent_parser_reads_families_and_device(): void
    {
        $iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
        $this->assertSame(['device' => 'phone', 'browser' => 'Safari', 'os' => 'iOS'], AgentParser::parse($iphone, 390));
        $edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
        $this->assertSame(['device' => 'desktop', 'browser' => 'Edge', 'os' => 'Windows'], AgentParser::parse($edge, 1440));
        $ipad = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
        $this->assertSame('tablet', AgentParser::parse($ipad, 820)['device']);
        $samsung = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36';
        $this->assertSame(['device' => 'phone', 'browser' => 'Samsung Internet', 'os' => 'Android'], AgentParser::parse($samsung, 412));
        $this->assertSame('phone', AgentParser::parse('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0', 360)['device'], 'a narrow window is a phone whatever the agent says');
    }

    /** @return array<string, array{0: ?string, 1: array<string, string>, 2: array<string, ?string>}> */
    public static function sources(): array
    {
        return [
            'google' => ['https://www.google.co.in/', [], ['channel' => 'search', 'source' => 'Google']],
            'bing' => ['https://www.bing.com/search?q=x', [], ['channel' => 'search', 'source' => 'Bing']],
            'linkedin' => ['https://www.linkedin.com/feed/', [], ['channel' => 'social', 'source' => 'LinkedIn']],
            'lnkd' => ['https://lnkd.in/abc', [], ['channel' => 'social', 'source' => 'LinkedIn']],
            'facebook mobile' => ['https://m.facebook.com/', [], ['channel' => 'social', 'source' => 'Facebook']],
            'x' => ['https://t.co/abc', [], ['channel' => 'social', 'source' => 'X']],
            'whatsapp' => ['https://web.whatsapp.com/', [], ['channel' => 'social', 'source' => 'WhatsApp']],
            'mail' => ['https://mail.google.com/', [], ['channel' => 'email', 'source' => 'Gmail']],
            'other site' => ['https://partner.example.com/page', [], ['channel' => 'referral', 'source' => 'partner.example.com']],
            'own site' => ['https://www.technoware.in/about', [], ['channel' => 'direct', 'source' => null]],
            'none' => [null, [], ['channel' => 'direct', 'source' => null]],
            'utm wins' => ['https://www.google.com/', ['source' => 'newsletter', 'medium' => 'email', 'campaign' => 'oct'], ['channel' => 'email', 'source' => 'newsletter']],
            'utm cpc' => [null, ['source' => 'google', 'medium' => 'cpc', 'campaign' => 'brand'], ['channel' => 'campaign', 'source' => 'google']],
        ];
    }

    /** @param array<string, string> $utm @param array<string, ?string> $want */
    #[DataProvider('sources')]
    public function test_source_and_channel(?string $referrer, array $utm, array $want): void
    {
        $got = Source::of($referrer, $utm, 'www.technoware.in');
        $this->assertSame($want['channel'], $got['channel']);
        $this->assertSame($want['source'], $got['source']);
    }

    public function test_the_edge_header_wins_and_the_table_answers_otherwise(): void
    {
        $request = Request::create('/', 'POST', server: ['HTTP_CF_IPCOUNTRY' => 'in', 'REMOTE_ADDR' => '8.8.8.8']);
        $this->assertSame('IN', Geo::country($request));
        $this->assertNull(Geo::country(Request::create('/', 'POST', server: ['HTTP_CF_IPCOUNTRY' => 'XX', 'REMOTE_ADDR' => '127.0.0.1'])), 'XX and a private address are unknown');

        $v4 = Geo::pack([['1.0.0.0', '1.0.0.255', 'AU'], ['1.0.1.0', '1.0.3.255', 'CN']], 4);
        $this->assertSame('CN', Geo::search($v4, inet_pton('1.0.2.9'), 4));
        $this->assertSame('AU', Geo::search($v4, inet_pton('1.0.0.1'), 4));
        $this->assertNull(Geo::search($v4, inet_pton('9.9.9.9'), 4));
    }

    public function test_the_committed_table_knows_a_well_known_address(): void
    {
        $this->assertSame('US', Geo::lookup('8.8.8.8'));
        $this->assertNotNull(Geo::lookup('2001:4860:4860::8888'));
    }
}
