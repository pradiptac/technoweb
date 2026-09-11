<?php

namespace App\Notifications\Concerns;

use App\Support\Mail\Templates;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Lets an editor rewrite this message's subject and body.
 *
 * A notification using this keeps its own copy in `defaultMail()` — unchanged,
 * every line of it — and gains two small methods saying what it is called and
 * what this send knows. The built-in is still what goes out when nobody has
 * customised the message, which is the ordinary state and the reason the copy
 * stays here rather than being moved into a registry: moving 22 sets of
 * wording is how a refactor silently rewords every email in the product.
 *
 * `templateKey()` is an instance method rather than a constant because
 * **`TicketReplied` is two messages**. Its customer and desk versions differ in
 * greeting, action label and recipient, and one template cannot say both
 * without lying about one of them — so it returns one key or the other.
 */
trait Templated
{
    /** The message as it ships. Never touched by the template layer. */
    abstract protected function defaultMail(object $notifiable): MailMessage;

    /** Which entry in `MessageCatalogue` this is. */
    abstract public function templateKey(): string;

    /**
     * What this particular send knows, keyed by placeholder name.
     *
     * @return array<string, string>
     */
    abstract protected function templateData(object $notifiable): array;

    public function toMail(object $notifiable): MailMessage
    {
        return Templates::apply(
            $this->defaultMail($notifiable),
            $this->templateKey(),
            // Deferred: an uncustomised message must not pay to assemble
            // values that nothing is going to read, and 22 of 23 are
            // uncustomised on a fresh install.
            fn (): array => $this->templateData($notifiable),
        );
    }
}
