<?php

namespace App\Http\Requests;

use App\Enums\EventFormat;
use App\Enums\EventRegistrationMode;
use App\Enums\PublishStatus;
use App\Http\Requests\Concerns\CmsFieldRules;
use App\Http\Requests\Concerns\SanitisesRichText;
use App\Models\Event;
use App\Support\Events\EventSettings;
use App\Support\Events\EventText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Validator;

/**
 * Creating an event — and, through `UpdateEventRequest`, editing one.
 *
 * `body` is editor HTML and is declared rich text (the trait's default),
 * which is what puts it through `HtmlSanitiser` before validation ever sees
 * it; FAQ answers are cleaned by the trait wherever they are written. Every
 * other text field — the summary, the venue, a speaker's role, an agenda
 * line — is plain text, stored as typed and rendered escaped.
 *
 * **Datetimes are wall-clock `Y-m-d\TH:i` in `APP_TIMEZONE`**, which is what
 * `<input type="datetime-local">` posts: a time with no zone, meaning "three
 * in the afternoon where the event is". `modelData()` reads them in the
 * app's zone; the resource hands the same string back, with the instant
 * beside it.
 *
 * **The rules that span two fields are checked against what the event will
 * be**, not against what this request happens to carry: a `PATCH` sending
 * only `ends_at` is compared with the stored start, one sending only
 * `status: published` is held to the stored format and join link. The same
 * reasoning as a location's level — an invariant checked only when both
 * halves arrive together is not an invariant.
 */
class StoreEventRequest extends FormRequest
{
    use SanitisesRichText;

    /** What a `datetime-local` input posts, with or without seconds. */
    private const WALL_CLOCK = '/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/';

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** The event being edited, or null on create. */
    protected function existing(): ?Event
    {
        $event = $this->route('event');

        return $event instanceof Event ? $event : null;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'slug' => [
                'nullable', 'string', 'max:180', 'alpha_dash',
                // The manage page's own segment — see `Event::RESERVED_SLUGS`.
                Rule::notIn(Event::RESERVED_SLUGS),
                Rule::unique('events', 'slug')->ignore($this->existing()?->id),
            ],
            'summary' => ['nullable', 'string', 'max:300'],
            'body' => ['nullable', 'string'],
            'status' => ['nullable', Rule::enum(PublishStatus::class)],
            'is_featured' => ['nullable', 'boolean'],

            'format' => ['required', Rule::enum(EventFormat::class)],
            'starts_at' => ['required', 'string', 'regex:'.self::WALL_CLOCK],
            'ends_at' => ['nullable', 'string', 'regex:'.self::WALL_CLOCK],

            'venue_name' => ['nullable', 'string', 'max:160'],
            'venue_city' => ['nullable', 'string', 'max:80'],
            'venue_address' => ['nullable', 'string', 'max:500'],
            'map_url' => ['nullable', 'string', 'max:500', 'url:http,https'],
            'online_url' => ['nullable', 'string', 'max:500', 'url:http,https'],

            'cover_image_path' => ['nullable', 'string', 'max:255', self::libraryImage()],

            'speakers' => ['nullable', 'array', 'max:'.Event::MAX_SPEAKERS],
            'speakers.*.name' => ['required', 'string', 'max:120'],
            'speakers.*.role' => ['nullable', 'string', 'max:160'],
            'speakers.*.photo_path' => ['nullable', 'string', 'max:255', self::libraryImage()],

            'agenda' => ['nullable', 'array', 'max:'.Event::MAX_AGENDA],
            'agenda.*.time' => ['nullable', 'string', 'max:40'],
            'agenda.*.title' => ['required', 'string', 'max:160'],
            'agenda.*.note' => ['nullable', 'string', 'max:400'],

            'registration_mode' => ['nullable', Rule::enum(EventRegistrationMode::class)],
            'external_url' => ['nullable', 'string', 'max:500', 'url:http,https'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'waitlist_enabled' => ['nullable', 'boolean'],
            'max_seats' => ['nullable', 'integer', 'min:1', 'max:'.EventSettings::SEATS_CEILING],
            'registration_closes_at' => ['nullable', 'string', 'regex:'.self::WALL_CLOCK],

            // Read by the controller, never stored: "Tell everyone registered".
            'notify_registrants' => ['nullable', 'boolean'],

            ...CmsFieldRules::faqs(),
            ...SeoRules::rules(),
        ];
    }

