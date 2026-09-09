<?php

namespace App\Support\Chat;

use App\Models\ChatConversation;
use App\Models\ChatMessage;

/**
 * Who am I talking to — asked before anything is suggested.
 *
 * The assistant greets, then collects the visitor's details one question at a
 * time, and only once that is done does it retrieve, answer or recommend
 * anything. The details become a `Lead` through the same `LeadIntake` pipeline
 * every other enquiry on this site goes through.
 *
 * ## It is a state machine, not a prompt
 *
 * The obvious implementation is to tell the model to conduct the interview.
 * That is the wrong shape here for the reason the rest of this module is built
 * the way it is: a model asked to collect four fields will re-ask one it
 * already has, accept "no" as an email address, wander off the script when
 * somebody pushes back, and cost a call per question. None of that can be
 * tested and none of it can be relied on.
 *
 * So intake never reaches a provider. The questions are authored, the answers
 * are validated in PHP, and the model is not called until there is a question
 * to answer — which also means the intake phase spends nothing and consumes
 * none of the daily reply cap.
 *
 * ## It must not become a trap
 *
 * Two rules make the difference between collecting a lead and holding a
 * visitor's question hostage, and both are deliberate:
 *
 * - **Every step can be declined.** "Skip", "no", "rather not" and their
 *   neighbours move on. A visitor who wants to know whether we stock a switch
 *   and will not give a phone number still gets an answer.
 * - **A field is asked for twice, never more.** A value that does not validate
 *   is queried once, in gentler words, and then let go. Anything else is a loop
 *   somebody escapes by closing the panel, and a conversation that ends there is
 *   worth less than the field.
 *
 * A lead is written when intake completes and there is something workable in
 * it: a name, and at least one of an email address or a telephone number. A row
 * carrying a name alone is not a lead, it is a row somebody has to delete.
 *
 * ## The whole thing is switchable
 *
 * `chatbot_intake_enabled` turns it off without a deploy, and the questions are
 * a setting. Off, this class answers "not pending" to everything and the module
 * behaves exactly as it did before it existed.
 */
class Intake
{
    /**
     * The fields that may be asked for, in the only order that reads as a
     * conversation rather than a form.
     *
     * An allowlist because the questions come from a setting, so the *field* an
     * editor names is untrusted input — one this class does not recognise is
     * dropped rather than stored, the rule `FormValidator` follows for an
     * editor-built form's own keys.
     */
    public const FIELDS = ['name', 'email', 'phone', 'company', 'requirement'];

    /**
     * The last step, and it does two jobs.
     *
     * Its answer is the lead's requirement *and* the visitor's first real
     * question, which is handed straight to the assistant. Asking "what can I
     * help with", writing it down, and then saying "go on then" would make
     * somebody type it twice — and typing a thing twice to a machine that just
     * read it is where people give up on a chatbot.
     */
    public const CLOSING_FIELD = 'requirement';

    /** Answers that mean "move on", for a step that allows it. */
    private const DECLINED = [
        'skip', 'skip it', 'no', 'nope', 'no thanks', 'no thank you', 'not now',
        'later', 'rather not', 'prefer not', 'prefer not to say', 'none', 'n/a', 'na', '-',
    ];

    /**
     * The one field nobody has to give.
     *
     * Name, email and phone can each be declined too — `DECLINED` applies to
     * every step — but they are *asked* plainly. Company is asked with the
     * escape offered in the question itself, because a personal enquiry has no
     * answer to give and a question with no valid answer reads as an obstacle.
     */
    private const OPTIONAL = ['company'];

    public static function enabled(): bool
    {
        return ChatSettings::intakeEnabled();
    }

    /**
     * Is there still a question to ask?
     *
     * False when the feature is off, when it has been completed, and when the
     * configured list holds nothing this conversation still needs — which is
     * what makes a conversation that predates the feature, or one belonging to
     * a signed-in customer, fall straight through.
     */
    public static function pending(ChatConversation $conversation): bool
    {
        return self::enabled()
            && $conversation->intake_completed_at === null
            && self::nextStep($conversation) !== null;
    }

