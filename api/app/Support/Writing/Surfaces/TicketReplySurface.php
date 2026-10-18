<?php

namespace App\Support\Writing\Surfaces;

use App\Enums\Role;
use App\Enums\TicketStatus;
use App\Models\KnowledgeArticle;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use App\Support\HtmlSanitiser;
use App\Support\Search\Semantic;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingRefused;

/**
 * A reply on a ticket, drafted from what the customer can already see and the
 * published knowledge base — never an internal note, a sensitive message, an
 * attachment or a sensitive ticket's description, and with every address and
 * number masked (docs/ai-writing.md).
 */
final class TicketReplySurface implements Surface
{
    public const MAX = 5000;

    public const MESSAGES = 12;

    public function key(): string
    {
        return 'ticket_reply';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return $user->isAdmin() || $user->hasRole(Role::SupportEngineer);
    }

    public function prepare(WritingInput $input): Prepared
    {
        $ticket = Ticket::query()->where('reference', (string) ($input->ref['reference'] ?? ''))->first();
        if ($ticket === null) {
            throw new WritingRefused('That ticket is not there.', 404);
        }
        if ($ticket->merged_into_id !== null || $ticket->status === TicketStatus::Closed) {
            throw new WritingRefused('This ticket is closed, so there is nothing to reply to.');
        }

        $context = ['Ticket subject: '.self::mask((string) $ticket->subject)];
        if (! $ticket->is_sensitive && filled($ticket->description)) {
            $context[] = 'The customer wrote: '.self::mask(mb_substr(HtmlSanitiser::toText((string) $ticket->description), 0, 2000));
        }

        // publicMessages() drops internal notes; sensitive ones are skipped below, and no attachment is ever read.
        $messages = $ticket->publicMessages()->with('author')->reorder()->latest('id')->limit(self::MESSAGES)->get()
            ->reject(fn (TicketMessage $m) => $m->is_sensitive)->reverse()->values();
        foreach ($messages as $m) {
            $who = $m->authorIsCustomer() ? 'Customer' : 'Our engineer';
            $context[] = $who.': '.self::mask(mb_substr(HtmlSanitiser::toText((string) $m->body), 0, 1500));
        }

        $last = $messages->last();
        $sources = $this->sources($ticket, $last !== null ? (string) $last->body : '');
        foreach ($sources as $n => $s) {
            $context[] = "[S{$n}] {$s['title']}: {$s['excerpt']}";
        }

        return new Prepared(
            content: self::mask(trim(strip_tags($input->text))),
            context: $context,
            shape: '{"text": "the reply to send, plain text, no markup, at most '.self::MAX.' characters; cite a knowledge-base source as [S1] only where it helps; never promise a refund, a date, a price or a visit — write [CHECK: …] there instead"}',
            maxTokens: 1500,
            state: ['sources' => $sources],
        );
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $text = trim(strip_tags(Writer::text($answer['text'] ?? null)));
        $sources = $prepared->state['sources'];
        $text = preg_replace_callback('/\[S(\d+)\]/', function (array $m) use ($sources) {
            $s = $sources[(int) $m[1]] ?? null;

            return $s === null ? '' : $s['title'].' ('.$s['url'].')';
        }, $text) ?? $text;

        return SummarySurface::cut(trim(preg_replace('/[ \t]+/', ' ', $text) ?? $text), self::MAX);
    }

    public static function mask(string $text): string
    {
        $text = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[email]', $text) ?? $text;

        // Phone shapes only: +country runs, Indian mobiles, STD landlines, or 10+ bare digits. Never
        // inside a token (TW-2026-00007, v7.2.1, 192.168.1.10, 2026-10-18, 10:30): not after a letter,
        // digit, dot or hyphen, and not before one.
        // shortcut: a short extension or a landline with no area code is left alone, tighten if a desk needs it.
        return preg_replace(
            '/(?<![\w.\-])(?:\+\d{1,3}(?:[\s-]?\d){8,12}|(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}|0\d{2,4}(?:[\s-]?\d){6,8}|\d{10,})(?![\w]|[.\-]\d)/',
            '[phone]',
            $text,
        ) ?? $text;
    }

    /** @return array<int, array{title: string, excerpt: string, url: string}> */
    private function sources(Ticket $ticket, string $last): array
    {
        // This phrase goes to the embeddings endpoint, so it is masked and cut like everything else that leaves.
        // Masked before it is cut: a cut through an address or a number would leave the fragment unmasked.
        $subject = mb_substr(self::mask((string) $ticket->subject), 0, 100);
        $phrase = trim($subject.' '.mb_substr(self::mask(HtmlSanitiser::toText($last)), 0, 600));
        $ids = [];
        foreach (Semantic::passages($phrase, ['knowledge_article'], 6) as $hit) {
            $ids[] = (int) $hit['subject_id'];
        }
        $query = KnowledgeArticle::query()->published();
        $articles = $ids !== []
            ? $query->whereKey(array_unique($ids))->get()->sortBy(fn (KnowledgeArticle $a) => array_search($a->id, $ids, true))
            : $query->search($subject)->limit(3)->get();

        $out = [];
        foreach ($articles->take(3)->values() as $i => $a) {
            $out[$i + 1] = [
                'title' => (string) $a->title,
                'excerpt' => mb_substr(HtmlSanitiser::toText((string) ($a->excerpt ?: $a->body)), 0, 600),
                'url' => rtrim((string) config('app.frontend_url'), '/').$a->publicPath(),
            ];
        }

        return $out;
    }
}
