<?php

/*
 * Support-desk tuning. Kept out of the database so a bad value cannot be saved
 * through the admin UI and break uploads.
 */
return [
    // Per-file limit for ticket attachments, in kilobytes.
    'attachment_max_kb' => (int) env('TICKET_ATTACHMENT_MAX_KB', 10240),

    // Disk holding ticket attachments. Must be private — attachments routinely
    // contain network diagrams, logs and occasionally credentials.
    'attachment_disk' => env('TICKET_ATTACHMENT_DISK', 'local'),

    // Default first-response target when neither category nor priority sets one.
    'default_sla_hours' => (int) env('SUPPORT_DEFAULT_SLA_HOURS', 8),
];
