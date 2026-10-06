<?php

namespace Database\Seeders;

use App\Enums\EventFormat;
use App\Enums\EventRegistrationMode;
use App\Enums\PublishStatus;
use App\Models\Event;
use Database\Seeders\Concerns\SeedsPlaceholderImages;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Three placeholder events (0.118.0, `docs/events.md`), so the events pages
 * and the console's list have something to draw on a demo install: a
 * seminar that registers here with a capacity and a waiting list, a webinar,
 * and a trade-show stand whose registration is somebody else's.
 *
 * **Demo only, and create-only.** Called from `DemoSeeder` and nothing else:
 * an event is a claim that something is happening on a date, and a fresh
 * install must not announce one. The rows are made only while the table is
 * empty, so a re-seed never brings a deleted sample back beside a real
 * event, and every title says "Sample" — the must-not-ship list in CLAUDE.md.
 *
 * **Each cover is generated, never borrowed from the library.** The first
 * cut took the first three photographs it found, so on a library with real
 * uploads the sample seminar wore somebody's hosting banner and the trade
 * show a "We are hiring" graphic — placeholder content dressed in real
 * artwork reads as real content. `PlaceholderImage` draws one per event with
 * its title and its kind on it, filed in the media library at
 * `media/seed/events/{slug}.svg` like every other seeded picture, and it is
 * written **only while that event's `cover_image_path` is blank** — the rule
 * `DemoContentSeeder` follows for a brand's logo — so a real cover somebody
 * chose survives a re-seed.
 *
 * The dates are relative to the day of seeding, so the samples are upcoming
 * whenever the demo is looked at; the speaker, the venue and the join link
 * are invented, and the join link is an `example.com` address that opens
 * nothing.
 */
class SampleEventSeeder extends Seeder
{
    use SeedsPlaceholderImages;

    /** The three samples: slug => the kind printed on its cover. */
    public const COVERS = [
        'sample-network-refresh-seminar' => 'Seminar · sample',
        'sample-wifi-7-webinar' => 'Webinar · sample',
        'sample-trade-show' => 'Trade show · sample',
    ];

    public function run(): void
    {
        if (! Event::query()->exists()) {
            $this->create();
        }

        $this->covers();
    }

    /**
     * A generated cover for each sample that has none. Runs whether or not
     * the rows were made this time, so a sample whose cover was cleared gets
     * its own picture back — and never touches one that has a cover.
     */
    private function covers(): void
    {
        foreach (self::COVERS as $slug => $kind) {
            $event = Event::query()->where('slug', $slug)->first();

            if ($event === null || filled($event->cover_image_path)) {
                continue;
            }

            // Quietly: a placeholder picture is not an edit worth a ping or a
            // moved `updated_at`.
            $event->forceFill(['cover_image_path' => $this->tileImage($event->title, $kind, "events/{$slug}")])->saveQuietly();
        }
    }

    private function create(): void
    {
        $day = fn (int $days, int $hour, int $minute = 0) => Carbon::today()->addDays($days)->setTime($hour, $minute);

        Event::create([
            'title' => 'Sample seminar: planning an office network refresh',
            'slug' => 'sample-network-refresh-seminar',
            'summary' => 'A placeholder event. Ninety minutes on scoping a network refresh for a mid-sized office — replace or delete it.',
            'body' => '<p>This is sample content, here so the events pages can be judged before a real event is added. Replace it or delete it.</p>'
                .'<p>A real description says who the session is for, what they will leave knowing, and what to bring.</p>',
            'status' => PublishStatus::Published,
            'is_featured' => true,
            'format' => EventFormat::InPerson,
            'starts_at' => $day(21, 15),
            'ends_at' => $day(21, 16, 30),
            'venue_name' => 'Sample Experience Centre',
            'venue_city' => 'Mumbai',
            'venue_address' => "Unit 0, Sample Industrial Estate\nSample Road, Mumbai 400000",
            'speakers' => [
                ['name' => 'Sample Speaker', 'role' => 'Principal network engineer (placeholder)', 'photo_path' => null],
            ],
            'agenda' => [
                ['time' => '3:00 pm', 'title' => 'What a refresh is for', 'note' => 'Placeholder agenda line.'],
                ['time' => '3:40 pm', 'title' => 'Scoping it without over-buying', 'note' => null],
                ['time' => '4:10 pm', 'title' => 'Questions', 'note' => null],
            ],
            'registration_mode' => EventRegistrationMode::Open,
            'capacity' => 40,
            'waitlist_enabled' => true,
            'max_seats' => 5,
            'registration_closes_at' => $day(20, 18),
        ]);

        Event::create([
            'title' => 'Sample webinar: Wi-Fi 7, in plain terms',
            'slug' => 'sample-wifi-7-webinar',
            'summary' => 'A placeholder webinar. Forty-five minutes on what Wi-Fi 7 changes and what it does not — replace or delete it.',
            'body' => '<p>This is sample content. Replace it or delete it.</p>',
            'status' => PublishStatus::Published,
            'format' => EventFormat::Online,
            'starts_at' => $day(35, 11),
            'ends_at' => $day(35, 11, 45),
            // An address that opens nothing. A real event's join link goes
            // here and is sent only to people who register.
            'online_url' => 'https://meet.example.com/sample-webinar',
            'speakers' => [
                ['name' => 'Sample Speaker', 'role' => 'Wireless specialist (placeholder)', 'photo_path' => null],
            ],
            'agenda' => [],
            'registration_mode' => EventRegistrationMode::Open,
            'max_seats' => 1,
        ]);

        Event::create([
            'title' => 'Sample trade show: visit our stand',
            'slug' => 'sample-trade-show',
            'summary' => 'A placeholder announcement of a stand at a trade show, with registration on the organiser\'s own site — replace or delete it.',
            'body' => '<p>This is sample content. Replace it or delete it.</p>',
            'status' => PublishStatus::Published,
            'format' => EventFormat::InPerson,
            'starts_at' => $day(60, 10),
            'ends_at' => $day(62, 18),
            'venue_name' => 'Sample Exhibition Centre, Hall 0',
            'venue_city' => 'Bengaluru',
            'speakers' => [],
            'agenda' => [],
            'registration_mode' => EventRegistrationMode::External,
            'external_url' => 'https://www.example.com/register',
        ]);
    }
}
