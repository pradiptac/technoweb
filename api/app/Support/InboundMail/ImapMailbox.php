<?php

namespace App\Support\InboundMail;

use Carbon\CarbonImmutable;
use RuntimeException;
use Throwable;
use Webklex\PHPIMAP\Address;
use Webklex\PHPIMAP\Attachment;
use Webklex\PHPIMAP\Attribute;
use Webklex\PHPIMAP\Client;
use Webklex\PHPIMAP\ClientManager;
use Webklex\PHPIMAP\EncodingAliases;
use Webklex\PHPIMAP\Folder;
use Webklex\PHPIMAP\Header;
use Webklex\PHPIMAP\Message;

/**
 * The real mailbox, over IMAP, through webklex/php-imap.
 *
 * Pure PHP — no `ext-imap`, which this server does not have — and the same
 * client for all three providers: a password for plain IMAP, an OAuth
 * access token as the password for Gmail and Microsoft 365 (XOAUTH2),
 * which is the only way either will let a program read a mailbox now.
 *
 * Its one job is to turn a webklex `Message` into an `IncomingMessage` and
 * to flag or move it afterwards; every decision is the piper's. It is not
 * unit-tested — an IMAP session cannot be faked usefully, the standing the
 * Google consent handshake has — and is exercised by the Check connection
 * button and by running the command against a real mailbox. Every
 * exception the library throws comes out as a `RuntimeException` carrying
 * the server's own words, which is what the panel shows.
 *
 * `move` mode reads *everything* in the folder rather than what is unread,
 * because in that mode the ledger is the memory and a message a person has
 * opened is still a complaint. `seen` mode reads unread mail and leaves it
 * unread until it has been handled.
 *
 * It is also the newsletter's `MailboxScanner` (2026-09-19): every folder,
 * headers only, nothing flagged or moved — the same session, the other
 * contract. `forScanning()` builds one from a connection alone, because a
 * scan's credentials never live in the settings.
 */
final class ImapMailbox implements Mailbox, MailboxScanner
{
    private ?Client $client = null;

    private ?Folder $folder = null;

    /** @var array<string, Message> the messages the last unseen() returned, by uid */
    private array $fetched = [];

    /**
     * @param  array{host: string, port: int, encryption: string, username: string, password: string, authentication: ?string, folder: string, move: bool, processed_folder: string}  $config
     */
    public function __construct(private readonly array $config) {}

    /**
     * A mailbox for reading headers, from a connection and nothing else.
     *
     * @param  array{host: string, port: int, encryption: string, username: string, password: string, authentication: ?string}  $connection
     */
    public static function forScanning(array $connection): self
    {
        return new self($connection + ['folder' => 'INBOX', 'move' => false, 'processed_folder' => 'Processed']);
    }

    public function account(): string
    {
        return (string) $this->config['username'];
    }

    public function folders(): array
    {
        try {
            $client = $this->client();
            $listed = $client->getConnection()->folders('', '*')->validatedData();
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }

        $out = [];

        foreach (is_array($listed) ? $listed : [] as $path => $meta) {
            $path = (string) $path;
            $flags = array_values(array_map('strval', (array) ($meta['flags'] ?? [])));
            $delimiter = (string) ($meta['delimiter'] ?? '/');
            $noSelect = (bool) array_filter($flags, fn (string $f) => strcasecmp($f, '\\Noselect') === 0);

            // Folder names travel as modified UTF-7; the policy and the
            // screen want the words. The path stays as listed, since that is
            // what the server is asked for.
            $display = (string) EncodingAliases::convert($path, 'utf7-imap', 'utf-8');
            $segments = $delimiter !== '' ? explode($delimiter, $display) : [$display];

            $out[] = [
                'path' => $path,
                'name' => (string) end($segments),
                'messages' => $noSelect ? 0 : $this->countMessages($client, $path),
                'no_select' => $noSelect,
                'flags' => $flags,
            ];
        }

        return $out;
    }

