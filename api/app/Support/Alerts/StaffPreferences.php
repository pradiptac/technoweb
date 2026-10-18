<?php

namespace App\Support\Alerts;

use App\Models\StaffPreference;
use App\Models\User;

/** The one reader of a staff member's choices: the saved row, or the defaults unsaved. */
final class StaffPreferences
{
    public static function for(User $user): StaffPreference
    {
        $saved = $user->relationLoaded('staffPreference') ? $user->staffPreference : $user->staffPreference()->first();

        return $saved ?? new StaffPreference(['user_id' => $user->id, 'digest' => AlertSettings::defaultDigest()]);
    }
}
