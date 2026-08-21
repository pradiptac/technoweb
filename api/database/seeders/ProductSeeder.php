<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Brand;
use App\Models\Product;
use App\Models\ProductCategory;
use Database\Seeders\Concerns\SeedsPlaceholderImages;
use Illuminate\Database\Seeder;

/**
 * Demo catalogue.
 *
 * The models and headline specifications are real, publicly-published figures,
 * because a catalogue full of invented hardware is useless for judging whether
 * the layouts work — column widths, spec-table depth and name lengths all
 * matter. Prices are deliberately absent: the brief scopes this as a catalogue
 * with "Request information" CTAs, not a shop.
 *
 * The imagery is generated placeholder artwork, not product photography.
 * See the "must not ship" list in CLAUDE.md.
 */
class ProductSeeder extends Seeder
{
    use SeedsPlaceholderImages;

    public function run(): void
    {
        $categories = ProductCategory::pluck('id', 'slug');
        $brands = Brand::pluck('id', 'slug');

        foreach ($this->products() as $i => $p) {
            $slug = $p['slug'];

            $product = Product::updateOrCreate(['slug' => $slug], [
                'product_category_id' => $categories[$p['category']] ?? null,
                'brand_id' => $brands[$p['brand']] ?? null,
                'name' => $p['name'],
                'sku' => $p['sku'],
                'short_description' => $p['short'],
                'description' => $p['description'],
                'specifications' => $p['specs'],
                'features' => $p['features'],
                'status' => PublishStatus::Published,
                'sort_order' => $i,
            ]);

            $image = $this->tileImage($product->name, $p['category'], "products/{$slug}");
            $product->forceFill(['images' => [$image]])->save();
        }
    }

