<?php

namespace App\Support\InboundMail;

use App\Enums\CustomerStatus;
use App\Enums\InboundMailProvider;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\InboundEmail;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use App\Support\HtmlSanitiser;
use App\Support\Notifier;
use App\Support\Tickets\AttachmentStore;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Turns the support mailbox into tickets.
 *
 * Everything here mirrors what the portal does when a customer presses
 * Submit or Reply — the same `create()` on the customer's tickets, the same
 * `logEvent`, the same two notifications, the same pending→in-progress
 * move on a reply — so that a ticket opened by email is indistinguishable
 * from one opened in the portal to everything downstream. The differences
 * are the ones an email forces: the sender has to be found or made, the
 * body has to be read out of MIME, and the same message may arrive twice.
 *
 * The last is settled by the ledger. Every message is written to
 * `inbound_emails` *first*, under a unique Message-ID index: a redelivery
 * hits the index and is marked processed without a second ticket or a
 * second acknowledgement. The mailbox flag or move is the *convenience*
 * that stops the next run re-reading the message; the index is the
 * guarantee. The one gap — a run dying between that row and the ticket —
 * is closed by taking over a `processing` row nobody has touched for ten
 * minutes, which is the worse of two failures only if a ticket opened
 * twice is worse than a complaint opened never.
 *
 * Nothing here throws out to the caller. A mailbox that refuses us writes
 * `inbound_mail_error` and the run reports it; a single message that fails
 * is recorded as such and marked processed, because a poison message
 * retried every minute is a mailbox that never gets past it.
 */
final class TicketPiper
{
    /** A `processing` row older than this was left by a run that died mid-message. */
    private const ABANDONED_MINUTES = 10;

    public function __construct(private readonly Mailbox $mailbox) {}

    public function run(int $limit = InboundMail::BATCH): Tally
    {
        if (! InboundMail::enabled()) {
            return Tally::disabled();
        }

        try {
            $messages = $this->mailbox->unseen($limit);
        } catch (Throwable $e) {
            InboundMail::fail($e->getMessage());
            Log::warning('The support mailbox refused us', ['error' => $e->getMessage()]);

            return Tally::refused($e->getMessage());
        }

        $tally = new Tally(ran: true);
        $own = InboundMail::ownAddresses();
        $staff = User::query()->pluck('email')->map(fn ($e) => strtolower((string) $e))->all();

        foreach ($messages as $message) {
            $this->handle($message, $own, $staff, $tally);
        }

        InboundMail::touchLastRun();

        if ($tally->failed === 0) {
            InboundMail::clearError();
        }

        return $tally;
    }

    /**
     * One message, start to finish. Returns the ledger row — an existing one
     * when the message had been seen before.
     *
     * @param  list<string>  $ownAddresses
     * @param  list<string>  $staffAddresses
     */
    public function handle(IncomingMessage $m, array $ownAddresses = [], array $staffAddresses = [], ?Tally $tally = null): InboundEmail
    {
        $key = $m->dedupeKey();
        $tally ??= new Tally(ran: true);

        try {
            $row = InboundEmail::create([
                'message_id' => $key,
                'provider' => (InboundMail::provider() ?? InboundMailProvider::Imap)->value,
                'uid' => ctype_digit($m->id) ? (int) $m->id : null,
                'from_email' => Str::limit(strtolower(trim($m->fromEmail)), 250, ''),
                'from_name' => $m->fromName !== null ? Str::limit(trim($m->fromName), 250, '') : null,
                'subject' => Str::limit(trim($m->subject), 250, '…'),
                'in_reply_to' => $m->inReplyTo !== null ? Str::limit(trim($m->inReplyTo, " <>\t"), 250, '') : null,
                'received_at' => $m->date,
                'outcome' => InboundEmail::PROCESSING,
            ]);
        } catch (UniqueConstraintViolationException) {
            /** @var InboundEmail $row */
            $row = InboundEmail::where('message_id', $key)->firstOrFail();

            // Seen before. Whatever was decided then stands, and all that is
            // left is to make sure the mailbox stops offering it — unless
            // the earlier run died between writing this row and writing the
            // ticket, in which case the row is the only trace of a message
            // nobody has read. A `processing` row that old is taken over.
            $abandoned = $row->outcome === InboundEmail::PROCESSING
                && $row->updated_at !== null
                && $row->updated_at->lt(now()->subMinutes(self::ABANDONED_MINUTES));

            if (! $abandoned) {
                $this->markProcessed($m);
                $tally->count('duplicate');

                return $row;
            }

            $row->touch();
        }

        $skip = MailFilter::reason($m, $ownAddresses, $staffAddresses);

        if ($skip !== null) {
            $row->update(['outcome' => InboundEmail::skipped($skip)]);
            $this->markProcessed($m);
            $tally->count($row->outcome);

            return $row;
        }

        try {
            $this->pipe($m, $row);
        } catch (Throwable $e) {
            $row->update(['outcome' => InboundEmail::FAILED, 'reason' => Str::limit($e->getMessage(), 490, '…')]);
            InboundMail::fail("{$m->fromEmail}: {$e->getMessage()}");
            Log::warning('An email could not be turned into a ticket', [
                'from' => $m->fromEmail, 'subject' => $m->subject, 'error' => $e->getMessage(),
            ]);
        }

        $this->markProcessed($m);
        $row->refresh();
        $tally->count($row->outcome);

        return $row;
    }

