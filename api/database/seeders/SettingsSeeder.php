<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            ['group' => 'general', 'key' => 'company_name', 'value' => 'Technoware', 'type' => 'string'],
            ['group' => 'general', 'key' => 'tagline', 'value' => 'Technology infrastructure that keeps your business connected.', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'phone', 'value' => '+91 98765 43210', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'support_email', 'value' => 'support@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'sales_email', 'value' => 'sales@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'address', 'value' => '', 'type' => 'text'],
            ['group' => 'seo', 'key' => 'default_meta_description', 'value' => 'Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure.', 'type' => 'text'],
            ['group' => 'seo', 'key' => 'default_og_image', 'value' => '', 'type' => 'string'],
            ['group' => 'support', 'key' => 'portal_enabled', 'value' => '1', 'type' => 'boolean'],
        ];

        foreach ($settings as $s) {
            Setting::updateOrCreate(['key' => $s['key']], $s);
        }
    }
}
