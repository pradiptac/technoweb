<?php

namespace App\Support\Store\Zoho;

/**
 * The state list moved to `App\Support\IndianStates` in 0.142.0, when shipping
 * zones became its second reader. Kept as a subclass so an import of the old
 * name still works; new code uses the new one.
 */
final class IndianStates extends \App\Support\IndianStates {}