    /** A picture the media library holds — not a document, and not a file in the bin. */
    private static function libraryImage(): Exists
    {
        return Rule::exists('media', 'path')
            ->whereNull('deleted_at')
            ->where(fn ($query) => $query->where('mime', 'like', 'image/%'));
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'slug.not_in' => 'That address is used by the registration pages. Choose another.',
            'slug.unique' => 'Another event already uses that address.',
            'starts_at.required' => 'When does it start?',
            'starts_at.regex' => 'A date and a time, as 2026-11-12T15:00.',
            'ends_at.regex' => 'A date and a time, as 2026-11-12T16:30.',
            'registration_closes_at.regex' => 'A date and a time, as 2026-11-11T18:00.',
            'map_url.url' => 'A link starting http:// or https://.',
            'online_url.url' => 'A link starting http:// or https://.',
            'external_url.url' => 'A link starting http:// or https://.',
            'cover_image_path.exists' => 'That picture is not in the media library.',
            'speakers.*.photo_path.exists' => 'That picture is not in the media library.',
            'speakers.*.name.required' => 'Every speaker needs a name.',
            'agenda.*.title.required' => 'Every agenda line needs a title.',
            'speakers.max' => 'An event lists up to '.Event::MAX_SPEAKERS.' speakers.',
            'agenda.max' => 'An agenda has up to '.Event::MAX_AGENDA.' lines.',
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

            $starts = $this->moment('starts_at', $existing?->starts_at);
            $ends = $this->moment('ends_at', $existing?->ends_at);
            $closes = $this->moment('registration_closes_at', $existing?->registration_closes_at);

            if ($starts !== null && $ends !== null && $ends->lte($starts)) {
                $v->errors()->add('ends_at', 'The end has to be after the start.');
            }

            if ($starts !== null && $closes !== null && $closes->gt($starts)) {
                $v->errors()->add('registration_closes_at', 'Registration cannot close after the event has started.');
            }

            $format = EventFormat::tryFrom((string) $this->settled('format', $existing?->format->value)) ?? EventFormat::InPerson;
            $mode = EventRegistrationMode::tryFrom((string) $this->settled('registration_mode', $existing?->registration_mode->value))
                ?? EventRegistrationMode::None;
            $status = PublishStatus::tryFrom((string) $this->settled('status', $existing?->status->value)) ?? PublishStatus::Draft;

            if ($format->hasVenue() && blank($this->settled('venue_name', $existing?->venue_name))) {
                $v->errors()->add('venue_name', 'Where is it? A venue is needed unless the event is online only.');
            }

            if ($mode === EventRegistrationMode::External && blank($this->settled('external_url', $existing?->external_url))) {
                $v->errors()->add('external_url', 'Where do people register? Add the link to the sign-up page.');
            }

            // The join link is what a registrant is sent. Publishing an
            // online event that registers here without one would confirm
            // people into a webinar they have no way to open.
            if ($status === PublishStatus::Published
                && $format->isOnline()
                && $mode === EventRegistrationMode::Open
                && blank($this->settled('online_url', $existing?->online_url))) {
                $v->errors()->add('online_url', 'Add the join link before publishing — it is what people who register are sent.');
            }

            $capacity = $this->settled('capacity', $existing?->capacity);

            if ($existing !== null && $capacity !== null && $capacity !== '') {
                $held = $existing->registrationCounts()->heldSeats;

                if ((int) $capacity < $held) {
                    $v->errors()->add('capacity', "{$held} seats are already taken, so the capacity cannot be lower than {$held}.");
                }
            }
        });
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

        return Carbon::parse(trim($value), EventText::timezone())->seconds(0);
    }

    /**
     * Just the columns, ready to write.
     *
     * `preventSilentlyDiscardingAttributes` is on outside production, so
     * `faqs`, `seo` and `notify_registrants` are lifted out here rather than
     * handed to `update()`. The lists are rebuilt from their declared keys —
     * `validated()` hands back each row whole — and a field that may not be
     * null is given its default on create and left alone on an edit.
     *
     * @return array<string, mixed>
     */
    public function modelData(): array
    {
        $data = collect($this->safe()->except(['faqs', 'seo', 'notify_registrants']))->all();
        $creating = $this->existing() === null;

        foreach (['starts_at', 'ends_at', 'registration_closes_at'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = self::parse($data[$key]);
            }
        }

        foreach (['title', 'summary', 'venue_name', 'venue_city', 'venue_address', 'map_url', 'online_url', 'external_url'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = filled($data[$key]) ? trim((string) $data[$key]) : null;
            }
        }

        if (array_key_exists('speakers', $data)) {
            $data['speakers'] = array_values(array_map(fn (array $row) => [
                'name' => trim((string) $row['name']),
                'role' => filled($row['role'] ?? null) ? trim((string) $row['role']) : null,
                'photo_path' => filled($row['photo_path'] ?? null) ? (string) $row['photo_path'] : null,
            ], $data['speakers'] ?? []));
        }

        if (array_key_exists('agenda', $data)) {
            $data['agenda'] = array_values(array_map(fn (array $row) => [
                'time' => filled($row['time'] ?? null) ? trim((string) $row['time']) : null,
                'title' => trim((string) $row['title']),
                'note' => filled($row['note'] ?? null) ? trim((string) $row['note']) : null,
            ], $data['agenda'] ?? []));
        }

        $defaults = [
            'status' => PublishStatus::Draft->value,
            'is_featured' => false,
            'registration_mode' => EventRegistrationMode::None->value,
            'waitlist_enabled' => false,
            'max_seats' => EventSettings::maxSeats(),
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
