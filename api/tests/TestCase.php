<?php

namespace Tests;

use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        /*
         * No test performs a DNS lookup. A name resolves to nothing unless
         * the test says otherwise, so a check that resolves a webhook's or a
         * mailbox's host is neither slow nor dependent on the network the
         * suite happens to run on.
         */
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => []);
    }
}
