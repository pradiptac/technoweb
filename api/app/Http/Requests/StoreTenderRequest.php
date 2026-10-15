<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\Tender;
use App\Support\LinkPattern;
use App\Support\Tenders\TenderText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Validator;

/**
 * Posting a tender — and, through `UpdateTenderRequest`, editing one.
 *
 * `description` is editor HTML and is declared rich text, which is what puts
 * it through `HtmlSanitiser` before validation ever sees it. Every other
 * text field — the reference, the summary, an address, a document's title —
 * is plain text, stored as typed and rendered escaped.
 *
 * **Datetimes are wall-clock `Y-m-d\TH:i` in `APP_TIMEZONE`**, which is what
 * `<input type="datetime-local">` posts: a time with no zone, meaning "six
 * in the evening where the tender is". `modelData()` reads them in the app's
 * zone; the resource hands the same string back, with the instant beside it.
 *
 * **The rules that span two fields are checked against what the tender will
 * be**, not against what this request happens to carry: a `PATCH` sending
 * only `closes_at` is compared with the stored opening date. The events'
 * reasoning — an invariant checked only when both halves arrive together is
 * not an invariant.
 */
class StoreTenderRequest extends FormRequest
{
    use SanitisesRichText;

    /** The scope of work. Everything else here is plain text. */
    protected function richTextFields(): array
    {
        return ['description'];
    }

    /** What a `datetime-local` input posts, with or without seconds. */
    private const WALL_CLOCK = '/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/';

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** The tender being edited, or null on create. */
    protected function existing(): ?Tender
    {
        $tender = $this->route('tender');

        return $tender instanceof Tender ? $tender : null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The buyer's own tender number. Unique, because it is what a
            // bidder quotes and two notices answering to one number is a
            // question nobody can resolve.
            'reference' => [
                'required', 'string', 'max:80',
                Rule::unique('tenders', 'reference')->ignore($this->existing()?->id),
            ],
            'title' => ['required', 'string', 'max:180'],
            'slug' => [
                'nullable', 'string', 'max:200', 'alpha_dash',
                Rule::unique('tenders', 'slug')->ignore($this->existing()?->id),
            ],
            'summary' => ['nullable', 'string', 'max:300'],
            'description' => ['nullable', 'string'],

            'tender_category_id' => ['nullable', 'integer', Rule::exists('tender_categories', 'id')],

            'status' => ['nullable', Rule::enum(PublishStatus::class)],
            'is_featured' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],

            'opens_at' => ['required', 'string', 'regex:'.self::WALL_CLOCK],
            'closes_at' => ['required', 'string', 'regex:'.self::WALL_CLOCK],
            'opening_at' => ['nullable', 'string', 'regex:'.self::WALL_CLOCK],
            'prebid_at' => ['nullable', 'string', 'regex:'.self::WALL_CLOCK],
            'prebid_place' => ['nullable', 'string', 'max:300'],

            // Paise. Zero is an answer — a tender document given away free —
            // so the floor is 0 and not 1.
            'fee_paise' => ['nullable', 'integer', 'min:0', 'max:100000000000'],
            'emd_paise' => ['nullable', 'integer', 'min:0', 'max:100000000000'],

            'submission_email' => ['nullable', 'string', 'email:rfc', 'max:191'],
            'submission_url' => ['nullable', 'string', 'max:500', LinkPattern::PAGE_RULE],
            'submission_address' => ['nullable', 'string', 'max:500'],

            'contact_name' => ['nullable', 'string', 'max:160'],
            'contact_phone' => ['nullable', 'string', 'max:40', 'regex:/^[0-9+()\-.\s]+$/'],
            'contact_email' => ['nullable', 'string', 'email:rfc', 'max:191'],

            'documents' => ['nullable', 'array', 'max:'.Tender::MAX_DOCUMENTS],
            'documents.*.title' => ['required', 'string', 'max:160'],
            'documents.*.note' => ['nullable', 'string', 'max:200'],
            'documents.*.file_path' => ['required', 'string', 'max:255', self::libraryFile()],

