<?php

return [
    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        // Private. Ticket attachments live here and are only ever streamed
        // through an authorised controller.
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
        ],

        // Public. Product images, logos, media library.
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],
    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],
];
