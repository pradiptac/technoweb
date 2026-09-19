<?php

namespace App\Support\Tickets;

use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketMessage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The one rule for what may be attached to a ticket, and the one place a
 * file is written.
 *
 * Two doors in — a portal or console upload, and an email's attachment —
 * and they must agree: the extension list, the size ceiling, the private
 * disk, the hashed path. Until the mailbox existed the list lived in two
 * request classes as a string literal and the storage in a trait that took
 * an HTTP request; an email has neither. So the list is a constant the
 * requests build their rule from, and the write is a method both doors call.
 *
 * Deliberately narrow: no archives, no executables, no office macros. A
 * ticket attachment is a screenshot, a log or a datasheet. Attachments live
 * on the **private** disk and stream through an authorised controller —
 * never a public URL (CLAUDE.md).
 */
final class AttachmentStore
{
    /** @var list<string> */
    public const EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'log', 'csv'];

    public const MAX_FILES = 5;

    /**
     * What each extension's bytes are allowed to sniff as. A `.pdf` that is
     * really an executable is refused on the email side, where nothing
     * upstream has checked; the upload side has Laravel's `mimes:` rule for
     * the same job.
     *
     * @var array<string, list<string>>
     */
    private const MIMES = [
        'png' => ['image/png'],
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'gif' => ['image/gif'],
        'webp' => ['image/webp'],
        'pdf' => ['application/pdf'],
        'txt' => ['text/plain', 'text/x-log', 'application/octet-stream', 'text/csv'],
        'log' => ['text/plain', 'text/x-log', 'application/octet-stream'],
        'csv' => ['text/csv', 'text/plain', 'application/csv', 'application/octet-stream'],
    ];

    public static function maxKb(): int
    {
        return (int) config('support.attachment_max_kb', 10240);
    }

    public static function disk(): string
    {
        return (string) config('support.attachment_disk', 'local');
    }

    /** The `mimes:` rule the two request classes share. */
    public static function mimesRule(): string
    {
        return 'mimes:'.implode(',', self::EXTENSIONS);
    }

    /** An upload that has already passed validation. */
    public static function storeUpload(Ticket $ticket, ?TicketMessage $message, UploadedFile $file): TicketAttachment
    {
        // Private disk, hashed name — the original filename is metadata only,
        // so a crafted name cannot influence the stored path.
        $path = $file->store("tickets/{$ticket->id}", self::disk());

        return $ticket->attachments()->create([
            'ticket_message_id' => $message?->id,
            'disk' => self::disk(),
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ]);
    }

    /**
     * Bytes from somewhere that is not an HTTP request. Call accepts() first;
     * this stores what it is given.
     */
    public static function storeContents(Ticket $ticket, ?TicketMessage $message, string $filename, string $contents): TicketAttachment
    {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $path = "tickets/{$ticket->id}/".Str::random(40).($extension !== '' ? ".{$extension}" : '');

        Storage::disk(self::disk())->put($path, $contents);

        return $ticket->attachments()->create([
            'ticket_message_id' => $message?->id,
            'disk' => self::disk(),
            'path' => $path,
            'filename' => self::safeName($filename),
            'mime' => self::sniff($contents) ?? 'application/octet-stream',
            'size' => strlen($contents),
        ]);
    }

    /**
     * Why a file would be refused, or null when it would not.
     *
     * Size and extension are checked from the metadata, so a large file is
     * turned away before its bytes are read; the sniff runs only when the
     * caller has the bytes to offer.
     */
    public static function accepts(string $filename, int $size, ?string $sniffedMime = null): ?string
    {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        if (! in_array($extension, self::EXTENSIONS, true)) {
            return 'type';
        }

        if ($size > self::maxKb() * 1024) {
            return 'over '.self::maxMb().' MB';
        }

        if ($sniffedMime !== null && ! in_array(strtolower($sniffedMime), self::MIMES[$extension], true)) {
            return 'type';
        }

        return null;
    }

    public static function sniff(string $contents): ?string
    {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? finfo_buffer($finfo, $contents) : false;

        return is_string($mime) && $mime !== '' ? $mime : null;
    }

    /** A filename fit to show and to send back as a download name. */
    private static function safeName(string $filename): string
    {
        $name = trim(preg_replace('/[\x00-\x1f\x7f\/\\\\]+/', '', $filename) ?? '');

        return $name !== '' ? mb_substr($name, 0, 255) : 'attachment';
    }

    private static function maxMb(): string
    {
        return rtrim(rtrim(number_format(self::maxKb() / 1024, 1, '.', ''), '0'), '.');
    }
}
