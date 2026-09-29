<?php

namespace App\Support\System;

/**
 * What a server needs to run the API, as checks a person can act on.
 *
 * Framework-free on purpose: the setup wizard (`public/install/`) requires
 * this file directly before Laravel can boot — there is no environment file
 * yet — and the console's System screen reads it through the autoloader
 * afterwards, so the two can never disagree about what "supported" means.
 * Only PHP's own functions are used here.
 */
final class Requirements
{
    public const PHP_MIN = '8.3.0';

    /**
     * Required extensions, each with the reason a person would want. `zip`
     * and `sodium` are the updater's: it unpacks the release and checks its
     * signature.
     */
    public const EXTENSIONS = [
        'pdo_mysql' => 'talks to the MySQL database',
        'mbstring' => 'handles text in every language',
        'openssl' => 'encrypts stored secrets and talks to https services',
        'curl' => 'talks to mail, payment and backup services',
        'fileinfo' => 'checks what an uploaded file really is',
        'gd' => 'resizes and crops images',
        'intl' => 'formats dates, numbers and currency',
        'zip' => 'reads spreadsheets and unpacks updates',
        'sodium' => 'checks that an update really came from the publisher',
        'dom' => 'reads SVG images and sanitises content',
        'tokenizer' => 'is needed by the framework',
        'ctype' => 'is needed by the framework',
    ];

    /**
     * @return list<array{key: string, label: string, ok: bool, required: bool, detail: string}>
     */
    public static function check(): array
    {
        $checks = [[
            'key' => 'php',
            'label' => 'PHP '.self::PHP_MIN.' or newer',
            'ok' => version_compare(PHP_VERSION, self::PHP_MIN, '>='),
            'required' => true,
            'detail' => 'This server runs PHP '.PHP_VERSION.'. Choose PHP 8.3 or newer for this domain in the hosting panel.',
        ]];

        foreach (self::EXTENSIONS as $ext => $why) {
            $checks[] = [
                'key' => 'ext-'.$ext,
                'label' => "The {$ext} extension",
                'ok' => extension_loaded($ext),
                'required' => true,
                'detail' => "It {$why}. Switch it on under the domain's PHP settings (cPanel: \"Select PHP Version\" → Extensions).",
            ];
        }

        $checks[] = [
            'key' => 'opcache',
            'label' => 'OPcache switched on',
            'ok' => function_exists('opcache_get_status') && (bool) ini_get('opcache.enable'),
            'required' => false,
            'detail' => 'Without it every request is several times slower. Switch on "opcache" in the domain\'s PHP settings.',
        ];

        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));

        $checks[] = [
            'key' => 'symlink',
            'label' => 'Symbolic links allowed',
            'ok' => function_exists('symlink') && ! in_array('symlink', $disabled, true),
            'required' => true,
            'detail' => 'Uploaded images are published through one link inside the API folder. Ask the host to allow PHP\'s symlink() function.',
        ];

        return $checks;
    }

    /** Whether every required check passes. */
    public static function satisfied(): bool
    {
        foreach (self::check() as $check) {
            if ($check['required'] && ! $check['ok']) {
                return false;
            }
        }

        return true;
    }
}