    /**
     * Ask the next question, storing it as an ordinary assistant message.
     *
     * An ordinary message on purpose: the transcript, the resume path, the
     * console and the retention prune all work on messages, and a question the
     * visitor answered that appears nowhere would make every stored transcript
     * start with an answer to nothing.
     *
     * Returns null when there is nothing left to ask, having stamped the
     * conversation complete — so a caller can always treat null as "intake is
     * over".
     */
    public static function ask(ChatConversation $conversation): ?ChatMessage
    {
        if (! self::enabled()) {
            return null;
        }

        $step = self::nextStep($conversation);

        if ($step === null) {
            self::complete($conversation);

            return null;
        }

        $data = self::data($conversation);
        $retrying = ($data['_retry'] ?? null) === $step['field'];

        return self::say($conversation, $retrying ? self::retryQuestion($step) : $step['question']);
    }

    /**
     * Take the visitor's message as the answer to the question on the table.
     *
     * @return array{message: ?ChatMessage, completed: bool}
     *                                                       `completed` is true only on the turn intake finishes, which
     *                                                       is the caller's cue to write the lead and hand this same
     *                                                       message to the assistant to answer.
     */
    public static function answer(ChatConversation $conversation, string $text): array
    {
        $step = self::nextStep($conversation);

        if ($step === null) {
            self::complete($conversation);

            return ['message' => null, 'completed' => false];
        }

        $data = self::data($conversation);
        $field = $step['field'];
        $answer = trim($text);

        if (self::declined($answer)) {
            /*
             * Recorded as declined rather than left absent. The two look the
             * same in a column and mean opposite things to whoever picks the
             * lead up: one is somebody who would not say, the other is a
             * question this conversation never reached.
             */
            $data['_skipped'] = array_values(array_unique([...($data['_skipped'] ?? []), $field]));
            unset($data['_retry']);

            return self::advance($conversation, $data);
        }

        $value = self::clean($field, $answer);

        if ($value === null) {
            if (($data['_retry'] ?? null) !== $field) {
                // First miss: ask again, once, in gentler words.
                $data['_retry'] = $field;
                self::store($conversation, $data);

                return ['message' => self::say($conversation, self::retryQuestion($step)), 'completed' => false];
            }

            /*
             * Second miss: let it go rather than ask a third time — and **say
             * so**, which the first cut did not.
             *
             * It moved silently to the next question, so somebody who typed
             * `pradiptac@gmail` watched the assistant ask for their telephone
             * number and reasonably concluded the address had been taken. It had
             * not: the lead reached the sales desk with `email: NULL` and nobody
             * on either end knew. The skip is right; the silence was the bug.
             */
            $data['_skipped'] = array_values(array_unique([...($data['_skipped'] ?? []), $field]));
            unset($data['_retry']);

            return self::advance($conversation, $data, $field);
        }

        $data[$field] = $value;
        unset($data['_retry']);

        return self::advance($conversation, $data);
    }

    /**
     * What was collected, ready for `LeadIntake::fromChat`.
     *
     * The reserved keys are stripped here rather than at the call site: they are
     * this class's bookkeeping, and a `_skipped` array arriving in a lead's
     * contact array would be written to a column or silently dropped depending
     * on how careful the next person was.
     *
     * @return array<string, string>
     */
    public static function contact(ChatConversation $conversation): array
    {
        return array_filter(
            self::data($conversation),
            fn ($v, $k) => is_string($v) && $v !== '' && ! str_starts_with($k, '_'),
            ARRAY_FILTER_USE_BOTH,
        );
    }

    /**
     * Is there enough here to be worth the sales desk's time?
     *
     * A name and one way to reach them. A row with a name and nothing else
     * cannot be actioned, and filing it anyway makes the pipeline a list people
     * scroll past — the argument this codebase already makes for not
     * auto-filing junk as spam, from the other direction.
     */
    public static function workable(ChatConversation $conversation): bool
    {
        $contact = self::contact($conversation);

        return filled($contact['name'] ?? null)
            && (filled($contact['email'] ?? null) || filled($contact['phone'] ?? null));
    }

