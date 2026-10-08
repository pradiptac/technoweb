<?php

/*
 * The downloads centre (docs/downloads.md).
 *
 * `max_upload_kb` is the largest file an editor may upload to a download —
 * half a gigabyte by default, since a firmware image is not a photograph.
 * php.ini's `upload_max_filesize` and `post_max_size` still have the last
 * word: the limit in force is the smallest of the three
 * (`DownloadFiles::maxKb()`), and the console shows that figure.
 */
return [
    'max_upload_kb' => (int) env('DOWNLOADS_MAX_UPLOAD_KB', 524288),
];
