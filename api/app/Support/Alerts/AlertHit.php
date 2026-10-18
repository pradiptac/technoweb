<?php

namespace App\Support\Alerts;

/**
 * One thing in trouble. `subject` is stable (`ticket:41`, `system`) — it is
 * what once-per-thing is keyed on. `line` names the record by reference only,
 * never a customer's contact details or words. `href` is a console path.
 */
final readonly class AlertHit
{
    public function __construct(public string $subject, public string $line, public string $href) {}
}