            ...SeoRules::rules(),
        ];
    }

    /**
     * A file the media library holds, and not one in the bin.
     *
     * No MIME clause, unlike a cover picture's: a tender pack is a PDF, a
     * spreadsheet of quantities, sometimes a drawing — the library's own
     * upload allowlist is what decides what may be in there at all, and
     * narrowing it again here would refuse a file an editor has legitimately
     * uploaded for exactly this.
     */
    private static function libraryFile(): Exists
    {
        return Rule::exists('media', 'path')->whereNull('deleted_at');
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'reference.required' => 'What is the tender number?',
            'reference.unique' => 'Another tender already has that number.',
            'slug.unique' => 'Another tender already uses that address.',
            'opens_at.required' => 'When does it open for bids?',
            'closes_at.required' => 'When is the last date for submission?',
            'opens_at.regex' => 'A date and a time, as 2026-11-12T10:00.',
            'closes_at.regex' => 'A date and a time, as 2026-11-30T18:00.',
            'opening_at.regex' => 'A date and a time, as 2026-12-01T11:00.',
            'prebid_at.regex' => 'A date and a time, as 2026-11-20T11:00.',
            'submission_url.regex' => 'A link starting http:// or https://, or a path on this site.',
            'contact_phone.regex' => 'A telephone number — digits, spaces and + ( ) - only.',
            'tender_category_id.exists' => 'That category no longer exists.',
            'documents.max' => 'A tender carries up to '.Tender::MAX_DOCUMENTS.' documents.',
            'documents.*.title.required' => 'Every document needs a name.',
            'documents.*.file_path.required' => 'Choose the file from the media library.',
            'documents.*.file_path.exists' => 'That file is not in the media library.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            // The field-by-field rules first: a date that is not a date
            // cannot be compared with one that is.
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            $existing = $this->existing();

            $opens = $this->moment('opens_at', $existing?->opens_at);
            $closes = $this->moment('closes_at', $existing?->closes_at);
            $opening = $this->moment('opening_at', $existing?->opening_at);
            $prebid = $this->moment('prebid_at', $existing?->prebid_at);

            if ($opens !== null && $closes !== null && $closes->lte($opens)) {
                $v->errors()->add('closes_at', 'The last date for submission has to be after the tender opens.');
            }

            // Bids are opened after they stop being accepted. The other way
            // round is a tender whose bids were read before they were in.
            if ($closes !== null && $opening !== null && $opening->lt($closes)) {
                $v->errors()->add('opening_at', 'Bids are opened after the last date for submission, not before it.');
            }

            if ($closes !== null && $prebid !== null && $prebid->gte($closes)) {
                $v->errors()->add('prebid_at', 'A pre-bid meeting happens before the last date for submission.');
            }

            if ($opens !== null && $prebid !== null && $prebid->lt($opens)) {
                $v->errors()->add('prebid_at', 'A pre-bid meeting cannot be before the tender opens.');
            }

            // A meeting with a time and no place is one nobody can attend.
            if ($prebid !== null && blank($this->settled('prebid_place', $existing?->prebid_place))) {
                $v->errors()->add('prebid_place', 'Where is the pre-bid meeting? A time on its own is not something anyone can attend.');
            }

            // Publishing a notice nobody can answer. One sentence, naming
            // the three ways a bid can be sent, so the editor does not have
            // to find out which one we wanted.
            $status = PublishStatus::tryFrom((string) $this->settled('status', $existing?->status->value)) ?? PublishStatus::Draft;

            if ($status === PublishStatus::Published && ! $this->hasAnySubmissionRoute($existing)) {
                $v->errors()->add(
                    'submission_email',
                    'How should a bid be submitted? Add an email address, a link or a postal address before publishing.'
                );
            }
        });
    }

    /** Whether the tender will carry at least one way to submit a bid. */
    private function hasAnySubmissionRoute(?Tender $existing): bool
    {
        foreach (['submission_email', 'submission_url', 'submission_address'] as $key) {
            if (filled($this->settled($key, $existing?->{$key}))) {
                return true;
            }
        }

        return false;
    }

    /**
     * The value this field will have once the request is applied: what the
     * request sends when it mentions the field, what is stored otherwise.
     */
    private function settled(string $key, mixed $stored): mixed
    {
        return $this->has($key) ? $this->input($key) : $stored;
    }

    /** The same, for a datetime: parsed from the request, or the stored moment. */
    private function moment(string $key, ?Carbon $stored): ?Carbon
    {
        return $this->has($key) ? self::parse($this->input($key)) : $stored;
    }

    /** A wall-clock string read in the app's zone, to the minute; null for a blank. */
    public static function parse(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return Carbon::parse(trim($value), TenderText::timezone())->seconds(0);
    }

    /**
     * Just the columns, ready to write.
     *
     * `preventSilentlyDiscardingAttributes` is on outside production, so
     * `seo` is lifted out here rather than handed to `update()`. The
     * documents are rebuilt from their declared keys — `validated()` hands
     * back each row whole — and a field that may not be null is given its
     * default on create and left alone on an edit.
     *
     * @return array<string, mixed>
     */
    public function modelData(): array
    {
        $data = collect($this->safe()->except(['seo']))->all();
        $creating = $this->existing() === null;

        foreach (['opens_at', 'closes_at', 'opening_at', 'prebid_at'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = self::parse($data[$key]);
            }
        }

        $text = [
            'reference', 'title', 'summary', 'prebid_place',
            'submission_email', 'submission_url', 'submission_address',
            'contact_name', 'contact_phone', 'contact_email',
        ];

        foreach ($text as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = filled($data[$key]) ? trim((string) $data[$key]) : null;
            }
        }

        if (array_key_exists('documents', $data)) {
            $data['documents'] = array_values(array_map(fn (array $row) => [
                'title' => trim((string) $row['title']),
                'file_path' => (string) $row['file_path'],
                'note' => filled($row['note'] ?? null) ? trim((string) $row['note']) : null,
            ], $data['documents'] ?? []));
        }

        $defaults = [
            'status' => PublishStatus::Draft->value,
            'is_featured' => false,
            'sort_order' => 0,
        ];

        foreach ($defaults as $key => $default) {
            if ($creating) {
                $data[$key] ??= $default;
            } elseif (array_key_exists($key, $data) && $data[$key] === null) {
                unset($data[$key]);
            }
        }

        // A blank slug on create is derived by `Sluggable`; on an edit it
        // means "leave the address alone", never "clear it".
        if (blank($data['slug'] ?? null)) {
            unset($data['slug']);
        }

        return $data;
    }
}
