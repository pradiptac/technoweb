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
            // The homepage hero. These were hardcoded in the frontend, which
            // meant the invented figures on the must-not-ship list could only
            // be corrected by a developer. Group 'homepage' is public.
            ['group' => 'homepage', 'key' => 'hero_kicker', 'value' => 'Networking · Servers · Security · Surveillance', 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'hero_heading', 'value' => 'Technology infrastructure that keeps your business connected.', 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'hero_lede', 'value' => 'We design, deploy and support the networks, servers and security systems your operations run on — engineered properly the first time, then maintained by a support desk that actually answers.', 'type' => 'text'],
            // Four "value|label" pairs, one per line. A pair per line rather
            // than four settings each, because they are edited together and
            // an editor should be able to drop one without leaving a gap.
            ['group' => 'homepage', 'key' => 'hero_stats', 'value' => '16 yrs|In the field
340+|Sites under AMC
< 4 hrs|First response SLA
99.9%|Managed uptime', 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'support_stats', 'value' => '< 4h|First response
24/7|Critical escalation
96%|Resolved in SLA
340+|Sites covered', 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'testimonial_quote', 'value' => null, 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'testimonial_author', 'value' => null, 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'testimonial_role', 'value' => null, 'type' => 'string'],

            ['group' => 'contact', 'key' => 'phone', 'value' => '+91 98765 43210', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'support_email', 'value' => 'support@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'sales_email', 'value' => 'sales@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'address', 'value' => '', 'type' => 'text'],
            ['group' => 'seo', 'key' => 'default_meta_description', 'value' => 'Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure.', 'type' => 'text'],
            ['group' => 'seo', 'key' => 'default_og_image', 'value' => '', 'type' => 'string'],
            ['group' => 'support', 'key' => 'portal_enabled', 'value' => '1', 'type' => 'boolean'],

            // Social profiles. Seeded empty on purpose — a blank value hides
            // the icon, so the footer never links to a profile that does not
            // exist yet. Fill these in from Settings in the admin.
            ['group' => 'social', 'key' => 'social_linkedin', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_facebook', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_x', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_instagram', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_youtube', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_whatsapp', 'value' => null, 'type' => 'string'],
        ];

        foreach ($settings as $s) {
            // Create what is missing; never touch a value that already exists.
            //
            // This was updateOrCreate() with the value included, which meant
            // re-running the seeder silently overwrote everything an
            // administrator had entered — the phone number, the support
            // address, the social URLs, the homepage copy — with the defaults
            // below. Adding one new setting cost you all the others.
            //
            // group and type are structural rather than content, so those are
            // kept current on an existing row.
            $existing = Setting::where('key', $s['key'])->first();

            if ($existing) {
                $existing->forceFill(['group' => $s['group'], 'type' => $s['type']])->save();

                continue;
            }

            Setting::create($s);
        }
    }
}
