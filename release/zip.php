<?php

/*
 * Pack a staged release folder into the zip a customer uploads.
 *
 *   php release/zip.php <source-dir> <out.zip> <root-name>
 *
 * PHP's ZipArchive rather than a Node dependency: every machine that builds a
 * release already has PHP (composer runs there), and the zip must extract
 * cleanly through cPanel's and Plesk's File Manager, which both read an
 * ordinary deflated zip with forward-slash paths — exactly what this writes on
 * Windows as well as Linux.
 *
 * Unix permissions are recorded (0644 files, 0755 folders and the two
 * executables) so an unzip on a shell keeps `artisan` runnable; File Manager
 * extractions ignore them, and nothing in the product relies on them.
 */

[$script, $source, $out, $root] = $argv + [null, null, null, null];

if ($source === null || $out === null || $root === null || ! is_dir($source)) {
    fwrite(STDERR, "usage: php release/zip.php <source-dir> <out.zip> <root-name>\n");
    exit(2);
}

$source = rtrim(str_replace('\\', '/', realpath($source)), '/');
@unlink($out);

$zip = new ZipArchive;

if ($zip->open($out, ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
    fwrite(STDERR, "cannot create {$out}\n");
    exit(1);
}

$executables = ['api/artisan'];
$count = 0;

/*
 * Every entry carries the same modified time, safely in the past.
 *
 * A zip stores a file's time as plain local time with no time zone. Built in
 * India (UTC+5:30) and extracted on a server in UTC, every file read as hours
 * *ahead* of the server's clock — and Next takes a prerendered page's age
 * from its file's modified time (`lastModified: mtime`), so all thirty-one
 * pages the build ships looked newer than now. They never went stale on their
 * five-minute schedule and the setup wizard's purge, which only expires pages
 * older than itself, expired none of them: a fresh Plesk install kept the
 * build's error-state pages, in the default theme, for hours after the site
 * was configured (2026-09-30). A date this old is in the past in every zone
 * (the spread is 26 hours), and a page that reads as old is simply refreshed
 * on its first request, which is exactly what a first visit should do.
 */
$mtime = gmmktime(12, 0, 0, 1, 1, 2020);

$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST,
);

foreach ($it as $file) {
    $path = str_replace('\\', '/', $file->getPathname());
    $rel = substr($path, strlen($source) + 1);
    $name = $root.'/'.$rel;

    if ($file->isDir()) {
        $zip->addEmptyDir($name);
        $zip->setMtimeName($name.'/', $mtime);
        $zip->setExternalAttributesName($name.'/', ZipArchive::OPSYS_UNIX, (040755 << 16));

        continue;
    }

    $zip->addFile($path, $name);
    $zip->setMtimeName($name, $mtime);
    $zip->setCompressionName($name, ZipArchive::CM_DEFLATE);
    $mode = in_array($rel, $executables, true) ? 0100755 : 0100644;
    $zip->setExternalAttributesName($name, ZipArchive::OPSYS_UNIX, ($mode << 16));
    $count++;
}

if (! $zip->close()) {
    fwrite(STDERR, "writing {$out} failed\n");
    exit(1);
}

echo "{$count} files -> {$out}\n";
