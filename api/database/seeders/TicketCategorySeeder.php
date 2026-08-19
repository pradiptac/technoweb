<?php

namespace Database\Seeders;

use App\Models\TicketCategory;
use Illuminate\Database\Seeder;

class TicketCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['name' => 'Network / connectivity', 'default_sla_hours' => 4],
            ['name' => 'Server / storage', 'default_sla_hours' => 4],
            ['name' => 'Firewall / security', 'default_sla_hours' => 2],
            ['name' => 'Wi-Fi', 'default_sla_hours' => 8],
            ['name' => 'Email / hosting', 'default_sla_hours' => 8],
            ['name' => 'Hardware fault', 'default_sla_hours' => 8],
            ['name' => 'Backup / recovery', 'default_sla_hours' => 4],
            ['name' => 'CCTV / surveillance', 'default_sla_hours' => 24],
            ['name' => 'New request / change', 'default_sla_hours' => 24],
        ];

        foreach ($categories as $i => $c) {
            TicketCategory::updateOrCreate(
                ['slug' => str($c['name'])->slug()->value()],
                [...$c, 'sort_order' => $i, 'is_active' => true],
            );
        }
    }
}
