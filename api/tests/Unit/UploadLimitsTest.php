<?php

namespace Tests\Unit;

use App\Models\Setting;
use App\Support\UploadLimits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The upload ceiling, and the php.ini shorthand it is parsed from.
 *
 * Worth testing on its own because every part of it is a quiet failure. A
 * misparsed `2M` is a limit a thousand times too small or too large; a missing
 * `min()` is a console promising a size the server refuses; and both surface
 * as "uploads sometimes do not work" rather than as anything pointing here.
 */
class UploadLimitsTest extends TestCase
{
    // This writes settings rows, so it cannot leave them behind for whatever
    // runs next.
    use RefreshDatabase;

    /**
     * php.ini's suffixes are **binary** multipliers, so `2M` is 2048K and not
     * 2000K. Getting that wrong is a 2.4% error, which is small enough to look
     * like rounding and large enough to refuse a file that should fit.
     *
     * @return array<string, array{0:string,1:int}>
     */
    public static function shorthand(): array
    {
        return [
            'megabytes' => ['2M', 2048],
            'lowercase megabytes' => ['8m', 8192],
            'kilobytes' => ['512K', 512],
            'gigabytes' => ['1G', 1024 * 1024],
            'a plain byte count' => ['8388608', 8192],
            'a decimal value' => ['1.5M', 1536],
        ];
    }

    #[DataProvider('shorthand')]
    public function test_it_reads_php_ini_shorthand_as_binary_multiples(string $value, int $expectedKb): void
    {
        $this->assertSame($expectedKb, $this->toKb($value));
    }

    /**
     * "No limit" has to be enormous rather than zero.
     *
     * PHP writes `0` or `-1` for an unlimited `post_max_size`. Read literally
     * that is the *smallest* value in the comparison, so `min()` would clamp
     * every upload to nothing — a server with no limit configured would accept
     * no files at all.
     *
     * @return array<string, array{0:string}>
     */
    public static function unlimited(): array
    {
        return ['zero' => ['0'], 'minus one' => ['-1'], 'empty' => ['']];
    }

    #[DataProvider('unlimited')]
    public function test_an_unlimited_value_does_not_clamp_everything_to_nothing(string $value): void
    {
        $this->assertSame(PHP_INT_MAX, $this->toKb($value));
    }

    /**
     * The enforced limit is the smallest of the three ceilings.
     *
     * A setting above what PHP accepts is not a bigger limit; it is a promise
     * the server will not keep, and the file is discarded before any
     * application code runs.
     */
    public function test_the_effective_limit_never_exceeds_what_php_accepts(): void
    {
        $ceiling = UploadLimits::phpCeilingKb();

        Setting::updateOrCreate(
            ['key' => 'media_max_kb'],
            ['group' => 'media', 'value' => (string) ($ceiling + 100_000), 'type' => 'string'],
        );

        $this->assertSame($ceiling, UploadLimits::maxKb(), 'a setting above php.ini was taken at face value');
        $this->assertTrue(UploadLimits::describe()['capped'], 'the console was not told php.ini is overruling the setting');
    }

    /** A blank or nonsensical setting falls back rather than refusing everything. */
    public function test_an_unusable_setting_falls_back_to_the_default(): void
    {
        foreach (['', '0', '-5', 'plenty'] as $bad) {
            Setting::updateOrCreate(
                ['key' => 'media_max_kb'],
                ['group' => 'media', 'value' => $bad, 'type' => 'string'],
            );

            $this->assertSame(
                min(UploadLimits::DEFAULT_KB, UploadLimits::phpCeilingKb()),
                UploadLimits::maxKb(),
                "a setting of '{$bad}' should fall back, not disable uploads",
            );
        }
    }

    /** Video has its own, larger ceiling and must not read the image one. */
    public function test_video_reads_its_own_setting(): void
    {
        Setting::updateOrCreate(
            ['key' => 'media_max_kb'],
            ['group' => 'media', 'value' => '5120', 'type' => 'string'],
        );
        Setting::updateOrCreate(
            ['key' => 'media_max_video_kb'],
            ['group' => 'media', 'value' => '20480', 'type' => 'string'],
        );

        $this->assertSame(min(5120, UploadLimits::phpCeilingKb()), UploadLimits::maxKb());
        $this->assertSame(min(20480, UploadLimits::phpCeilingKb()), UploadLimits::maxKb(true));
    }

    /** Reaches the private parser without loosening its visibility. */
    private function toKb(string $value): int
    {
        $method = new \ReflectionMethod(UploadLimits::class, 'toKb');

        return $method->invoke(null, $value);
    }
}
