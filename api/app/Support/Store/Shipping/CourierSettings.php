<?php

namespace App\Support\Store\Shipping;

use App\Models\Setting;

/**
 * The one reader of the `shiprocket` settings group (0.143.0, docs/store.md
 * "Shiprocket"): which way parcels are booked, and whether the integration
 * has what it needs.
 *
 * `store_courier_provider` is `manual` (the default — the hand-typed
 * courier and tracking number the console has always had) or `shiprocket`.
 * **`active()` is the single answer to "may anything be asked of the
 * platform"**: the provider is chosen *and* the sign-in and a pickup
 * location are saved. Anything short of that and no control is drawn, no
 * call is made and the order screen is exactly what it was — an install
 * that never opens this screen behaves as it always did.
 */
final class CourierSettings
{
    public const MANUAL = 'manual';

    public const SHIPROCKET = 'shiprocket';

    /** Parcel size, in whole centimetres, when a booking does not say. */
    public const DEFAULT_SIZE_CM = ['length' => 20, 'breadth' => 15, 'height' => 10];

    /** The shortest webhook token worth having; it is a shared secret, compared whole. */
    public const MIN_TOKEN = 16;

    /** @return list<array{value: string, label: string, description: string}> */
    public static function providers(): array
    {
        return [
            ['value' => self::MANUAL, 'label' => 'By hand', 'description' => 'You type the courier and tracking number on each order, as before. Nothing is asked of a courier platform.'],
            ['value' => self::SHIPROCKET, 'label' => 'Shiprocket', 'description' => 'Book the parcel from the order page, print the label and request pickup; the status comes back by itself.'],
        ];
    }

    /** The chosen provider; anything unrecognised reads as `manual`. */
    public static function provider(): string
    {
        return Setting::get('store_courier_provider') === self::SHIPROCKET ? self::SHIPROCKET : self::MANUAL;
    }

    public static function email(): string
    {
        return trim((string) Setting::get('shiprocket_email', ''));
    }

    public static function password(): string
    {
        return (string) Setting::get('shiprocket_password', '');
    }

    /** The pickup location's nickname, exactly as Shiprocket lists it. */
    public static function pickupLocation(): string
    {
        return trim((string) Setting::get('shiprocket_pickup_location', ''));
    }

    public static function webhookToken(): string
    {
        return (string) Setting::get('shiprocket_webhook_token', '');
    }

    /**
     * The default parcel, whole centimetres. A blank or nonsense row falls
     * back per side, so one bad value cannot make a booking impossible.
     *
     * @return array{length: int, breadth: int, height: int}
     */
    public static function parcel(): array
    {
        $size = [];

        foreach (self::DEFAULT_SIZE_CM as $side => $default) {
            $value = (string) Setting::get('shiprocket_parcel_'.$side, '');
            $size[$side] = ctype_digit($value) && (int) $value >= 1 ? min((int) $value, 300) : $default;
        }

        return $size;
    }

    /** What stands between this install and booking a parcel. Empty when nothing does. */
    public static function missing(): array
    {
        $missing = [];

        if (self::email() === '' || self::password() === '') {
            $missing[] = 'Save the Shiprocket API user\'s email and password.';
        }

        if (self::pickupLocation() === '') {
            $missing[] = 'Choose the pickup location.';
        }

        return $missing;
    }

    public static function active(): bool
    {
        return self::provider() === self::SHIPROCKET && self::missing() === [];
    }

    /**
     * Why a value cannot be saved, or null. The pickup location is one of
     * Shiprocket's own nicknames and is chosen from its list, so the check
     * is only that nothing odd got in.
     */
    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (blank($value)) {
            return null;
        }

        $value = (string) $value;

        return match ($key) {
            'store_courier_provider' => in_array($value, [self::MANUAL, self::SHIPROCKET], true) ? null : 'Choose one of the ways listed.',
            'shiprocket_email' => filter_var($value, FILTER_VALIDATE_EMAIL) !== false ? null : 'Enter the API user\'s email address.',
            'shiprocket_pickup_location' => mb_strlen($value) <= 80 ? null : 'That pickup location name is too long.',
            'shiprocket_parcel_length', 'shiprocket_parcel_breadth', 'shiprocket_parcel_height' => preg_match('/^\d{1,3}$/', $value) === 1 && (int) $value >= 1 && (int) $value <= 300
                ? null
                : 'Use a whole number of centimetres from 1 to 300.',
            'shiprocket_webhook_token' => mb_strlen($value) >= self::MIN_TOKEN && mb_strlen($value) <= 120 && preg_match('/^[\x21-\x7e]+$/', $value) === 1
                ? null
                : 'Use at least '.self::MIN_TOKEN.' letters and digits, with no spaces.',
            default => null,
        };
    }

    /** @return list<array{value: string, label: string, description?: string}>|null */
    public static function options(string $key): ?array
    {
        return $key === 'store_courier_provider' ? self::providers() : null;
    }
}
