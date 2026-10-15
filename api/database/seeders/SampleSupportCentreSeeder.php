<?php

namespace Database\Seeders;

use App\Models\SupportCentre;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * A sample support network (0.170.0, docs/support-network.md), demo only:
 * three centres so `/support-network` and its map can be judged before the
 * real ones are entered.
 *
 * **Every row is a placeholder and says so** — the names begin "Sample", the
 * addresses and numbers are invented, and no staff are tagged. Listed on the
 * must-not-ship list in CLAUDE.md; delete them before launch. Created only
 * while there are no centres at all, so a re-seed never puts a deleted
 * sample back beside real ones.
 */
class SampleSupportCentreSeeder extends Seeder
{
    public function run(): void
    {
        if (SupportCentre::query()->exists()) {
            return;
        }

        $rows = [
            ['Sample Kolkata Service Centre', 'service_centre', 'IN', 'West Bengal', 'Kolkata', "4th floor, Sample House\n12 Park Street", '+91 33 0000 0001', 22.5530, 88.3520],
            ['Sample Mumbai Office', 'office', 'IN', 'Maharashtra', 'Mumbai', 'Sample Tower, Andheri East', '+91 22 0000 0002', 19.1136, 72.8697],
            ['Sample Bengaluru Partner', 'partner', 'IN', 'Karnataka', 'Bengaluru', 'Sample Arcade, Koramangala', '+91 80 0000 0003', 12.9352, 77.6245],
        ];
        foreach ($rows as $i => [$name, $kind, $country, $region, $city, $address, $phone, $lat, $lng]) {
            SupportCentre::create([
                'name' => $name, 'slug' => Str::slug($name), 'kind' => $kind,
                'country_code' => $country, 'region' => $region, 'city' => $city, 'address' => $address,
                'phone' => $phone, 'email' => null, 'hours' => 'Mon–Sat, 9:30 am – 6:30 pm',
                'latitude' => $lat, 'longitude' => $lng, 'sort_order' => $i, 'is_active' => true,
            ]);
        }
    }
}
