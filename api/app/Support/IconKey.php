<?php

namespace App\Support;

/**
 * The shape of a stored icon key (0.179.0, docs/icons.md): a name registered
 * in the frontend's `iconMap` (`shield`), or a Google icon — `ms:` and a
 * Material Symbols name (`ms:router`).
 *
 * Only the shape is checked here. Which names exist is the website's to know,
 * the rule `iconMap` keys have always followed: an unknown one draws nothing
 * rather than failing a save, so a key can outlive the icon it named. Every
 * icon column is `varchar(40)`, so `ms:` leaves 37 characters for the name.
 */
final class IconKey
{
    public const PATTERN = '/^(?:ms:[a-z0-9_]{1,37}|[a-z0-9-]{1,40})$/';

    public const RULE = 'regex:'.self::PATTERN;
}
