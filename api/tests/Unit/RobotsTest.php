<?php

namespace Tests\Unit;

use App\Support\Newsletter\Robots;
use PHPUnit\Framework\TestCase;

/**
 * robots.txt as the website crawl obeys it: the group naming our agent if
 * there is one, else `*`; the longest matching rule wins, Allow on a tie.
 */
class RobotsTest extends TestCase
{
    public function test_a_disallow_for_everyone_is_obeyed(): void
    {
        $robots = Robots::parse("User-agent: *\nDisallow: /private/\n", 'technoware-importer');

        $this->assertFalse($robots->allows('https://a.in/private/list'));
        $this->assertTrue($robots->allows('https://a.in/public'));
    }

    public function test_the_group_for_our_agent_replaces_the_general_one(): void
    {
        $text = "User-agent: *\nDisallow: /\n\nUser-agent: Technoware-Importer\nDisallow: /members/export\n";
        $robots = Robots::parse($text, 'technoware-importer');

        $this->assertTrue($robots->allows('https://a.in/members'));
        $this->assertFalse($robots->allows('https://a.in/members/export.csv'));
    }

    public function test_the_longer_allow_carves_out_of_a_disallow_and_does_not_over_reach(): void
    {
        $robots = Robots::parse("User-agent: *\nDisallow: /directory/\nAllow: /directory/members\n", 'technoware-importer');

        $this->assertTrue($robots->allows('https://a.in/directory/members'));
        $this->assertTrue($robots->allows('https://a.in/directory/members/page-2'));
        $this->assertFalse($robots->allows('https://a.in/directory/admin'));
    }

    public function test_wildcards_and_the_end_anchor(): void
    {
        $robots = Robots::parse("User-agent: *\nDisallow: /*?sort=\nDisallow: /*.php$\n", 'technoware-importer');

        $this->assertFalse($robots->allows('https://a.in/list?sort=name'));
        $this->assertFalse($robots->allows('https://a.in/index.php'));
        $this->assertTrue($robots->allows('https://a.in/index.php?x=1'));
    }

    public function test_an_empty_disallow_allows_everything_and_the_rules_survive_a_round_trip(): void
    {
        $robots = Robots::parse("User-agent: *\nDisallow:\n", 'technoware-importer');
        $this->assertTrue($robots->allows('https://a.in/anything'));

        $strict = Robots::parse("User-agent: *\nDisallow: /x\n", 'technoware-importer');
        $this->assertFalse(Robots::fromRules($strict->rules())->allows('https://a.in/x/y'));
        $this->assertFalse(Robots::denyAll()->allows('https://a.in/'));
    }
}
