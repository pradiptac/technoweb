<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\Industry;
use App\Models\Media;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use App\Models\User;
use App\Support\SvgSanitiser;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Structural reference data — the categories, solutions and services the site
 * navigation is built from. Safe to re-run; it does not create demo products.
 *
 * Slugs are set EXPLICITLY rather than derived from the title. Str::slug would
 * produce "enterprise-wi-fi", "it-infrastructure-amc" and "cctv-surveillance",
 * which are uglier, longer, and — critically — not what the frontend links to.
 * These values are the URL contract; changing one means adding a redirect.
 */
class CatalogueSeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['slug' => 'servers', 'name' => 'Servers', 'icon' => 'server'],
            ['slug' => 'switches', 'name' => 'Switches', 'icon' => 'switch'],
            ['slug' => 'routers', 'name' => 'Routers', 'icon' => 'router'],
            ['slug' => 'firewalls', 'name' => 'Firewalls', 'icon' => 'firewall'],
            ['slug' => 'wifi', 'name' => 'Wi-Fi', 'icon' => 'wifi'],
            ['slug' => 'storage', 'name' => 'Storage', 'icon' => 'storage'],
            ['slug' => 'ups-power', 'name' => 'UPS & power', 'icon' => 'power'],
            ['slug' => 'surveillance', 'name' => 'Surveillance', 'icon' => 'camera'],
            ['slug' => 'accessories', 'name' => 'Accessories', 'icon' => 'plug'],
        ];

        foreach ($categories as $i => $c) {
            ProductCategory::updateOrCreate(['slug' => $c['slug']], [...$c, 'sort_order' => $i]);
        }

        // Brand slugs are safe to derive — "HPE Aruba" becomes "hpe-aruba".
        //
        // The first eight are the original catalogue and stay featured, which
        // is the set a fresh install already showed before this list grew —
        // reseeding must not silently promote eighteen more brands onto
        // whatever reads that flag. Everything after them is a real brand
        // too, just not curated onto that shelf by default; an admin can
        // tick it.
        $featuredBrands = ['Cisco', 'Fortinet', 'HPE Aruba', 'Dell EMC', 'Sophos', 'Ubiquiti', 'Synology', 'APC'];

        $brands = [
            ...$featuredBrands,
            // Hardware — networking, storage and endpoint gear this
            // catalogue is built around.
            'TP-Link', 'NETGEAR', 'Juniper Networks', 'Palo Alto Networks', 'MikroTik',
            'SonicWall', 'QNAP', 'Lenovo', 'HP', 'NetApp', 'Poly',
            // Software — the licensed products a network integrator resells
            // and supports alongside the hardware.
            'VMware', 'Veeam', 'Citrix', 'Kaspersky', 'Trend Micro', 'Red Hat', 'Zoho',
        ];

        foreach ($brands as $i => $name) {
            $brand = Brand::updateOrCreate(
                ['slug' => str($name)->slug()->value()],
                ['name' => $name, 'sort_order' => $i, 'is_featured' => in_array($name, $featuredBrands, true)],
            );

            $this->applyRealLogo($brand);
        }

        $solutions = [
            ['slug' => 'networking', 'title' => 'Enterprise networking', 'icon' => 'network', 'summary' => 'Structured cabling, core and access switching, VLAN design and routing engineered for the way your teams actually move data.'],
            ['slug' => 'servers', 'title' => 'Server infrastructure', 'icon' => 'server', 'summary' => 'Physical and virtualised compute sized to the workload — domain services, line-of-business apps, hypervisor clusters.'],
            ['slug' => 'storage', 'title' => 'Storage & NAS', 'icon' => 'storage', 'summary' => 'Centralised storage with sane permissions, snapshots and capacity headroom.'],
            ['slug' => 'firewall', 'title' => 'Firewall & UTM', 'icon' => 'firewall', 'summary' => 'Next-gen firewall deployment, policy tuning, content filtering and site-to-site VPN.'],
            ['slug' => 'enterprise-wifi', 'title' => 'Enterprise Wi-Fi', 'icon' => 'wifi', 'summary' => 'Surveyed, controller-managed wireless built for density and roaming.'],
            ['slug' => 'backup', 'title' => 'Backup & recovery', 'icon' => 'backup', 'summary' => 'On-site and off-site backup with a documented, tested restore path.'],
            ['slug' => 'cybersecurity', 'title' => 'Cybersecurity', 'icon' => 'shield', 'summary' => 'Endpoint protection, patch discipline, access control and awareness training.'],
            ['slug' => 'surveillance', 'title' => 'CCTV & surveillance', 'icon' => 'camera', 'summary' => 'IP camera design, NVR storage planning and remote viewing.'],
            ['slug' => 'amc', 'title' => 'IT infrastructure AMC', 'icon' => 'tools', 'summary' => 'Annual maintenance with defined SLAs, preventive visits and an asset register.'],
        ];

        foreach ($solutions as $i => $s) {
            Solution::updateOrCreate(
                ['slug' => $s['slug']],
                [...$s, 'sort_order' => $i, 'status' => PublishStatus::Published],
            );
        }

        $services = [
            ['slug' => 'domains', 'title' => 'Domain registration', 'icon' => 'globe', 'summary' => 'Register, transfer and renew domains with DNS managed correctly from day one.'],
            ['slug' => 'web-hosting', 'title' => 'Web hosting', 'icon' => 'cloud', 'summary' => 'Linux and Windows hosting on managed infrastructure with backups and SSL included.'],
            ['slug' => 'business-email', 'title' => 'Business email', 'icon' => 'mail', 'summary' => 'Professional mailboxes on your own domain, with anti-spam, archiving and mobile sync.'],
            ['slug' => 'ssl', 'title' => 'SSL certificates', 'icon' => 'cert', 'summary' => 'DV, OV and wildcard certificates issued, installed and renewed before they expire.'],
            ['slug' => 'vps', 'title' => 'VPS & cloud servers', 'icon' => 'vps', 'summary' => 'Dedicated resources with root access for applications that have outgrown shared hosting.'],
            ['slug' => 'website-services', 'title' => 'Website services', 'icon' => 'code', 'summary' => 'Corporate websites, migrations and ongoing maintenance built on modern foundations.'],
        ];

        foreach ($services as $i => $s) {
            Service::updateOrCreate(
                ['slug' => $s['slug']],
                [...$s, 'sort_order' => $i, 'status' => PublishStatus::Published],
            );
        }

        $industries = [
            ['slug' => 'smb', 'name' => 'Small & mid-size business', 'icon' => 'shop', 'summary' => 'Right-sized infrastructure without enterprise overhead.'],
            ['slug' => 'healthcare', 'name' => 'Healthcare', 'icon' => 'health', 'summary' => 'Uptime, data protection and device segmentation.'],
            ['slug' => 'education', 'name' => 'Education', 'icon' => 'education', 'summary' => 'High-density Wi-Fi, content filtering and lab networks.'],
            ['slug' => 'manufacturing', 'name' => 'Manufacturing', 'icon' => 'factory', 'summary' => 'Shop-floor resilience and OT/IT separation.'],
            ['slug' => 'corporate', 'name' => 'Corporate', 'icon' => 'building', 'summary' => 'Multi-site connectivity and standardised builds.'],
            ['slug' => 'government', 'name' => 'Government', 'icon' => 'gov', 'summary' => 'Compliance-aware deployment and documentation.'],
        ];

        foreach ($industries as $i => $ind) {
            Industry::updateOrCreate(['slug' => $ind['slug']], [...$ind, 'sort_order' => $i]);
        }
    }

    /**
     * The real, vendored logo for a brand — never invented, only ever a file
     * this repository actually carries.
     *
     * This is the opposite case from `DemoContentSeeder::brandLogos()`, which
     * draws a text tile for a brand nobody has designed one for — placeholder
     * content that must be replaced before launch. A trademarked manufacturer
     * logo is the other kind of thing entirely: it is correct the day it is
     * written and stays correct, which is why it lives with the rest of the
     * structural brand data here rather than with the demo copy.
     *
     * **Refreshed only when the stored path is empty or is still this
     * seeder's own naming convention**, `media/seed/brands/{slug}.svg` — never
     * when it points anywhere else. An admin's own upload through the media
     * library always lands at a hashed filename under a different path, so
     * that comparison is enough to tell "nobody has touched this" from "this
     * has been touched" without a flag to maintain. Same rule
     * `DemoContentSeeder` follows for the placeholder this replaces: a real
     * choice made in the admin survives a reseed.
     *
     * Sanitised on the way to disk regardless of source, the rule
     * `MediaController` already follows for every upload — the file having
     * shipped in this repository is not a reason to trust its bytes any less
     * carefully than one a stranger just posted.
     */
    private function applyRealLogo(Brand $brand): void
    {
        $source = resource_path("brand-logos/{$brand->slug}.svg");

        if (! is_file($source)) {
            return;
        }

        $path = "media/seed/brands/{$brand->slug}.svg";

        if ($brand->logo_path !== null && $brand->logo_path !== $path) {
            return;
        }

        $svg = SvgSanitiser::clean(file_get_contents($source));

        if ($svg === null) {
            return;
        }

        Storage::disk('public')->put($path, $svg);

        Media::updateOrCreate(['path' => $path], [
            'uploaded_by' => User::orderBy('id')->value('id'),
            'disk' => 'public',
            'filename' => "{$brand->slug}.svg",
            'mime' => 'image/svg+xml',
            'size' => strlen($svg),
            // SVG has no intrinsic pixel size; the viewBox scales to fit —
            // the same reasoning SeedsPlaceholderImages::store() states.
            'width' => null,
            'height' => null,
            'alt_text' => $brand->name,
        ]);

        if ($brand->logo_path !== $path) {
            $brand->forceFill(['logo_path' => $path])->save();
        }
    }
}