    private function products(): array
    {
        return [
            [
                'slug' => 'cisco-cbs350-24t-4g', 'category' => 'switches', 'brand' => 'cisco',
                'name' => 'Catalyst CBS350-24T-4G', 'sku' => 'CBS350-24T-4G',
                'short' => '24-port Gigabit managed switch with 4 SFP uplinks.',
                'description' => '<p>A managed access switch for wiring closets that need Layer 3 lite, static routing and proper VLAN support without a full enterprise licence.</p><p>Fanless, so it is quiet enough for a comms cupboard next to an office.</p>',
                'specs' => ['Ports' => '24 × 10/100/1000', 'Uplinks' => '4 × 1G SFP', 'Switching capacity' => '56 Gbps', 'Rack units' => '1U', 'PoE' => 'No', 'Warranty' => 'Limited lifetime'],
                'features' => ['Layer 3 lite static routing', '802.1X port authentication', 'Rack-mount, fanless', 'Limited lifetime warranty'],
            ],
            [
                'slug' => 'cisco-cbs350-24p-4g', 'category' => 'switches', 'brand' => 'cisco',
                'name' => 'Catalyst CBS350-24P-4G', 'sku' => 'CBS350-24P-4G',
                'short' => 'The PoE+ variant — 195 W budget for APs, phones and cameras.',
                'description' => '<p>Identical to the CBS350-24T other than power: 24 PoE+ ports sharing a 195 W budget, which comfortably runs a floor of access points or a mixed phone and camera deployment.</p><h2>Sizing the budget</h2><p>Budget 15 W per Wi-Fi 6 access point and 7 W per desk phone, then leave a third spare — PoE budgets get consumed faster than anyone plans for.</p>',
                'specs' => ['Ports' => '24 × 10/100/1000 PoE+', 'PoE budget' => '195 W', 'Uplinks' => '4 × 1G SFP', 'Switching capacity' => '56 Gbps', 'Rack units' => '1U'],
                'features' => ['195 W PoE+ budget', 'Per-port power limits and scheduling', 'Layer 3 lite static routing', 'Rack-mount'],
            ],
            [
                'slug' => 'aruba-6100-48g', 'category' => 'switches', 'brand' => 'hpe-aruba',
                'name' => '6100 48G Switch', 'sku' => 'JL676A',
                'short' => '48-port Gigabit switch with 4 SFP+ 10G uplinks.',
                'description' => '<p>A denser access switch for floors that have outgrown 24 ports, with 10G uplinks so the trunk back to the core is not the bottleneck.</p>',
                'specs' => ['Ports' => '48 × 10/100/1000', 'Uplinks' => '4 × 10G SFP+', 'Switching capacity' => '176 Gbps', 'Rack units' => '1U', 'Stacking' => 'No'],
                'features' => ['10G SFP+ uplinks', 'Cloud-managed via Aruba Central', 'Fanless on the 24-port model', 'Limited lifetime warranty'],
            ],
            [
                'slug' => 'fortigate-60f', 'category' => 'firewalls', 'brand' => 'fortinet',
                'name' => 'FortiGate 60F', 'sku' => 'FG-60F',
                'short' => 'Desktop next-gen firewall for a single site up to about 50 users.',
                'description' => '<p>The workhorse for a single-office deployment: next-gen inspection, SD-WAN, and enough IPsec throughput for branch-to-head-office tunnels.</p><h2>Where it runs out</h2><p>Threat protection throughput is the number that matters, not firewall throughput — full inspection costs roughly nine-tenths of the headline figure.</p>',
                'specs' => ['Firewall throughput' => '10 Gbps', 'Threat protection' => '700 Mbps', 'IPsec VPN' => '6.5 Gbps', 'Interfaces' => '10 × GE RJ45', 'Form factor' => 'Desktop'],
                'features' => ['Next-gen inspection with SSL', 'SD-WAN and site-to-site VPN', 'Web and application filtering', 'Central FortiManager support'],
            ],
            [
                'slug' => 'sophos-xgs-2100', 'category' => 'firewalls', 'brand' => 'sophos',
                'name' => 'XGS 2100', 'sku' => 'XGS-2100',
                'short' => '1U firewall with a dedicated inspection processor.',
                'description' => '<p>For sites where TLS inspection is a requirement rather than an aspiration — the Xstream flow processor keeps throughput up while it is on.</p>',
                'specs' => ['Firewall throughput' => '13.5 Gbps', 'Threat protection' => '1.5 Gbps', 'TLS inspection' => '900 Mbps', 'Interfaces' => '8 × GE copper', 'Rack units' => '1U'],
                'features' => ['Xstream TLS inspection', 'Synchronized Security with endpoints', 'Zero-touch deployment', 'High-availability pairing'],
            ],
            [
                'slug' => 'unifi-u6-pro', 'category' => 'wifi', 'brand' => 'ubiquiti',
                'name' => 'UniFi U6 Pro', 'sku' => 'U6-PRO',
                'short' => 'Wi-Fi 6 access point for medium-density indoor coverage.',
                'description' => '<p>A sensible default for offices and classrooms. Powered over Ethernet, ceiling-mounted, managed from the same controller as the rest of the UniFi estate.</p><h2>Density, not range</h2><p>Access points are usually added for capacity rather than coverage. Two APs at lower power beat one at maximum power in nearly every room with people in it.</p>',
                'specs' => ['Standard' => 'Wi-Fi 6 (802.11ax)', 'Radios' => '2.4 GHz 2×2, 5 GHz 4×4', 'Throughput' => '4.8 Gbps aggregate', 'Power' => 'PoE+ (802.3at)', 'Clients' => '300+'],
                'features' => ['Wi-Fi 6 with OFDMA and MU-MIMO', 'Ceiling or wall mount', 'Powered over Ethernet', 'Managed in UniFi Network'],
            ],
            [
                'slug' => 'synology-rs1221plus', 'category' => 'storage', 'brand' => 'synology',
                'name' => 'RackStation RS1221+', 'sku' => 'RS1221+',
                'short' => '8-bay rackmount NAS for shared storage and backup targets.',
                'description' => '<p>Eight bays in 1U, which is the practical sweet spot for a small server room: enough capacity for file shares and a backup target without moving to a full SAN.</p>',
                'specs' => ['Bays' => '8 × 3.5"/2.5" SATA', 'CPU' => 'AMD Ryzen V1500B quad-core', 'Memory' => '4 GB DDR4 ECC, to 32 GB', 'Network' => '4 × 1GbE', 'Rack units' => '1U'],
                'features' => ['Btrfs with snapshots', 'Active Backup for Business included', 'Hot-swappable drive bays', 'Expandable with RX418'],
            ],
            [
                'slug' => 'dell-poweredge-r550', 'category' => 'servers', 'brand' => 'dell-emc',
                'name' => 'PowerEdge R550', 'sku' => 'PE-R550',
                'short' => '2U dual-socket server for virtualisation and line-of-business apps.',
                'description' => '<p>A general-purpose host with room to grow: dual sockets, plenty of DIMM slots and enough drive bays that storage is not the first thing to run out.</p>',
                'specs' => ['CPU' => 'Up to 2 × Intel Xeon Scalable (3rd gen)', 'Memory' => '16 DIMM slots, to 1 TB', 'Drives' => 'Up to 8 × 3.5" or 16 × 2.5"', 'RAID' => 'PERC H755', 'Rack units' => '2U'],
                'features' => ['Dual-socket, 2U', 'iDRAC9 out-of-band management', 'Redundant hot-plug PSUs', 'ProSupport options'],
            ],
            [
                'slug' => 'apc-smart-ups-srt-3000', 'category' => 'ups-power', 'brand' => 'apc',
                'name' => 'Smart-UPS SRT 3000VA', 'sku' => 'SRT3000RMXLI',
                'short' => 'Double-conversion online UPS with a true 2700 W output.',
                'description' => '<p>Online rather than line-interactive, so the load is always running off the inverter and a transfer never happens.</p><h2>VA is not watts</h2><p>Size against the watt figure, not the VA. A 3000 VA unit at 0.9 power factor delivers 2700 W — and cheaper units are often nearer 0.6.</p>',
                'specs' => ['Capacity' => '3000 VA / 2700 W', 'Topology' => 'Double-conversion online', 'Runtime at half load' => '~13 min', 'Rack units' => '2U', 'Network card' => 'Optional AP9631'],
                'features' => ['True online double conversion', 'Rack or tower mounting', 'Hot-swappable batteries', 'Network management card slot'],
            ],
            [
                'slug' => 'cisco-isr-1111x-8p', 'category' => 'routers', 'brand' => 'cisco',
                'name' => 'ISR 1111X-8P', 'sku' => 'C1111X-8P',
                'short' => 'Branch router with 8 managed LAN ports and dual WAN.',
                'description' => '<p>Where a branch needs real routing rather than a firewall pretending to be one — dual WAN for a failover circuit, and enough LAN ports to skip a switch at the smallest sites.</p>',
                'specs' => ['WAN' => '2 × GE (1 SFP combo)', 'LAN' => '8 × GE managed', 'Throughput' => 'Up to 1 Gbps', 'VPN' => 'IPsec, DMVPN', 'Form factor' => 'Desktop / rack'],
                'features' => ['Dual WAN with failover', 'SD-WAN capable', 'IOS-XE', 'Optional LTE module'],
            ],
        ];
    }
}
