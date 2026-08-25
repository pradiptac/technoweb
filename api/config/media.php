<?php

/*
 * Media library tuning. Same reasoning as config/support.php: kept out of the
 * database so a bad value cannot be saved through the admin UI and break
 * uploads.
 */
return [
    // Per-file limit for CMS images and documents, in kilobytes.
    'max_kb' => (int) env('MEDIA_MAX_KB', 5120),

    // Video gets its own, larger limit. A separate number rather than one
    // raised limit for everything: 20 MB is unremarkable for ten seconds of
    // 1080p and absurd for a JPEG, and a single cap high enough for the first
    // would stop catching the second.
    'max_video_kb' => (int) env('MEDIA_MAX_VIDEO_KB', 20480),

    // Disk holding media. Public by design — these are cover images, logos and
    // og:image targets meant to be fetched by browsers and crawlers. Ticket
    // attachments are the opposite case and live on the private disk.
    'disk' => env('MEDIA_DISK', 'public'),
];