    /**
     * The steps this conversation still has to go through.
     *
     * A signed-in customer is not interrogated for what the database already
     * holds: their name, address and telephone number are on the account, so
     * those steps are pre-filled and never asked. Asking a customer who is
     * signed in for their own email address is the clearest possible signal
     * that nothing on the other end is paying attention.
     *
     * @return array<int, array{field: string, question: string}>
     */
    public static function steps(ChatConversation $conversation): array
    {
        $known = self::fromCustomer($conversation);

        return array_values(array_filter(
            ChatSettings::intakeQuestions(),
            fn (array $step) => ! array_key_exists($step['field'], $known),
        ));
    }

    /** @return array{field: string, question: string}|null */
    private static function nextStep(ChatConversation $conversation): ?array
    {
        $data = self::data($conversation);
        $skipped = $data['_skipped'] ?? [];

        foreach (self::steps($conversation) as $step) {
            if (! array_key_exists($step['field'], $data) && ! in_array($step['field'], $skipped, true)) {
                return $step;
            }
        }

        return null;
    }

    /**
     * Move to the next question, or finish.
     *
     * @return array{message: ?ChatMessage, completed: bool}
     */
    private static function advance(
        ChatConversation $conversation,
        array $data,
        ?string $abandoned = null,
    ): array {
        self::store($conversation, $data);

        $next = self::nextStep($conversation);

        if ($next !== null) {
            /*
             * The acknowledgement rides on the *next* question rather than
             * being a message of its own. Two bubbles in a row from the
             * assistant — one saying "I could not use that", one asking the
             * next thing — reads as the machine talking to itself, and it is
             * one more thing to scroll past on a phone.
             */
            $question = $abandoned !== null
                ? self::abandonedNote($abandoned).' '.$next['question']
                : $next['question'];

            return ['message' => self::say($conversation, $question), 'completed' => false];
        }

        self::complete($conversation);

        return ['message' => null, 'completed' => true];
    }

    private static function complete(ChatConversation $conversation): void
    {
        if ($conversation->intake_completed_at === null) {
            $conversation->forceFill(['intake_completed_at' => now()])->save();
        }
    }

    /**
     * What the account already answers, when there is one.
     *
     * Read live rather than copied into `intake_data`, so somebody who signs in
     * part-way through — which `ChatController::send` supports, and which this
     * codebase has already been bitten by *not* supporting — stops being asked
     * from that message onwards.
     *
     * **Every contact field, not only the ones that happen to be filled.** The
     * first cut returned what the account held and left the rest to be asked,
     * which reads as reasonable and is wrong: a customer with no telephone
     * number on file was asked for one, so their first message — "my firewall
     * is not working" — was consumed as a phone number, failed validation, and
     * came back as "that does not look like a telephone number". That is
     * `ChatJourneyTest`'s fifth journey, and it caught this within a minute of
     * the feature existing.
     *
     * A signed-in customer has already told this business who they are. The
     * place to correct a missing number is `/portal/profile`, not an
     * interrogation in front of a support question.
     *
     * @return array<string, string>
     */
    private static function fromCustomer(ChatConversation $conversation): array
    {
        $customer = $conversation->customer;

        if ($customer === null) {
            return [];
        }

        $known = [];

        foreach (self::FIELDS as $field) {
            if ($field === self::CLOSING_FIELD) {
                // Still asked, and it is the only one: what they came for is
                // not on any account.
                continue;
            }

            $known[$field] = (string) ($customer->{$field} ?? '');
        }

        return $known;
    }

    /** The stored bookkeeping, always an array. */
    private static function data(ChatConversation $conversation): array
    {
        $stored = $conversation->intake_data;

        return is_array($stored) ? $stored : [];
    }

    private static function store(ChatConversation $conversation, array $data): void
    {
        $conversation->forceFill(['intake_data' => $data])->save();
    }

    /**
     * One assistant message, and `grounded` is false on every one of them.
     *
     * An intake question is not an answer that stood on retrieved copy, and the
     * interface reads that flag to decide whether to offer thumbs — asking
     * somebody to rate "may I take your name?" is asking them to rate a form
     * field. It does **not** put the question on `/admin/chat/unanswered`, which
     * is driven by a `ChatEvent` rather than by this column.
     */
    private static function say(ChatConversation $conversation, string $text): ChatMessage
    {
        return $conversation->messages()->create([
            'role' => 'assistant',
            'content' => $text,
            'intent' => Intent::GENERAL,
            'grounded' => false,
            'created_at' => now(),
        ]);
    }

