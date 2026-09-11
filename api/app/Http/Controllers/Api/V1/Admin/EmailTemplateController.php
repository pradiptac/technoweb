<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\MailTemplate;
use App\Support\HtmlSanitiser;
use App\Support\Mail\MessageCatalogue;
use App\Support\Mail\Placeholders;
use App\Support\Mail\Templates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * An editor's own wording for the emails the system sends.
 *
 * `role:admin`, argued on blast radius rather than skill — the same split that
 * produced `sales_manager`, `campaign_manager` and `store_manager`. A bad edit
 * to the sign-in code or the password reset breaks account recovery for every
 * principal here, including the administrator who made it; and these messages
 * carry money, licence keys and other people's telephone numbers in their
 * placeholders. It also belongs beside "Outgoing mail" in an operator's head:
 * the transport is where mail *works*, this is where it *reads*, and the two
 * are worked in one sitting.
 *
 * If it ever needs delegating, the fix is one line — move the block into a
 * different role group and change one `role:` in `admin-nav.tsx`, the escape
 * hatch `/companies/suggest` documents.
 */
class EmailTemplateController extends Controller
{
    /**
     * Every message, and which of them somebody has rewritten.
     *
     * `meta.messages` carries the whole catalogue — labels, descriptions,
     * audiences, variables and samples — so the console holds no copy of any
     * of it. A hand-written list of 23 message names on the far side of the
     * wire is exactly the drift `schema_type_options` was moved out of
     * TypeScript to end.
     */
    public function index(): JsonResponse
    {
        $rows = MailTemplate::query()->with('editor:id,name')->get()->keyBy('key');

        return response()->json([
            'data' => collect(MessageCatalogue::all())
                ->map(function (array $entry, string $key) use ($rows): array {
                    $row = $rows->get($key);

                    return [
                        'key' => $key,
                        'label' => $entry['label'],
                        'description' => $entry['description'],
                        'audience' => $entry['audience'],
                        // Absence of a row *is* "using the default", so there
                        // is no flag that can disagree with reality.
                        'is_customised' => $row !== null,
                        'is_enabled' => $row?->is_enabled ?? true,
                        'updated_at' => $row?->updated_at,
                        'updated_by' => $row?->editor?->name,
                    ];
                })
                ->values(),
            'meta' => ['messages' => MessageCatalogue::all()],
        ]);
    }