    public function scanHeaders(string $folderPath, int $afterUid, int $chunk, ?CarbonImmutable $since, ?CarbonImmutable $until, callable $each): void
    {
        try {
            $client = $this->client();
            $folder = $client->getFolderByPath($folderPath, true, true) ?? $client->getFolderByName($folderPath, true);

            if ($folder === null) {
                throw new RuntimeException("The folder \"{$folderPath}\" is not in this mailbox any more.");
            }

            // One SEARCH names the set: the date window the server honours
            // (SINCE is inclusive, BEFORE exclusive — the day after `until`)
            // and everything past the cursor. Headers come `$chunk` UIDs a
            // FETCH, never a body.
            $query = $folder->query()->setFetchBody(false)->setFetchFlags(false)->setFetchOrderAsc();
            $query = $afterUid > 0 ? $query->whereUid(($afterUid + 1).':*') : $query->all();
            if ($since !== null) {
                $query = $query->whereSince($since->startOfDay());
            }
            if ($until !== null) {
                $query = $query->whereBefore($until->addDay()->startOfDay());
            }

            $uids = array_values(array_filter(array_map('intval', $query->search()->all()), fn (int $u) => $u > $afterUid));
            sort($uids);

            $connection = $client->getConnection();
            $config = $client->getConfig();

            foreach (array_chunk($uids, max(1, $chunk)) as $batch) {
                $fetched = $connection->headers($batch)->validatedData();

                foreach ($batch as $uid) {
                    $raw = is_array($fetched) ? ($fetched[$uid] ?? null) : null;

                    if (! is_string($raw) || $raw === '') {
                        continue;
                    }

                    $row = $this->headerRow($uid, new Header($raw, $config));

                    if ($each($row) === false) {
                        return;
                    }
                }
            }
        } catch (RuntimeException $e) {
            // Ours — the missing-folder sentence — already in plain words.
            throw $e;
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }
    }

    public function unseen(int $limit): iterable
    {
        $folder = $this->openFolder();

        $query = $this->config['move'] ? $folder->query()->all() : $folder->query()->unseen();

        try {
            $messages = $query->leaveUnread()->setFetchOrderAsc()->limit($limit)->get();
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }

        $this->fetched = [];
        $out = [];

        foreach ($messages as $message) {
            /** @var Message $message */
            $uid = (string) $message->getUid();
            $this->fetched[$uid] = $message;
            $out[] = $this->convert($message, $uid);
        }

        return $out;
    }

    public function markProcessed(IncomingMessage $message): void
    {
        $webklex = $this->fetched[$message->id] ?? null;

        if ($webklex === null) {
            return;
        }

        try {
            if ($this->config['move']) {
                $this->ensureFolder($this->config['processed_folder']);
                $webklex->move($this->config['processed_folder']);
            } else {
                $webklex->setFlag('Seen');
            }
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }
    }

    public function probe(): array
    {
        $folder = $this->openFolder();

        try {
            $unseen = $folder->query()->unseen()->count();
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }

        return [
            'account' => (string) $this->config['username'],
            'folder' => (string) $this->config['folder'],
            'unseen' => $unseen,
        ];
    }

    /* ---------------------------------------------------------------- inside */

    private function openFolder(): Folder
    {
        if ($this->folder !== null) {
            return $this->folder;
        }

        try {
            $client = $this->client();
            $folder = $client->getFolderByPath($this->config['folder'], false, true)
                ?? $client->getFolderByName($this->config['folder'], true);
        } catch (Throwable $e) {
            throw $this->wrap($e);
        }

        if ($folder === null) {
            throw new RuntimeException("The folder \"{$this->config['folder']}\" does not exist in this mailbox.");
        }

        return $this->folder = $folder;
    }

    private function client(): Client
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $encryption = match ($this->config['encryption']) {
            'ssl' => 'ssl',
            'tls' => 'tls',
            default => false,
        };

        $client = (new ClientManager)->make([
            'host' => $this->config['host'],
            'port' => (int) $this->config['port'],
            'protocol' => 'imap',
            'encryption' => $encryption,
            'validate_cert' => true,
            'username' => $this->config['username'],
            'password' => $this->config['password'],
            'authentication' => $this->config['authentication'],
            'timeout' => 30,
        ]);

        $client->connect();

