<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Media;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Placeholder services for the two categories `CatalogueSeeder` adds beside
 * Web services, so each tab of the Services section has something in it.
 *
 * **Placeholder content that must not ship** (CLAUDE.md): every word is
 * invented to make the tabs judgeable. **Create-only, keyed by slug** — a
 * service an editor rewrote, moved or deleted-and-recreated is never touched,
 * and one filed under another category stays there. A category that has been
 * deleted leaves its samples uncategorised rather than failing.
 *
 * **It also gives every seeded service a sample picture** (2026-09-29) —
 * the six web services `CatalogueSeeder` makes as well as these seven — so
 * the service cards and "Show service pictures as card backgrounds" can be
 * judged. `resources/service-images/{slug}.jpg` holds thirteen photographs
 * from Freepik's free catalogue, fetched through the Magnific connector
 * (never generated) and resized to 1600px wide; they are filed at
 * `media/seed/services/{slug}.jpg` on the client-logo rule — written only
 * while the service has no picture or still has the seeder's own, so an
 * editor's upload is never replaced. Placeholder imagery on the
 * must-not-ship list like the words beside it. **Licence**: Freepik's free
 * licence with attribution — "Designed by Freepik", www.freepik.com.
 */
class SampleServiceSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            'hardware-services' => [
                [
                    'slug' => 'laptop-desktop-repair',
                    'title' => 'Laptop and desktop repair',
                    'icon' => 'laptop',
                    'summary' => 'Diagnosis and repair of business laptops and desktops, on site or at our workshop.',
                    'body' => '<p>We diagnose the fault before we quote, replace failed drives, memory, screens, keyboards and power components with matched parts, and return the machine with your data and settings intact.</p><p>Machines under an annual maintenance contract get priority turnaround and a loan unit while theirs is on the bench.</p>',
                ],
                [
                    'slug' => 'server-hardware-support',
                    'title' => 'Server hardware support',
                    'icon' => 'server',
                    'summary' => 'Break-fix and preventive care for rack and tower servers, with parts sourced and fitted.',
                    'body' => '<p>We replace failed disks, power supplies, fans and memory in production servers, rebuild RAID arrays and update firmware in a planned window so the workload keeps running.</p><p>Preventive visits check logs, temperatures and warranty status before a small fault becomes an outage.</p>',
                ],
                [
                    'slug' => 'printer-peripheral-service',
                    'title' => 'Printer and peripheral service',
                    'icon' => 'printer',
                    'summary' => 'Servicing for office printers, scanners and the peripherals around them.',
                    'body' => '<p>We clear recurring jams, replace rollers, fusers and drums, and set printers and scanners up on the network with the right drivers and scan-to-email or scan-to-folder destinations.</p><p>Consumables can be tracked and reordered before a department runs out.</p>',
                ],
            ],
            'installation-services' => [
                [
                    'slug' => 'structured-network-cabling',
                    'title' => 'Structured network cabling',
                    'icon' => 'patch-panel',
                    'summary' => 'Copper and fibre cabling designed, installed, labelled and certified to standard.',
                    'body' => '<p>We plan cable routes and outlet positions with you, pull Cat6 and fibre, terminate onto patch panels and label every run end to end.</p><p>Each link is tested and certified, and the handover includes an as-built drawing and the test report.</p>',
                ],
                [
                    'slug' => 'cctv-installation',
                    'title' => 'CCTV installation',
                    'icon' => 'camera',
                    'summary' => 'IP cameras sited, mounted, cabled and recorded, with remote viewing set up.',
                    'body' => '<p>We survey the site for coverage and lighting, mount and aim the cameras, run PoE cabling and size the recorder for the retention you need.</p><p>Remote viewing is configured on the phones and desks that need it, with user access kept separate from administration.</p>',
                ],
                [
                    'slug' => 'wifi-installation',
                    'title' => 'Wi-Fi installation',
                    'icon' => 'wifi',
                    'summary' => 'Surveyed wireless networks installed for coverage, density and roaming.',
                    'body' => '<p>We survey the building, place and mount access points, and set up the controller with separate networks for staff, guests and devices.</p><p>A post-install walk test confirms coverage and roaming before we hand over.</p>',
                ],
                [
                    'slug' => 'server-rack-installation',
                    'title' => 'Server rack installation',
                    'icon' => 'rack',
                    'summary' => 'Racks assembled, equipment mounted and cabling dressed for a tidy, cool comms room.',
                    'body' => '<p>We assemble and level the rack, fit shelves, PDUs and cable management, and mount servers, switches and UPS units with front-to-back airflow in mind.</p><p>Patch leads are cut to length and labelled, so the rack stays readable as it grows.</p>',
                ],
            ],
        ];

        $order = (int) Service::max('sort_order') + 1;

        foreach ($groups as $categorySlug => $services) {
            $categoryId = ServiceCategory::where('slug', $categorySlug)->value('id');

            foreach ($services as $s) {
                Service::firstOrCreate(['slug' => $s['slug']], [
                    ...$s,
                    'service_category_id' => $categoryId,
                    'sort_order' => $order++,
                    'status' => PublishStatus::Published,
                ]);
            }
        }

        // Highlights for the samples, only while a service has none.
        foreach (self::HIGHLIGHTS as $slug => $list) {
            $service = Service::where('slug', $slug)->whereNull('highlights')->first();

            if ($service) {
                $service->highlights = $list;
                $service->save();
            }
        }

        foreach (self::PICTURES as $slug => $alt) {
            $service = Service::where('slug', $slug)->first();

            if ($service) {
                $this->applyPicture($service, $alt);
            }
        }
    }

    /** The placeholder chips on each sample's card. */
    private const HIGHLIGHTS = [
        'laptop-desktop-repair' => ['Laptops', 'Desktops', 'Data kept intact'],
        'server-hardware-support' => ['Dell', 'HPE', 'Lenovo', 'On site'],
        'printer-peripheral-service' => ['Laser', 'Inkjet', 'Multifunction'],
        'structured-network-cabling' => ['Cat6', 'Cat6A', 'Fibre', 'Certified'],
        'cctv-installation' => ['IP cameras', 'NVR', 'Remote viewing'],
        'wifi-installation' => ['Site survey', 'Wi-Fi 6', 'Guest networks'],
        'server-rack-installation' => ['Racks', 'UPS', 'Cable management'],
    ];

    /** Service slug => the picture's alt text. */
    private const PICTURES = [
        'domains' => 'A laptop showing a browser address bar',
        'web-hosting' => 'An engineer walking between server racks in a data centre',
        'business-email' => 'A man reading email on a laptop at an office desk',
        'ssl' => 'A hand holding a green padlock in front of a laptop keyboard',
        'vps' => 'An engineer updating servers from a workstation in a data centre',
        'website-services' => 'A developer writing code at a two-screen workstation',
        'laptop-desktop-repair' => 'A technician opening the back cover of a laptop on a workbench',
        'server-hardware-support' => 'An engineer in front of lit server cabinets',
        'printer-peripheral-service' => 'A printer on an office desk',
        'structured-network-cabling' => 'A network engineer working on a patch cabinet full of cables',
        'cctv-installation' => 'A CCTV dome camera mounted on a ceiling',
        'wifi-installation' => 'A network cable being plugged into a wireless router',
        'server-rack-installation' => 'A system administrator installing a storage unit in a server room',
    ];

    /**
     * A service's vendored sample picture, at `media/seed/services/{slug}.jpg`
     * — `CompanyProfileSeeder::applyClientLogo()`'s rule: skipped when the
     * file is missing, and never over a picture an editor chose.
     */
    private function applyPicture(Service $service, string $alt): void
    {
        $slug = $service->slug;
        $source = resource_path("service-images/{$slug}.jpg");

        if (! is_file($source)) {
            return;
        }

        $path = "media/seed/services/{$slug}.jpg";

        if ($service->image_path !== null && ! str_starts_with($service->image_path, "media/seed/services/{$slug}.")) {
            return;
        }

        $bytes = (string) file_get_contents($source);
        $size = getimagesize($source);

        Storage::disk('public')->put($path, $bytes);

        Media::updateOrCreate(['path' => $path], [
            'uploaded_by' => User::orderBy('id')->value('id'),
            'disk' => 'public',
            'filename' => "{$slug}.jpg",
            'mime' => 'image/jpeg',
            'size' => strlen($bytes),
            'width' => $size ? $size[0] : null,
            'height' => $size ? $size[1] : null,
            'alt_text' => $alt,
        ]);

        if ($service->image_path !== $path) {
            $service->forceFill(['image_path' => $path])->save();
        }
    }
}