    /** One message: what is stored, what ships, and what it offers. */
    public function show(string $key): JsonResponse
    {
        $entry = $this->entry($key);
        $row = MailTemplate::query()->where('key', $key)->first();

        return response()->json([
            'data' => [
                'key' => $key,
                'is_customised' => $row !== null,
                'is_enabled' => $row?->is_enabled ?? true,
                /*
                 * The stored copy, or the shipped starting point — so the
                 * editor opens on something rather than on a blank page, while
                 * `is_customised` still says nothing has been saved.
                 */
                'subject' => $row?->subject ?? $entry['subject'],
                'body_html' => $row?->body_html ?? $entry['body'],
                'body_text' => $row?->body_text,
                'updated_at' => $row?->updated_at,
            ],
            'meta' => ['message' => $entry],
        ]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        $entry = $this->entry($key);

        $data = $request->validate([
            // 200 rather than 255: every client truncates a subject long
            // before that, and a limit that accepts what will never be read
            // teaches nothing.
            'subject' => ['required', 'string', 'max:200', 'not_regex:/[\r\n]/'],
            'body_html' => ['required', 'string', 'max:60000'],
            'body_text' => ['nullable', 'string', 'max:20000'],
            'is_enabled' => ['sometimes', 'boolean'],
        ], [
            'subject.not_regex' => 'A subject cannot contain a line break.',
        ]);

        $row = MailTemplate::updateOrCreate(['key' => $key], [
            'subject' => $data['subject'],
            // The same profile every other body in this product goes through,
            // on write and never on display.
            'body_html' => HtmlSanitiser::clean($data['body_html']),
            'body_text' => $data['body_text'] ?? null,
            'is_enabled' => $data['is_enabled'] ?? true,
            'updated_by' => $request->user()?->id,
        ]);

        return response()->json([
            'data' => ['key' => $key, 'is_customised' => true, 'updated_at' => $row->updated_at],
            'meta' => ['unknown' => $this->unknown($entry, $data)],
        ]);
    }

    /** Back to the built-in message. */
    public function destroy(string $key): JsonResponse
    {
        $this->entry($key);

        MailTemplate::query()->where('key', $key)->delete();

        /*
         * 204 whether or not a row existed. "Reset to default" on a message
         * already at its default is a no-op, not an error — and a console that
         * answers 404 for it is one that reports a failure for something the
         * person plainly achieved.
         */
        return response()->json(null, 204);
    }

    /**
     * What the draft would look like, without saving it.
     *
     * Goes through `Templates::render()` — the same method a real send uses —
     * because a preview assembled any other way is a preview of something
     * else, which is the comment `NewsletterTemplateController::preview()`
     * already carries.
     */
    public function preview(Request $request, string $key): JsonResponse
    {
        $entry = $this->entry($key);

        $data = $request->validate([
            'subject' => ['required', 'string', 'max:200'],
            'body_html' => ['required', 'string', 'max:60000'],
            'body_text' => ['nullable', 'string', 'max:20000'],
        ]);

        $rendered = Templates::render(
            $key,
            $data['subject'],
            HtmlSanitiser::clean($data['body_html']),
            $data['body_text'] ?? null,
            MessageCatalogue::samples($key),
        );

        return response()->json([
            'data' => [
                'subject' => $rendered['subject'],
                'html' => $rendered['document'],
                'text' => $rendered['plain'],
            ],
            'meta' => ['unknown' => $this->unknown($entry, $data)],
        ]);
    }

    /**
     * Send the draft to somebody, once.
     *
     * **This is a weaker guarantee than `/admin/settings/mail/test`**, and the
     * difference is worth stating rather than glossing: that endpoint's safety
     * is that the caller cannot influence a byte of the body, which is exactly
     * what this one has to do — a test send that ignored what you typed would
     * test nothing.
     *
     * What bounds it instead: an authenticated administrator, six a minute, a
     * body already through the sanitiser, **sample values only** so no real
     * customer's details leave the building, and the recipient written to the
     * activity log.
     *
     * Synchronous and outside `Notifier`, so a failure comes back in the mail
     * server's own words — the one thing that says what to fix.
     */
    public function test(Request $request, string $key): JsonResponse
    {
        $this->entry($key);

        $data = $request->validate([
            'subject' => ['required', 'string', 'max:200'],
            'body_html' => ['required', 'string', 'max:60000'],
            'body_text' => ['nullable', 'string', 'max:20000'],
            // Never `email:dns`: a DNS lookup on the request path is a cost
            // this project has measured once already at 12.5 seconds.
            'email' => ['nullable', 'email:rfc'],
        ]);

        $to = $data['email'] ?? $request->user()?->email;

        if (! $to) {
            return response()->json(['message' => 'There is no address to send to.'], 422);
        }

        $rendered = Templates::render(
            $key,
            $data['subject'],
            HtmlSanitiser::clean($data['body_html']),
            $data['body_text'] ?? null,
            MessageCatalogue::samples($key),
        );

        try {
            Mail::html($rendered['document'], function ($message) use ($to, $rendered) {
                $message->to($to)->subject('[Test] '.$rendered['subject']);
            });
        } catch (Throwable $e) {
            // The provider's own words. "Connection could not be established
            // with host smtp.example.com:587" says what to fix; anything
            // friendlier says nothing at all.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['sent_to' => $to]]);
    }

    /** @return array<string, mixed> */
    private function entry(string $key): array
    {
        $entry = MessageCatalogue::get($key);

        abort_if($entry === null, 404);

        return $entry;
    }

    /**
     * Placeholders the draft uses that this message does not offer.
     *
     * **A warning, not a refusal.** Refusing the save would throw away a
     * screenful of typing over one typo mid-edit; stripping them silently is
     * how braces ship. At render they are stripped, so the cost of ignoring
     * this is a sentence missing a word — which the console says, naming each
     * one, where the typo was made rather than in somebody's inbox.
     *
     * @param  array<string, mixed>  $entry
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    private function unknown(array $entry, array $data): array
    {
        $used = Placeholders::used(
            ($data['subject'] ?? '').($data['body_html'] ?? '').($data['body_text'] ?? ''),
        );

        return array_values(array_diff($used, array_keys($entry['variables'])));
    }
}