        return $this->client = $client;
    }

    private function ensureFolder(string $path): void
    {
        $client = $this->client();

        if ($client->getFolderByPath($path, false, true) === null && $client->getFolderByName($path, true) === null) {
            $client->createFolder($path);
        }
    }

    private function convert(Message $message, string $uid): IncomingMessage
    {
        $header = $message->getHeader();
        $attributes = $header?->getAttributes() ?? [];

        $headers = [];
        foreach ($attributes as $name => $attribute) {
            $first = $attribute instanceof Attribute ? $attribute->first() : $attribute;
            if (is_scalar($first)) {
                $headers[str_replace('_', '-', strtolower((string) $name))] = (string) $first;
            }
        }

        $from = $this->firstAddress($attributes['from'] ?? null);
        $date = $this->date($attributes['date'] ?? null);

        $text = $message->hasTextBody() ? $message->getTextBody() : null;
        $html = $message->hasHTMLBody() ? $message->getHTMLBody() : null;

        $references = $this->strings($attributes['references'] ?? null);

        return new IncomingMessage(
            id: $uid,
            messageId: $this->string($attributes['message_id'] ?? null),
            fromEmail: $from !== null ? $from->mail : '',
            fromName: filled($from?->personal) ? trim((string) $from->personal) : null,
            subject: $this->string($attributes['subject'] ?? null) ?? '',
            text: $text,
            html: $html,
            headers: $headers,
            date: $date,
            attachments: $this->attachments($message),
            to: $this->addresses($attributes['to'] ?? null),
            cc: $this->addresses($attributes['cc'] ?? null),
            inReplyTo: $this->string($attributes['in_reply_to'] ?? null),
            references: $references,
            returnPath: $this->string($attributes['return_path'] ?? null),
            contentType: $this->string($attributes['content_type'] ?? null),
        );
    }

    /** STATUS (MESSAGES), or EXAMINE's EXISTS, or -1 when the server will not say. */
    private function countMessages(Client $client, string $path): int
    {
        try {
            $status = $client->getConnection()->folderStatus($path, ['MESSAGES'])->validatedData();
            if (is_array($status) && isset($status['messages'])) {
                return (int) $status['messages'];
            }
        } catch (Throwable) {
            // Fall through to EXAMINE.
        }

        try {
            $examined = $client->getConnection()->examineFolder($path)->validatedData();

            return is_array($examined) && isset($examined['exists']) ? (int) $examined['exists'] : -1;
        } catch (Throwable) {
            return -1;
        }
    }

    private function headerRow(int $uid, Header $header): HeaderRow
    {
        $attributes = $header->getAttributes();

        return new HeaderRow(
            uid: $uid,
            messageId: $this->string($attributes['message_id'] ?? null),
            from: $this->mailAddresses($attributes['from'] ?? null)[0] ?? null,
            to: $this->mailAddresses($attributes['to'] ?? null),
            cc: $this->mailAddresses($attributes['cc'] ?? null),
            date: $this->date($attributes['date'] ?? null),
        );
    }

    /** @return list<MailAddress> */
    private function mailAddresses(mixed $attribute): array
    {
        if (! $attribute instanceof Attribute) {
            return [];
        }

        $out = [];
        foreach ($attribute->all() as $address) {
            if ($address instanceof Address && $address->mail !== '') {
                $name = trim((string) $address->personal);
                $out[] = new MailAddress(strtolower(trim($address->mail)), $name !== '' ? $name : null);
            }
        }

        return $out;
    }

    /** @return list<IncomingAttachment> */
    private function attachments(Message $message): array
    {
        $out = [];

        foreach ($message->getAttachments() as $attachment) {
            /** @var Attachment $attachment */
            $name = (string) ($attachment->name ?? $attachment->filename ?? 'attachment');
            $content = (string) ($attachment->content ?? '');
            $disposition = strtolower((string) ($attachment->disposition ?? ''));
            $contentId = $attachment->id ?? null;

            $out[] = new IncomingAttachment(
                filename: $name,
                mime: $attachment->content_type ?? null,
                size: (int) ($attachment->size ?? strlen($content)),
                inline: $disposition === 'inline',
                contentId: is_string($contentId) && $contentId !== '' ? trim($contentId, '<>') : null,
                contents: fn () => $content,
            );
        }

        return $out;
    }

    private function firstAddress(mixed $attribute): ?Address
    {
        $first = $attribute instanceof Attribute ? $attribute->first() : $attribute;

        return $first instanceof Address ? $first : null;
    }

    /** @return list<string> */
    private function addresses(mixed $attribute): array
    {
        if (! $attribute instanceof Attribute) {
            return [];
        }

        $out = [];
        foreach ($attribute->all() as $address) {
            if ($address instanceof Address && $address->mail !== '') {
                $out[] = strtolower($address->mail);
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function strings(mixed $attribute): array
    {
        if (! $attribute instanceof Attribute) {
            return [];
        }

        return array_values(array_filter(array_map(
            fn ($v) => is_scalar($v) ? trim((string) $v) : '',
            $attribute->all(),
        ), fn ($v) => $v !== ''));
    }

    private function string(mixed $attribute): ?string
    {
        $first = $attribute instanceof Attribute ? $attribute->first() : $attribute;

        return is_scalar($first) && trim((string) $first) !== '' ? trim((string) $first) : null;
    }

    private function date(mixed $attribute): ?CarbonImmutable
    {
        try {
            $first = $attribute instanceof Attribute ? $attribute->first() : $attribute;

            return $first !== null ? CarbonImmutable::parse((string) $first) : null;
        } catch (Throwable) {
            return null;
        }
    }

    /** The server's own words, without the library's class name in front of them. */
    private function wrap(Throwable $e): RuntimeException
    {
        $message = trim($e->getMessage()) !== '' ? trim($e->getMessage()) : class_basename($e);

        return new RuntimeException($message, 0, $e);
    }
}