    /**
     * The second attempt at a question, which must not simply repeat the first.
     *
     * Repeating a question verbatim reads as a machine that did not hear;
     * naming what was wrong with the answer reads as one that did. The wording
     * is per field because "that does not look like an email address" is
     * useful and "that is not valid" is not.
     */
    private static function retryQuestion(array $step): string
    {
        return match ($step['field']) {
            'name' => 'Sorry — I did not catch that. What name should I put down? Say skip if you would rather not.',
            'email' => 'That does not look like an email address. Could you write it out in full? Say skip if you would rather not.',
            'phone' => 'That does not look like a telephone number. Could you give it with the dialling code? Say skip if you would rather not.',
            'company' => 'Sorry — which company was that? Say skip if it is a personal enquiry.',
            default => 'Sorry, I did not follow. Could you put that another way?',
        };
    }

    private static function declined(string $answer): bool
    {
        $normalised = mb_strtolower(trim($answer, " \t\n\r\0\x0B.!"));

        return in_array($normalised, self::DECLINED, true);
    }

    /**
     * Validate one answer, returning the value to store or null to re-ask.
     *
     * Deliberately forgiving. This is a chat window, not a checkout: the cost of
     * refusing a real answer is a visitor who thinks the assistant is broken,
     * and the cost of accepting an odd one is a lead the desk reads with their
     * own eyes before ringing anybody.
     */
    private static function clean(string $field, string $answer): ?string
    {
        $answer = preg_replace('/\s+/u', ' ', $answer) ?? $answer;

        return match ($field) {
            /*
             * A question is not a name, and this is the one case that would
             * otherwise be wrong *silently*. Somebody whose first message is
             * "do you sell switches?" would have "do you sell switches?" filed
             * as their name and sent to the sales desk — so a trailing question
             * mark, an address and a URL are all read as "they have not
             * answered yet" and get the gentler second ask.
             */
            'name' => self::looksLikeAName($answer) ? $answer : null,

            /*
             * `FILTER_VALIDATE_EMAIL`, never a DNS check. An MX lookup on the
             * request path is a cost this project has measured once already at
             * 12.5 seconds, and the callback itself proves the address far
             * better than a record does — the rule every public form here
             * follows.
             */
            'email' => filter_var($answer, FILTER_VALIDATE_EMAIL) !== false
                && mb_strlen($answer) <= 190
                /*
                 * A dotted domain with a real top level, on top of
                 * `FILTER_VALIDATE_EMAIL`. That filter accepts `you@localhost`
                 * and `you@gmail` — a bare hostname is legal in an intranet and
                 * meaningless on a public contact form, where it is a typo
                 * every time. Still no DNS: an MX lookup on the request path is
                 * a cost this project has measured at 12.5 seconds, and this is
                 * a syntax check that costs nothing.
                 */
                && preg_match('/@[^@\s]+\.[a-z]{2,}$/i', $answer) === 1
                    ? mb_strtolower($answer) : null,

            /*
             * Counted in digits, and the original text is what is stored. India
             * writes a number half a dozen ways and every one of them is
             * dialable; normalising it would throw away an extension somebody
             * typed for a reason.
             */
            'phone' => (function () use ($answer) {
                $digits = preg_replace('/\D+/', '', $answer) ?? '';

                /*
                 * One digit repeated is not a telephone number. 9999999999 and
                 * 0000000000 are the two things people type to get past a field
                 * they do not want to fill in, and both pass every length rule
                 * there is. Nothing real is one repeated digit, so this refuses
                 * them without refusing anybody.
                 */
                if (preg_match('/^(\d)\1+$/', $digits) === 1) {
                    return null;
                }

                return strlen($digits) >= 7 && strlen($digits) <= 15 && mb_strlen($answer) <= 32
                    ? $answer : null;
            })(),

            /*
             * A company can be called anything, so this only refuses what is
             * plainly *not* an answer — an enquiry typed into the wrong box.
             * "I want to buy a laptop" is caught; a bare "laptop" is not, and
             * cannot be: nothing here can tell it from a firm of that name, and
             * guessing would refuse somebody their own company. The field is
             * optional and the desk reads the row.
             */
            'company' => mb_strlen($answer) >= 2
                && mb_strlen($answer) <= 180
                && ! self::looksLikeAnEnquiry($answer)
                    ? $answer : null,

            'requirement' => mb_strlen($answer) >= 2 ? mb_substr($answer, 0, 2000) : null,

            default => null,
        };
    }

