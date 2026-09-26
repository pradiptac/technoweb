<?php

namespace Tests\Unit;

use App\Support\Phone;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * `Phone::e164()` is what decides who an order update goes to on WhatsApp,
 * so a guess is worse than a null: a wrong number is a stranger told about
 * somebody's order.
 */
class PhoneTest extends TestCase
{
    /** @return array<string, array{0: ?string, 1: ?string}> */
    public static function numbers(): array
    {
        return [
            'a bare mobile' => ['9876543210', '+919876543210'],
            'spaced and dashed' => ['98765-43210', '+919876543210'],
            'with +91 and spaces' => ['+91 98765 43210', '+919876543210'],
            'with 91 and no plus' => ['919876543210', '+919876543210'],
            'with a leading 0' => ['09876543210', '+919876543210'],
            'bracketed' => ['(+91) 98765 43210', '+919876543210'],
            'a foreign number kept as typed' => ['+44 20 7946 0958', '+442079460958'],
            'a US number' => ['+1 (415) 555-0100', '+14155550100'],
            'a landline without a code' => ['033 2345 6789', null],
            'a mobile opening with 5' => ['5876543210', null],
            'too short' => ['98765', null],
            '+91 that is not a mobile' => ['+91 33 2345 6789', null],
            'letters' => ['call me', null],
            'a plus and a zero' => ['+0 1234 567890', null],
            'blank' => ['', null],
            'null' => [null, null],
        ];
    }

    #[DataProvider('numbers')]
    public function test_e164(?string $raw, ?string $expected): void
    {
        $this->assertSame($expected, Phone::e164($raw));
    }

    public function test_digits_and_masking(): void
    {
        $this->assertSame('919876543210', Phone::digits('+919876543210'));
        $this->assertSame('+9198•••••210', Phone::masked('+919876543210'));
    }
}
