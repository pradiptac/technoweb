<?php

namespace App\Support\Net;

use RuntimeException;

/** A URL, or a hop it redirected to, that this server will not request. The message says why, for a person. */
class UnsafeUrl extends RuntimeException {}
