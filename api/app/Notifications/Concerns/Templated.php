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
 * stays here rather than being moved into a registry: moving 25 sets of
 * wording is how a refactor silently rewords every email in the product.
 *
 * **`shouldSend()` is on the trait, not on the classes.** Laravel's sender and
 * its fake both ask it before delivering, so one method here switches every
 * templated message off through the console — and it is asked at delivery,
 * so a queued receipt reads the switch when the job runs rather than when the
 * order was placed. It is also deliberately not on each class:
 * `MailTemplateTest` slices every notification's source between
 * `templateData(` and `defaultMail(` to check its placeholders, and a method
 * landing between the two would end up inside that slice.
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

    /**
     * Whether this message goes at all — an editor's decision, per message.
     *
     * `false` and the channel is skipped: nothing is sent, nothing is logged,
     * nothing fails, which is what "switched off" means. The console refuses to
     * switch off the three that carry a credential somebody is waiting for.
     */
    public function shouldSend(object $notifiable, string $channel): bool
    {
        return Templates::sends($this->templateKey());
    }

    public function toMail(object $notifiable): MailMessage
    {
        return Templates::apply(
            $this->defaultMail($notifiable),
            $this->templateKey(),
            // Deferred: an uncustomised message must not pay to assemble
            // values that nothing is going to read, and most are uncustomised
            // on a fresh install.
            fn (): array => $this->templateData($notifiable),
        );
    }
}