    /**
     * Words that mean somebody is telling you what they came for.
     *
     * A word list, and the precedent is `Intent`, which decides support against
     * sales the same way and for the same reason: this runs on every answer, and
     * paying a provider to classify four words before paying it to answer a
     * question is twice the latency for a decision a list makes correctly.
     *
     * These are the ones that appear in an *enquiry* and essentially never in a
     * name or a company. "Buy" is here and "sale" is not — Sale is a surname.
     */
    private const ENQUIRY_WORDS = [
        'want', 'need', 'looking for', 'look for', 'buy', 'buying', 'purchase',
        'price', 'pricing', 'cost', 'quote', 'quotation', 'how much', 'do you',
        'can you', 'could you', 'please send', 'interested in', 'enquiry', 'inquiry',
        'i am', "i'm", 'we are', "we're", 'require', 'suggest', 'recommend',
    ];

    /**
     * Is this an enquiry rather than an answer to the question asked?
     *
     * Somebody whose first message is "I want to buy laptop" has answered the
     * question they arrived with rather than the one on the screen, and the
     * first cut filed exactly that as their **name** and sent it to the sales
     * desk — a lead reading `name: "I want to buy laptop"`, which is the whole
     * reason this exists. The old check caught a trailing question mark and
     * nothing else, so a statement of intent walked straight through it.
     */
    private static function looksLikeAnEnquiry(string $answer): bool
    {
        $normalised = ' '.mb_strtolower($answer).' ';

        if (str_ends_with(trim($answer), '?')) {
            return true;
        }

        foreach (self::ENQUIRY_WORDS as $word) {
            // Padded, so "want" does not match "Wanted" as a surname and "i am"
            // does not fire inside "Miami".
            if (str_contains($normalised, ' '.$word.' ')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Does this look like somebody's name?
     *
     * Deliberately a shape test rather than a dictionary. Names here are Indian,
     * British and everything else, so the only safe rules are structural: a name
     * is short, has no digits in it, is not an address or a URL, and is not a
     * sentence about what somebody wants.
     *
     * **Five words**, because "Pradipta Chowdhury" is two and the longest real
     * name anybody types into a chat box is four or five. "I want to buy laptop"
     * is five and is caught by the word list rather than the count, which is why
     * both are here.
     */
    private static function looksLikeAName(string $answer): bool
    {
        return mb_strlen($answer) >= 2
            && mb_strlen($answer) <= 120
            && ! str_contains($answer, '@')
            && ! preg_match('~https?://~i', $answer)
            // A digit in a name is a telephone number, a house number or a typo.
            && preg_match('/\d/', $answer) !== 1
            && count(preg_split('/\s+/u', trim($answer)) ?: []) <= 5
            && ! self::looksLikeAnEnquiry($answer);
    }

    /**
     * What to say when a field has been let go after two tries.
     *
     * Named per field, because "I could not use that" is a sentence somebody
     * has to work out and "I will leave the email address for now" is not. It
     * also tells them what is *missing* from what the business will hold, which
     * is the thing they would want to correct.
     */
    private static function abandonedNote(string $field): string
    {
        return match ($field) {
            'name' => 'No matter — I will carry on without a name.',
            'email' => 'No matter — I will leave the email address for now.',
            'phone' => 'No matter — I will leave the number for now.',
            'company' => 'No matter.',
            default => 'No matter.',
        };
    }

    /** Whether a field may be left out without being asked twice. */
    public static function optional(string $field): bool
    {
        return in_array($field, self::OPTIONAL, true);
    }
}
