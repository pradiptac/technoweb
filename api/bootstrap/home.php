<?php

/*
 * Where an installed copy keeps its state, or null on a development checkout.
 *
 * A release zip unpacks as `technoware/{api,web,config,storage,updates}`
 * (`MANUAL/02-install-plesk.md`): the code folders are replaced whole by an
 * update, so the environment file and everything Laravel writes live beside
 * them — `config/api.env` and `storage/` — where an update never reaches.
 * The marker is the environment file itself: the setup wizard writes it, and
 * a checkout of the repository has none, so a developer's `api/.env` and
 * `api/storage` are exactly where they always were.
 *
 * Plain PHP with no framework, because `public/index.php` asks before Laravel
 * has loaded — it has to find the maintenance file in the right storage.
 */

$home = dirname(__DIR__, 2);

return is_file($home.'/config/api.env') ? $home : null;
