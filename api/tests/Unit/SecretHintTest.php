<?php

namespace Tests\Unit;

use App\Support\SecretHint;
use PHPUnit\Framework\TestCase;

class SecretHintTest extends TestCase
{
    public function test_first_eight_and_last_two(): void
    {
        $this->assertSame('sk-or-v1…a7', SecretHint::for('openrouter_api_key', 'sk-or-v1-0123456789abcdefa7'));
        $this->assertSame('sk-or-v1…a7', SecretHint::for('openrouter_api_key', "  sk-or-v1-0123456789abcdefa7 \n"));
    }

    public function test_multibyte_is_cut_by_character(): void
    {
        $this->assertSame(str_repeat('é', 8).'…éé', SecretHint::for('x_api_key', str_repeat('é', 25)));
    }

    public function test_nothing_for_unsuitable_values(): void
    {
        $long = 'sk-or-v1-0123456789abcdefa7';

        $this->assertNull(SecretHint::for('x_api_key', null));
        $this->assertNull(SecretHint::for('x_api_key', 'short-key-1234567'));
        $this->assertNull(SecretHint::for('x_api_key', "line-one-aaaaaaaaaa\nline-two-bbbbbbbbbb"));
        $this->assertNull(SecretHint::for('smtp_password', $long));
        $this->assertNull(SecretHint::for('gsc_service_account', $long));
        $this->assertNull(SecretHint::for('backup_ftp_private_key', $long));
        $this->assertNull(SecretHint::for('oauth_refresh_token', $long));
        $this->assertNull(SecretHint::for('oauth_access_token', $long));
    }
}
