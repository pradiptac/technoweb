<?php

namespace App\Support\Images;

use RuntimeException;

/**
 * One sentence for the editor; the log carries the provider's own words.
 * `detail` holds those words for the administrator's model test alone.
 */
final class ImageRefused extends RuntimeException
{
    public ?string $detail = null;
}
