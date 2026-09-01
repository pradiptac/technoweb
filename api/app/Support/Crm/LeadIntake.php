<?php

namespace App\Support\Crm;

use App\Models\Enquiry;
use App\Models\Form;
use App\Models\FormSubmission;
use App\Models\Lead;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * The one way a lead is created.
 *
 * Two public intakes feed it — the enquiry form and every editor-built form —
 * and they must not drift into two answers about what a lead is, which is the
 * argument `SubscriberIntake` already makes for the newsletter and
 * `OrderStatus::isPaid()` makes for the word "paid".
 *
 * ### Every submission is its own lead
 *
 * Deliberately no deduplication. The obvious feature — fold a repeat enquiry
 * from the same address into the existing lead — loses the second message,
 * which is routinely the one that says what they actually want ("I forgot to
 * mention it is two sites"). So each submission is a row, and the relationship
 * is *shown* rather than merged: the detail screen lists everything else that
 * address has sent, and having been in touch before is a scoring signal. That
 * is the useful half of deduplication without the destructive half.
 *
 * ### It can never fail the submission
 *
 * By the time this is called the enquiry is committed and the visitor is owed a
 * success response. An exception here would answer 500 for a message that was
 * in fact received, and they would send it again — the same reasoning
 * `Notifier` swallows a mail failure for. So it logs and returns null, and the
 * submission row it failed to shadow is still on disk to be rebuilt from.
 *
 * It logs at `warning` because both `.env` files ship `LOG_LEVEL=warning`, and
 * an `info` line an operator needs is a line that does not exist.
 */
class LeadIntake
{
    public static function fromEnquiry(Enquiry $enquiry, Request $request): ?Lead
    {
        return self::create($enquiry, 'enquiry', self::enquiryFormName($enquiry), [
            'name' => $enquiry->name,
            'email' => $enquiry->email,
            'phone' => $enquiry->phone,
            'company' => $enquiry->company,
            'subject' => $enquiry->subject,
            'message' => $enquiry->message,
        ], $request);
    }

    /**
     * A submission to a form somebody built in the console.
     *
     * The contact is guessed from the answers, because there is nothing else to
     * go on: an editor names their own fields. The guess is over the obvious
     * keys and stops there rather than growing into a heuristic that is wrong
     * in ways nobody can predict — a form whose fields are named otherwise
     * produces a lead with the full answers attached and no contact columns,
     * which the console renders as the answers themselves. That is honest, and
     * it is why the submission is linked rather than copied and discarded.
     */
    public static function fromFormSubmission(FormSubmission $submission, Form $form, Request $request): ?Lead
    {
        $data = $submission->data ?? [];

        return self::create($submission, 'form', $form->name, [
            'name' => self::pick($data, ['name', 'full_name', 'your_name', 'contact_name']),
            'email' => self::pick($data, ['email', 'email_address', 'work_email']),
            'phone' => self::pick($data, ['phone', 'mobile', 'contact_number', 'telephone']),
            'company' => self::pick($data, ['company', 'organisation', 'organization', 'business']),
            'subject' => self::pick($data, ['subject', 'topic']),
            'message' => self::pick($data, ['message', 'enquiry', 'details', 'requirement', 'comments', 'question']),
        ], $request);
    }

    private static function create(Model $source, string $channel, ?string $formName, array $contact, Request $request): ?Lead
    {
        try {
            $page = PageContext::from($request);

            $score = LeadScore::for([
                ...$contact,
                'source_path' => $page['source_path'],
                'returning' => self::hasEnquiredBefore($contact['email'] ?? null),
            ]);

            return Lead::create([
                ...$contact,
                ...$page,
                'source_type' => $source->getMorphClass(),
                'source_id' => $source->getKey(),
                'channel' => $channel,
                'form_name' => $formName,
                'status' => 'new',
                'score' => $score['score'],
                'score_band' => $score['band'],
                'score_reasons' => $score['reasons'],
                'ip_address' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Lead intake failed; the submission itself is stored.', [
                'source' => $source->getMorphClass(),
                'source_id' => $source->getKey(),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Has this address been in touch before?
     *
     * Case-insensitively, because `Sales@Acme.in` and `sales@acme.in` are one
     * mailbox and a signal that misses half its own matches is worse than none.
     */
    private static function hasEnquiredBefore(?string $email): bool
    {
        $email = mb_strtolower(trim((string) $email));

        if ($email === '') {
            return false;
        }

        return Lead::query()->whereRaw('LOWER(email) = ?', [$email])->exists();
    }

    /** The first of these keys the payload actually answered. */
    private static function pick(array $data, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = $data[$key] ?? null;

            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    /**
     * What to call the enquiry form on a list of mixed sources.
     *
     * `enquiries.source` is a short word for the kind of page the form was on —
     * "contact", "product", "solution" — set by whichever component rendered it.
     * It is not a page and must not be presented as one, which is why it becomes
     * a name here and never touches `source_path`.
     */
    private static function enquiryFormName(Enquiry $enquiry): string
    {
        /*
         * The kind, not the whole value. `EnquiryForm` is handed
         * `source={`product:${p.slug}`}`, so the column holds
         * `product:cisco-cbs350-24t-4g` and matching the whole string labelled
         * every product enquiry on the site "Enquiry form".
         *
         * Found by submitting one through the real form rather than by reading
         * this: the contact page passes a bare `contact` and matched, so the
         * one call site that happened to be tested was the one case that
         * worked.
         */
        $kind = explode(':', (string) $enquiry->source, 2)[0];

        return match ($kind) {
            'contact' => 'Contact form',
            'product' => 'Product enquiry',
            'solution' => 'Solution enquiry',
            'service' => 'Service enquiry',
            default => 'Enquiry form',
        };
    }
}
