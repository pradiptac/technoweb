<?php

namespace App\Support\Writing\Surfaces;

use App\Models\User;
use App\Support\HtmlSanitiser;
use App\Support\Mail\MessageCatalogue;
use App\Support\Writing\Outline;
use App\Support\Writing\Prepared;
use App\Support\Writing\Surface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingRefused;

/** A system email's subject or body; its placeholders are the catalogue's and no others. */
final class EmailTemplateSurface implements Surface
{
    public function key(): string
    {
        return 'email_template';
    }

    public function authorise(User $user, WritingInput $input): bool
    {
        return $user->isAdmin();
    }

    public function prepare(WritingInput $input): Prepared
    {
        $entry = MessageCatalogue::get((string) ($input->ref['key'] ?? ''));
        if ($entry === null) {
            throw new WritingRefused('That email is not in the catalogue.', 404);
        }
        if ($entry['locked']) {
            throw new WritingRefused('This message carries a sign-in credential, so its wording is not rewritten by machine.');
        }
        $allowed = array_keys($entry['variables'] ?? []);
        $context = [
            'This email: '.$entry['label'].' — '.$entry['description'],
            'Placeholders it may use: '.implode(', ', array_map(fn ($v) => '{{'.$v.'}}', $allowed)),
        ];
        $state = ['allowed' => $allowed, 'field' => ($input->ref['field'] ?? 'body') === 'subject' ? 'subject' : 'body'];

        if ($state['field'] === 'subject') {
            return new Prepared(trim(strip_tags($input->text)), $context, '{"text": "the subject line, at most 200 characters"}', 300, $state);
        }
        $outline = Outline::fromHtml($input->text, true);

        return new Prepared($outline->toPrompt(), $context, '{"lines": [{"kind": "h2|h3|p|ul|ol|quote|locked", "text": "…"}]}', 3000, $state + ['outline' => $outline]);
    }

    public function rebuild(array $answer, Prepared $prepared, WritingInput $input): string
    {
        $subject = $prepared->state['field'] === 'subject';
        $lines = array_values(array_filter((array) ($answer['lines'] ?? []), 'is_array'));

        // Outline::rebuild strips a placeholder it was not given, so an invented one is looked for in the raw answer.
        $raw = $subject ? Writer::text($answer['text'] ?? null) : implode("\n", array_map(fn ($l) => is_string($l['text'] ?? null) ? $l['text'] : '', $lines));
        foreach (Outline::placeholdersIn($raw) as $name) {
            if (! in_array($name, $prepared->state['allowed'], true)) {
                throw new WritingRefused('The assistant used {{'.$name.'}}, which this email does not offer. Try again.');
            }
        }
        if (! $subject) {
            return HtmlSanitiser::clean(Outline::rebuild($lines, $prepared->state['outline']));
        }

        $out = SummarySurface::cut(trim(strip_tags($raw)), 200);
        $found = Outline::placeholdersIn($out);
        foreach (Outline::placeholdersIn($input->text) as $name) {
            if (! in_array($name, $found, true)) {
                throw new WritingRefused('The assistant dropped the {{'.$name.'}} placeholder. Try again.');
            }
        }

        return $out;
    }
}