    /** The decision, the write, and the two things sent afterwards. */
    private function pipe(IncomingMessage $m, InboundEmail $row): void
    {
        $from = strtolower(trim($m->fromEmail));
        $reference = ReplyParser::reference($m->subject);
        $existing = $reference !== null ? Ticket::with('customer')->where('reference', $reference)->first() : null;

        // A reference the desk has merged away is followed to where the
        // conversation went — to the end of the chain, since a target can be
        // merged in its turn — before the "sender's own open ticket" rule
        // below is applied. The customer's last email still quotes the old
        // reference, and the alternative is a follow-up ticket to a closed
        // ticket that was closed precisely so there would be one thread.
        for ($hops = 0; $existing?->merged_into_id !== null && $hops < 10; $hops++) {
            $existing = Ticket::with('customer')->find($existing->merged_into_id);
        }

        $subject = $m->subject;
        $prefix = '';

        // A reply on the sender's own open ticket threads onto it. Anything
        // else — a closed ticket, or somebody else's reference — opens a new
        // ticket for the sender, with the old reference stripped so the new
        // ticket's notifications carry one reference and not two. Nothing
        // about the referenced ticket is disclosed either way.
        if ($existing !== null && $this->belongsTo($existing, $from)) {
            if ($existing->status !== TicketStatus::Closed) {
                $this->reply($existing, $m, $row);

                return;
            }

            $prefix = "Follow-up to {$existing->reference}, which is closed.\n\n";
            $subject = ReplyParser::withoutReference($subject);
        } elseif ($existing !== null) {
            $subject = ReplyParser::withoutReference($subject);
        }

        $customer = $this->customer($m, $from);

        if ($customer === null) {
            $row->update(['outcome' => InboundEmail::skipped('unknown_sender')]);

            return;
        }

        $this->open($customer, $m, $row, $subject, $prefix);
    }

    private function open(Customer $customer, IncomingMessage $m, InboundEmail $row, string $subject, string $prefix): void
    {
        $dropped = [];

        $ticket = DB::transaction(function () use ($customer, $m, $row, $subject, $prefix, &$dropped) {
            $ticket = $customer->tickets()->create([
                'subject' => $this->subject($subject),
                'description' => $prefix.$this->body($m, false),
                'ticket_category_id' => InboundMail::defaultCategoryId(),
                'priority' => InboundMail::defaultPriority(),
                'status' => TicketStatus::Open,
                'channel' => 'email',
            ]);

            $dropped = $this->attach($ticket, null, $m);

            if ($dropped !== []) {
                $ticket->update(['description' => $ticket->description.$this->droppedNote($dropped)]);
            }

            $ticket->logEvent('created', null, TicketStatus::Open->value);

            $row->update([
                'outcome' => InboundEmail::CREATED,
                'ticket_id' => $ticket->id,
                'reason' => $dropped !== [] ? 'Not stored: '.implode(', ', $dropped) : null,
            ]);

            return $ticket;
        });

        // Both sides are told, and neither send can fail the run — the
        // ticket is committed by this point. The acknowledgement is the
        // "auto reply with the ticket number" the mailbox exists for.
        $ticket->loadMissing(['category', 'customer']);
        Notifier::route('support_email', new TicketCreated($ticket));
        Notifier::send($customer, new TicketAcknowledged($ticket));
    }

    private function reply(Ticket $ticket, IncomingMessage $m, InboundEmail $row): void
    {
        $dropped = [];

        $message = DB::transaction(function () use ($ticket, $m, $row, &$dropped) {
            // associate() rather than a literal author_type — the morph map
            // stores "customer", and hard-coding the FQCN would bypass it.
            $message = $ticket->messages()->make([
                'body' => $this->body($m, true),
                'is_internal' => false,   // a customer can never write an internal note
                'channel' => 'email',
            ]);
            $message->author()->associate($ticket->customer);
            $message->save();

            $dropped = $this->attach($ticket, $message, $m);

            if ($dropped !== []) {
                $message->update(['body' => $message->body.$this->droppedNote($dropped)]);
            }

            // A customer reply on a pending ticket puts the ball back with us.
            if ($ticket->status === TicketStatus::PendingCustomer) {
                $ticket->update(['status' => TicketStatus::InProgress]);
                $ticket->logEvent('status_changed', TicketStatus::PendingCustomer->value, TicketStatus::InProgress->value);
            }

            $row->update([
                'outcome' => InboundEmail::REPLIED,
                'ticket_id' => $ticket->id,
                'ticket_message_id' => $message->id,
                'reason' => $dropped !== [] ? 'Not stored: '.implode(', ', $dropped) : null,
            ]);

            return $message;
        });

        // The desk hears about it; a customer reply is never internal, so
        // there is nothing to withhold. No acknowledgement for a reply — the
        // portal sends none either.
        $ticket->loadMissing(['category', 'customer']);
        Notifier::route('support_email', new TicketReplied($ticket, $message, toCustomer: false));
    }

