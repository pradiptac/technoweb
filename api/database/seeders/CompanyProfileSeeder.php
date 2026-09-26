<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\Certification;
use App\Models\Client;
use App\Models\Industry;
use App\Models\Media;
use App\Models\TeamMember;
use App\Models\User;
use Database\Seeders\Concerns\SeedsPlaceholderImages;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * A worked company profile — three certifications, six clients, four team
 * members — so the pages have something on them the day they exist.
 *
 * **Every row here is placeholder content and must not ship** (see CLAUDE.md,
 * "Known risks and placeholders"): invented certificate numbers, fictitious
 * client names, made-up people. It is here so the layouts can be judged and
 * the admin screens have rows to open.
 *
 * **Creates, never overwrites.** Each table is seeded only while it is empty:
 * an editor who has replaced the placeholders with the real team must not
 * find them back after a re-seed, and an editor who deleted a row must not
 * find it resurrected — the rule `BlogPostSeeder` follows. The partner tiers
 * on two brands are set only where the column is still null, so a tier an
 * editor cleared stays cleared.
 *
 * The one thing refreshed on every run is a client's **sample logo** — six
 * colourful marks under `resources/client-logos/`, fetched from Freepik's
 * free catalogue on 2026-09-21 (Freepik licence, attribution: "Designed by
 * Freepik", www.freepik.com) so the clients wall and the "Trusted by" strip
 * are not six identical grey tiles. They follow `CatalogueSeeder::applyRealLogo()`'s
 * rule exactly: written only while the stored path is empty or still this
 * seeder's own (`media/seed/clients/{slug}.*`), never over a logo an editor
 * uploaded, which lands at a hashed name under a different path.
 */
class CompanyProfileSeeder extends Seeder
{
    use SeedsPlaceholderImages;

    public function run(): void
    {
        $this->certifications();
        $this->clients();
        Client::query()->each(fn (Client $client) => $this->applyClientLogo($client));
        $this->team();
        $this->partners();
    }

    private function certifications(): void
    {
        if (Certification::query()->exists()) {
            return;
        }

        $rows = [
            ['name' => 'ISO 9001:2015', 'issuer' => 'TÜV SÜD', 'certificate_number' => 'QM 09 1234 567', 'issued_on' => '2024-03-14', 'valid_until' => '2027-03-13',
                'description' => 'Quality management for the supply, installation and support of IT infrastructure.'],
            ['name' => 'ISO/IEC 27001:2022', 'issuer' => 'BSI', 'certificate_number' => 'IS 789012', 'issued_on' => '2024-09-02', 'valid_until' => '2027-09-01',
                'description' => 'Information security management across the support desk and every customer site we hold credentials for.'],
            ['name' => 'MSME Udyam registration', 'issuer' => 'Ministry of MSME, Government of India', 'certificate_number' => 'UDYAM-WB-10-0001234', 'issued_on' => '2021-07-01', 'valid_until' => null,
                'description' => 'Registered as a micro, small and medium enterprise.'],
        ];

        foreach ($rows as $i => $row) {
            Certification::create($row + [
                // Portrait: a certificate is a sheet of paper, and the site draws it 3:4.
                'image_path' => $this->portraitImage($row['name'], 'Certified', 'certifications/'.str($row['name'])->slug()),
                'status' => PublishStatus::Published,
                'sort_order' => $i,
            ]);
        }
    }

    private function clients(): void
    {
        if (Client::query()->exists()) {
            return;
        }

        $industry = fn (string $slug) => Industry::where('slug', $slug)->value('id');

        $rows = [
            ['name' => 'Meridian Foods', 'industry' => 'manufacturing', 'note' => 'Plant-wide network and CCTV across two sites.', 'featured' => true],
            ['name' => 'Kestrel Logistics', 'industry' => 'corporate', 'note' => 'Warehouse Wi-Fi and a managed firewall.', 'featured' => true],
            ['name' => 'Harbour Dental Group', 'industry' => 'healthcare', 'note' => 'Segmented clinic network with an AMC.', 'featured' => true],
            ['name' => 'Northgate Academy', 'industry' => 'education', 'note' => 'Campus switching and 400 classroom endpoints.', 'featured' => true],
            ['name' => 'Saltwater Studios', 'industry' => 'smb', 'note' => 'NAS, backup and desktop support.', 'featured' => false],
            ['name' => 'Ridgeview Municipal Works', 'industry' => 'government', 'note' => 'Surveillance and access control for a depot.', 'featured' => false],
        ];

        foreach ($rows as $i => $row) {
            Client::create([
                'name' => $row['name'],
                'logo_path' => $this->tileImage($row['name'], 'Client', 'clients/'.str($row['name'])->slug()),
                'industry_id' => $industry($row['industry']),
                'note' => $row['note'],
                'is_featured' => $row['featured'],
                'status' => PublishStatus::Published,
                'sort_order' => $i,
            ]);
        }
    }

    /**
     * A client's vendored sample logo, at `media/seed/clients/{slug}.png`.
     *
     * A PNG rather than the SVG the brands ship, because the source is
     * Freepik's rendered vector — a raster with a transparent background,
     * 800px square — and a raster carries its own dimensions, which the
     * media row records so the wall can reserve the box. Not run through the
     * SVG sanitiser for the same reason; the bytes are what wrote them.
     */
    private function applyClientLogo(Client $client): void
    {
        $slug = str($client->name)->slug()->toString();
        $source = resource_path("client-logos/{$slug}.png");

        if (! is_file($source)) {
            return;
        }

        $path = "media/seed/clients/{$slug}.png";

        if ($client->logo_path !== null && ! str_starts_with($client->logo_path, "media/seed/clients/{$slug}.")) {
            return;
        }

        $bytes = (string) file_get_contents($source);
        $size = getimagesize($source);

        Storage::disk('public')->put($path, $bytes);

        Media::updateOrCreate(['path' => $path], [
            'uploaded_by' => User::orderBy('id')->value('id'),
            'disk' => 'public',
            'filename' => "{$slug}.png",
            'mime' => 'image/png',
            'size' => strlen($bytes),
            'width' => $size ? $size[0] : null,
            'height' => $size ? $size[1] : null,
            'alt_text' => $client->name,
        ]);

        if ($client->logo_path !== $path) {
            $client->forceFill(['logo_path' => $path])->save();
        }
    }

    private function team(): void
    {
        if (TeamMember::query()->exists()) {
            $this->redrawTeamPlaceholders();

            return;
        }

        $rows = [
            ['name' => 'Arjun Mehta', 'designation' => 'Founder & Principal Engineer', 'department' => 'Engineering',
                'bio' => 'Designs the networks and still racks the odd switch. Sixteen years across enterprise campuses and small offices alike.',
                'certifications' => [
                    ['name' => 'CCNP Enterprise', 'issuer' => 'Cisco', 'issued_on' => '2022-05-10', 'expires_on' => '2025-05-10'],
                    ['name' => 'Fortinet NSE 7', 'issuer' => 'Fortinet', 'issued_on' => '2024-01-20', 'expires_on' => '2027-01-20'],
                ]],
            ['name' => 'Priya Nair', 'designation' => 'Network Engineer', 'department' => 'Engineering',
                'bio' => 'Wi-Fi surveys, VLAN design and the as-built documentation that goes with them.',
                'certifications' => [
                    ['name' => 'CCNA', 'issuer' => 'Cisco', 'issued_on' => '2023-08-01', 'expires_on' => '2027-08-01'],
                    ['name' => 'HPE Aruba ACMP', 'issuer' => 'HPE Aruba', 'issued_on' => '2024-11-12', 'expires_on' => null],
                ]],
            ['name' => 'Rohan Das', 'designation' => 'Support Desk Lead', 'department' => 'Support desk',
                'bio' => 'First voice on the support line, and the one who decides what gets escalated.',
                'certifications' => [
                    ['name' => 'CompTIA Network+', 'issuer' => 'CompTIA', 'issued_on' => '2023-02-15', 'expires_on' => '2027-02-15'],
                ]],
            ['name' => 'Sneha Banerjee', 'designation' => 'Field Engineer', 'department' => 'Support desk',
                'bio' => 'On-site installations, cabling certification and the camera work.',
                'certifications' => [
                    ['name' => 'Hikvision HCSA', 'issuer' => 'Hikvision', 'issued_on' => '2024-06-30', 'expires_on' => null],
                ]],
        ];

        foreach ($rows as $i => $row) {
            $member = TeamMember::create([
                'name' => $row['name'],
                'designation' => $row['designation'],
                'department' => $row['department'],
                // The name as the tile's title: it is also what the library records
                // as the alt text, and "AM" is no description of a photograph.
                // Portrait, because the card draws a 4:5 well: a landscape tile
                // cropped to it cut the role and name off at the left edge.
                'photo_path' => $this->portraitImage($row['name'], $row['designation'], 'team/'.str($row['name'])->slug()),
                'bio' => $row['bio'],
                'status' => PublishStatus::Published,
                'sort_order' => $i,
            ]);

            foreach ($row['certifications'] as $n => $cert) {
                $member->certifications()->create($cert + ['sort_order' => $n]);
            }
        }
    }

    /**
     * Redraws a member's placeholder as a portrait — only while the photo is
     * still this seeder's own `media/seed/team/<slug>.svg`.
     *
     * The first seeds were landscape tiles with the role and name drawn at
     * the left, and the team card's 4:5 crop cut both off (the client saw
     * "RINCIPAL ENGINEER" on 2026-09-24). The stored path is the
     * discriminator, the brand-logo rule: an uploaded photo has another path
     * and is never touched. The path does not change and the team resource
     * does not version its URL, so a browser holding the old tile keeps it
     * until its cache turns over — acceptable for placeholder art that is on
     * the must-not-ship list anyway.
     */
    private function redrawTeamPlaceholders(): void
    {
        foreach (TeamMember::query()->get() as $member) {
            $key = 'team/'.str($member->name)->slug();

            if ($member->photo_path !== "media/seed/{$key}.svg") {
                continue;
            }

            $this->portraitImage($member->name, (string) $member->designation, $key);
        }
    }

    /**
     * Two vendor partnerships, on brands that already exist. `whereNull` so a
     * tier an editor cleared is not re-applied: this is the one seeded claim
     * about a third party, and it belongs on the must-not-ship list.
     */
    private function partners(): void
    {
        $tiers = ['cisco' => 'Select Partner', 'fortinet' => 'Advanced Partner'];

        foreach ($tiers as $slug => $tier) {
            Brand::where('slug', $slug)->whereNull('partner_tier')->update(['partner_tier' => $tier]);
        }
    }
}
