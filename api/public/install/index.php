<?php

use Technoware\Install\Wizard;

/*
 * The setup wizard's front door. Everything it does is in api/install/,
 * outside the document root; this only hands the request over. After the
 * install it answers 404 (Wizard::handle), and it may then be deleted.
 */

require __DIR__.'/../../install/EnvFile.php';
require __DIR__.'/../../install/Wizard.php';

(new Wizard(dirname(__DIR__, 2)))->handle();
