<?php

namespace App\Enums;

use App\Models\Setting;

/**
 * How hard the library compresses the images it writes.
 *
 * **This applies to images this application *produces*, not to what is
 * uploaded.** An upload is stored byte-for-byte — re-encoding somebody's
 * original on the way in would throw away quality they cannot get back, and
 * the original is the one copy there is. What is re-encoded is every derived
 * image: a resize, a crop, a thumbnail, a rotate, a flip, an adjust. Saying
 * that plainly matters, because a quality setting people assume shrinks their
 * uploads is a setting that appears to do nothing.
 *
 * Two of the three numbers behave differently and the difference is worth
 * knowing before anyone drags the slider:
 *
 * - **JPEG and WebP are lossy.** The number is quality, 0-100, and it trades
 *   visible detail for bytes. This is what the preset is really for.
 * - **PNG is lossless.** Its number is a *compression effort*, 0-9, and it
 *   changes the file size and how long the encode takes — never how the image
 *   looks. So "Low" does not degrade a PNG; it just leaves it larger.
 *
 * The five steps are CKBox's vocabulary, kept deliberately: an editor choosing
 * between "Good" and "High" is making a judgement, and a percentage invites
 * them to believe there is a right answer to find.
 */
enum ImageQuality: string
{
    case Low = 'low';
    case Medium = 'medium';
    case Good = 'good';
    case High = 'high';
    case Best = 'best';

    public function label(): string
    {
        return match ($this) {
            self::Low => 'Low',
            self::Medium => 'Medium',
            self::Good => 'Good',
            self::High => 'High',
            self::Best => 'Best',
        };
    }

    /** One line for the console, saying what the choice actually costs. */
    public function description(): string
    {
        return match ($this) {
            self::Low => 'Smallest files, visibly softer. For thumbnails and anything decorative.',
            self::Medium => 'Noticeably smaller, slight softening on detailed photographs.',
            self::Good => 'The default. Hard to tell from the original at page sizes.',
            self::High => 'Larger files, no visible loss on photographs.',
            self::Best => 'Near-original. Use when an image is the point of the page.',
        };
    }

    /** JPEG and WebP quality, 0-100. Lossy: this is the one that shows. */
    public function lossy(): int
    {
        return match ($this) {
            self::Low => 55,
            self::Medium => 70,
            self::Good => 82,
            self::High => 90,
            self::Best => 96,
        };
    }

    /**
     * PNG compression effort, 0-9.
     *
     * Inverted against the others on purpose: PNG is lossless, so "best
     * quality" cannot mean a bigger number here — it means spending *less*
     * time squeezing, because there is no quality to buy with the effort. A
     * low setting compresses hardest, which is what somebody asking for small
     * files wants.
     */
    public function pngEffort(): int
    {
        return match ($this) {
            self::Low => 9,
            self::Medium => 8,
            self::Good => 6,
            self::High => 4,
            self::Best => 2,
        };
    }

    /**
     * The stored setting, or the default.
     *
     * Falls back rather than throwing, the same rule `mail_transport` follows:
     * a value that outlives the list that accepted it must not take the media
     * library down with it.
     */
    public static function current(): self
    {
        $stored = Setting::get('image_quality');

        return self::tryFrom((string) $stored) ?? self::Good;
    }

    /** @return array<int, array{value:string,label:string,description:string}> */
    public static function options(): array
    {
        return array_map(fn (self $q) => [
            'value' => $q->value,
            'label' => $q->label(),
            'description' => $q->description(),
        ], self::cases());
    }
}
