<?php

namespace App\Support\Import;

use App\Support\WordPress\ImportMap;
use App\Support\WordPress\Report;

/**
 * What `Rendered\Parts` needs from whichever import is running it: the map
 * (to find a form, pricing block or gallery an earlier run made), the report
 * (to count them), the review's decisions and the address of the site being
 * read (so a link to it becomes a path here).
 *
 * `WordPress\Context` and `SiteImport\Context` implement it; `Parts` knows
 * neither.
 */
interface PartsHost
{
    public function map(): ImportMap;

    public function report(): Report;

    public function decision(string $key, mixed $default = null): mixed;

    /** The source site's address, scheme and host at least. */
    public function siteUrl(): string;
}
