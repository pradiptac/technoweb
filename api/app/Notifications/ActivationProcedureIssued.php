<?php

namespace App\Notifications;

use App\Models\Order;
use App\Notifications\Concerns\QueuedMail;
use App\Support\HtmlSanitiser;
use App\Support\Store\ActivationProcedure;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * How to use the licence, sent the moment the code exists.
 *
 * **It still does not contain the code**, and that is the whole reason this is a
 * separate message rather than a line added to the receipt. A licence key in an
 * inbox is a licence key in every mail server it passed through and in whatever
 * backs that inbox up — `OrderPaid` documents the rule and it does not bend
 * because the instructions have arrived. The code is revealed from the order
 * page, where the act is recorded; this points there.
 *
 * What it *can* carry is everything that is not secret: the steps, and the
 * vendor's own PDF. Those are the same for every buyer of that product, so
 * putting them in an email costs nothing and saves the support reply that
 * otherwise follows every digital order.
 *
 * **Sent when the codes are issued, not when the order is paid.** With manual
 * fulfilment those are different moments — sometimes days apart — and a message
 * explaining how to activate a licence nobody has issued yet is a message that
 * generates the enquiry it was written to prevent.
 *
 * **A missing PDF is skipped, never thrown on.** The money has arrived and the
 * licence is issued; failing the whole notification because somebody tidied the
 * media library would lose the instructions as well as the attachment. Same
 * rule the campaign attachment follows.
 */
class ActivationProcedureIssued extends Notification implements ShouldQueue
{
    use QueuedMail;

    /**
     * @param  array<int, string>  $products  The lines this procedure covers.
     * @param  array{html: ?string, pdf_path: ?string, pdf_name: ?string, source: string}  $procedure
     */
    public function __construct(
        public Order $order,
        public array $products,
        public array $procedure,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $names = implode(', ', array_unique($this->products));

        $message = (new MailMessage)
            ->subject("How to activate your purchase — {$this->order->order_number}")
            ->greeting("Hello {$this->order->customer_name},")
            ->line("Your activation code for {$names} is ready.")
            /*
             * The code itself is deliberately absent, and the sentence says so
             * rather than leaving somebody hunting through the email for a key
             * that was never in it.
             */
            ->line('For your security the code is not included in this email. Open your order to reveal it — we record each time it is shown, which is what lets us help if it is ever disputed.')
            ->action('Open your order', $this->order->url());

        if ($this->procedure['html'] !== null) {
            $message->line('**Activation steps**');

            /*
             * As text, and deliberately not as HTML.
             *
             * A Laravel mail notification renders its lines through Markdown
             * and escapes them, so passing stored HTML here would show the
             * customer their own tags. `toText()` is the project's converter and
             * spaces **block** elements only — `strip_tags` runs the end of one
             * paragraph into the start of the next, which is how the downloads
             * page once published "…asked for.Remote support…" as its meta
             * description.
             *
             * The rich version is on the order page, which is linked above and
             * is where somebody activating a licence is going to be anyway.
             */
            foreach (self::paragraphs($this->procedure['html']) as $paragraph) {
                $message->line($paragraph);
            }
        }

        $file = ActivationProcedure::pdfFile($this->procedure['pdf_path']);

        if ($file !== null) {
            $message->attach($file, [
                // The stored filename is a hash. Without the human one this
                // lands in somebody's downloads folder as `a8f3c1….pdf`.
                'as' => $this->procedure['pdf_name'] ?? 'activation.pdf',
                'mime' => 'application/pdf',
            ]);

            $message->line('The full instructions are attached as a PDF.');
        }

        return $message->line('If anything does not work, reply to this message and we will pick it up.');
    }

    /**
     * The stored HTML as readable paragraphs.
     *
     * Split on the blank lines `toText()` leaves between blocks, so a numbered
     * list arrives as separate lines rather than as one run-on sentence.
     *
     * @return array<int, string>
     */
    private static function paragraphs(string $html): array
    {
        $text = HtmlSanitiser::toText($html);

        return array_values(array_filter(
            array_map('trim', preg_split('/\n{2,}/', (string) preg_replace('/\s*\n\s*/', "\n", $text)) ?: []),
            fn (string $line) => $line !== '',
        ));
    }
}