    /**
     * The sender's account, found or made.
     *
     * Made in the shape `technoware:customer` makes one: active, verified,
     * approved, with a password nobody knows. The address proved itself by
     * sending — that is the same proof a sign-in code asks for — and the
     * approval queue exists for strangers filling in a form, not for
     * customers who have just written to the desk. They can sign in with a
     * code to the address they used.
     */
    private function customer(IncomingMessage $m, string $from): ?Customer
    {
        $customer = Customer::whereRaw('LOWER(email) = ?', [$from])->first();

        if ($customer !== null) {
            return $customer;
        }

        if (! InboundMail::createsUnknownSenders()) {
            return null;
        }

        $name = trim((string) $m->fromName);
        if ($name === '' || filter_var($name, FILTER_VALIDATE_EMAIL)) {
            $name = Str::of($m->fromLocalPart())->replace(['.', '_', '-'], ' ')->title()->toString();
        }

        $customer = Customer::create([
            'name' => Str::limit($name, 120, ''),
            'email' => $from,
            'password' => Str::password(24),
            'status' => CustomerStatus::Active,
        ]);

        $customer->forceFill([
            'email_verified_at' => now(),
            'approved_at' => now(),
        ])->save();

        return $customer;
    }

    private function belongsTo(Ticket $ticket, string $from): bool
    {
        return strtolower((string) $ticket->customer?->email) === $from;
    }

    /**
     * The words, as plain text: the text part when there is one, the HTML
     * part read down to text when there is not, quoted history cut off a
     * reply, and the portal's own ceiling applied.
     */
    private function body(IncomingMessage $m, bool $isReply): string
    {
        $text = trim((string) $m->text);

        if ($text === '' && filled($m->html)) {
            $text = trim(HtmlSanitiser::toText($m->html));
        }

        if ($isReply && $text !== '') {
            $text = ReplyParser::stripQuoted($text);
        }

        $text = str_replace("\r\n", "\n", $text);

        if ($text === '') {
            return $m->attachments !== [] ? '(No text — see the attachments.)' : '(No text.)';
        }

        if (mb_strlen($text) > InboundMail::MAX_BODY) {
            $text = mb_substr($text, 0, InboundMail::MAX_BODY)."\n\n[The message was longer than this and has been truncated.]";
        }

        return $text;
    }

    private function subject(string $subject): string
    {
        $subject = trim(preg_replace('/\s+/', ' ', $subject) ?? $subject);

        return $subject !== '' ? Str::limit($subject, 180, '…') : '(No subject)';
    }

    /**
     * Store what the portal would accept, and name what it would not.
     *
     * @return list<string> the files not stored, each with its reason
     */
    private function attach(Ticket $ticket, ?TicketMessage $message, IncomingMessage $m): array
    {
        $dropped = [];
        $stored = 0;

        foreach ($m->attachments as $file) {
            // A signature logo, or an image the HTML body places inline.
            if ($file->inline && $file->contentId !== null) {
                continue;
            }

            if ($stored >= AttachmentStore::MAX_FILES) {
                $dropped[] = "{$file->filename} (more than ".AttachmentStore::MAX_FILES.' files)';

                continue;
            }

            $why = AttachmentStore::accepts($file->filename, $file->size);

            if ($why !== null) {
                $dropped[] = "{$file->filename} ({$why})";

                continue;
            }

            // Only now are the bytes read: the size gate ran on the
            // metadata, so an oversize file never leaves the server.
            $contents = $file->contents();
            $why = AttachmentStore::accepts($file->filename, strlen($contents), AttachmentStore::sniff($contents));

            if ($why !== null) {
                $dropped[] = "{$file->filename} ({$why})";

                continue;
            }

            AttachmentStore::storeContents($ticket, $message, $file->filename, $contents);
            $stored++;
        }

        return $dropped;
    }

    /** @param  list<string>  $dropped */
    private function droppedNote(array $dropped): string
    {
        return "\n\n[Attachments not stored: ".implode(', ', $dropped).'. Tickets accept images, PDFs and plain text or log files up to '
            .AttachmentStore::maxKb().' KB.]';
    }

    private function markProcessed(IncomingMessage $m): void
    {
        try {
            $this->mailbox->markProcessed($m);
        } catch (Throwable $e) {
            // The ledger will catch the redelivery; the flag is a
            // convenience. Say so and carry on.
            Log::warning('Could not flag a processed email', ['id' => $m->id, 'error' => $e->getMessage()]);
        }
    }
}
