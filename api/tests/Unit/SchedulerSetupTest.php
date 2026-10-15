<?php

namespace Tests\Unit;

use App\Support\System\SchedulerSetup;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Where each kind of host keeps its command-line PHP.
 *
 * A web request knows the binary that is serving *it* — FPM, CGI, or Apache
 * itself — and a cron line needs the CLI, which lives somewhere else by a
 * rule that differs per control panel. None of these hosts can be reached
 * from a development machine, so the mapping is pinned here, one row per
 * rule, with the filesystem stubbed.
 */
class SchedulerSetupTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string, 2: string, 3: string, 4: list<string>, 5: string}> */
    public static function hosts(): array
    {
        return [
            'the command line itself' => ['/usr/bin/php8.3', 'cli', 'Linux', '/usr/bin', [], '/usr/bin/php8.3'],
            'artisan serve on Windows' => ['C:\\laragon\\bin\\php\\php-8.3.30\\php.exe', 'cli-server', 'Windows', 'C:\\php', [], 'C:\\laragon\\bin\\php\\php-8.3.30\\php.exe'],
            'Plesk FPM' => ['/opt/plesk/php/8.3/sbin/php-fpm', 'fpm-fcgi', 'Linux', '/opt/plesk/php/8.3/bin', [], '/opt/plesk/php/8.3/bin/php'],
            'Plesk CGI' => ['/opt/plesk/php/8.4/bin/php-cgi', 'cgi-fcgi', 'Linux', '', [], '/opt/plesk/php/8.4/bin/php'],
            'cPanel EasyApache' => ['/opt/cpanel/ea-php83/root/usr/sbin/php-fpm', 'fpm-fcgi', 'Linux', '', [], '/opt/cpanel/ea-php83/root/usr/bin/php'],
            'CloudLinux alt-php' => ['/opt/alt/php83/usr/bin/lsphp', 'litespeed', 'Linux', '', [], '/opt/alt/php83/usr/bin/php'],
            'a plain server, the versioned binary first' => ['/usr/sbin/php-fpm8.3', 'fpm-fcgi', 'Linux', '/usr/bin', ['/usr/bin/php8.3', '/usr/bin/php'], '/usr/bin/php8.3'],
            'a plain server with only php' => ['/usr/sbin/php-fpm', 'fpm-fcgi', 'Linux', '/usr/bin', ['/usr/bin/php'], '/usr/bin/php'],
            'Apache module on Linux, binary unknown' => ['', 'apache2handler', 'Linux', '/usr/bin', ['/usr/bin/php'], '/usr/bin/php'],
            'Windows CGI: php.exe beside it' => ['C:\\php83\\php-cgi.exe', 'cgi-fcgi', 'Windows', 'C:\\php', ['C:\\php83\\php.exe'], 'C:\\php83\\php.exe'],
            'XAMPP: the binary is Apache, PHP has its own folder' => ['C:\\xampp\\apache\\bin\\httpd.exe', 'apache2handler', 'Windows', 'C:\\xampp\\php', ['C:\\xampp\\php\\php.exe'], 'C:\\xampp\\php\\php.exe'],
            'nothing found: plain php, for the check to judge' => ['/usr/sbin/php-fpm', 'fpm-fcgi', 'Linux', '/usr/bin', [], 'php'],
            'nothing found on Windows' => ['C:\\server\\httpd.exe', 'apache2handler', 'Windows', '', [], 'php'],
        ];
    }

    /** @param list<string> $present */
    #[DataProvider('hosts')]
    public function test_the_command_line_php_is_found_by_the_hosts_own_rule(string $binary, string $sapi, string $family, string $bindir, array $present, string $expected): void
    {
        $exists = fn (string $path): bool => in_array($path, $present, true);

        $this->assertSame($expected, SchedulerSetup::phpCli($binary, $sapi, $family, $bindir, $exists, '8.3'));
    }
}
