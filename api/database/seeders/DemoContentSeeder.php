<?php

namespace Database\Seeders;

use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\Service;
use App\Models\Setting;
use App\Models\Solution;
use Database\Seeders\Concerns\SeedsPlaceholderImages;
use Illuminate\Database\Seeder;

/**
 * Fills in the body content the structural seeders leave empty — solution
 * overviews and benefits, service and industry copy, FAQs, and cover imagery
 * across the site.
 *
 * Kept apart from CatalogueSeeder deliberately. That file is structural
 * reference data the site needs to function; this is demo copy written to
 * make the layouts judgeable, and all of it must be replaced before launch.
 * See the "must not ship" list in CLAUDE.md.
 *
 * Idempotent: it only fills gaps and refreshes its own generated images, so
 * re-running never overwrites something an editor has since written.
 */
class DemoContentSeeder extends Seeder
{
    use SeedsPlaceholderImages;

    public function run(): void
    {
        $this->solutions();
        $this->services();
        $this->industries();
        $this->covers();
        $this->brandLogos();
        $this->socialLinks();
    }

    /**
     * A wordmark per brand, so the brand filter and the admin list are not a
     * row of empty squares.
     *
     * Square rather than a banner: these render in a 36px box in the admin and
     * as a small chip on the catalogue, and a 1200x630 banner scaled into that
     * is illegible. Only fills a blank, so a real logo uploaded in the admin
     * survives a re-run.
     */
    private function brandLogos(): void
    {
        foreach (Brand::whereNull('logo_path')->get() as $brand) {
            $brand->forceFill([
                'logo_path' => $this->tileImage($brand->name, 'Brand', "brands/{$brand->slug}"),
            ])->save();
        }
    }

    /**
     * Sample social profile URLs, so the footer icon row is visible in a demo.
     *
     * These are invented and almost certainly point at somebody else's
     * account. SettingsSeeder deliberately seeds them null — an icon linking
     * to a profile that is not the client's is worse than no icon — so they
     * live here with the rest of the content that must be replaced or cleared
     * before launch.
     *
     * Only fills a blank value, so a real URL entered in the admin survives a
     * re-run.
     */
    private function socialLinks(): void
    {
        $samples = [
            'social_linkedin' => 'https://www.linkedin.com/company/technoware',
            'social_x' => 'https://x.com/technoware',
            'social_whatsapp' => 'https://wa.me/919876543210',
        ];

        foreach ($samples as $key => $url) {
            Setting::where('key', $key)->whereNull('value')->update(['value' => $url]);
        }
    }

    private function solutions(): void
    {
        foreach ($this->solutionContent() as $slug => $content) {
            $solution = Solution::where('slug', $slug)->first();
            if (! $solution) {
                continue;
            }

            // The artwork is derived, so it is always rewritten — that is how a
            // fix to the generator reaches images that already exist. The
            // database field is still only filled when empty, so an editor's
            // own choice of image is never overwritten.
            $generated = $this->bannerImage($solution->title, 'Solution', "solutions/{$slug}");

            $solution->forceFill([
                'problem_statement' => $solution->problem_statement ?: $content['problem'],
                'overview' => $solution->overview ?: $content['overview'],
                'benefits' => $solution->benefits ?: $content['benefits'],
                'technologies' => $solution->technologies ?: $content['technologies'],
                'hero_image_path' => $solution->hero_image_path ?: $generated,
            ])->save();

            $this->faqs($solution, $content['faqs'] ?? []);
        }
    }

    private function services(): void
    {
        foreach ($this->serviceContent() as $slug => $content) {
            $service = Service::where('slug', $slug)->first();
            if (! $service) {
                continue;
            }

            $service->forceFill(['body' => $service->body ?: $content['body']])->save();

            $this->faqs($service, $content['faqs'] ?? []);
        }
    }

    private function industries(): void
    {
        foreach ($this->industryContent() as $slug => $body) {
            $industry = Industry::where('slug', $slug)->first();
            if (! $industry) {
                continue;
            }

            $industry->forceFill(['body' => $industry->body ?: $body])->save();
        }
    }

    /** Cover art for anything that renders a card image and has none. */
    private function covers(): void
    {
        foreach (BlogPost::all() as $post) {
            $generated = $this->bannerImage($post->title, 'Article', "blog/{$post->slug}");
            $post->forceFill(['cover_image_path' => $post->cover_image_path ?: $generated])->save();
        }

        foreach (CaseStudy::all() as $study) {
            $generated = $this->bannerImage($study->title, 'Case study', "case-studies/{$study->slug}");
            $study->forceFill(['cover_image_path' => $study->cover_image_path ?: $generated])->save();
        }
    }

    /** Only seeds FAQs where an entity has none — never clobbers edited ones. */
    private function faqs(Solution|Service $model, array $faqs): void
    {
        if (! $faqs || $model->faqs()->exists()) {
            return;
        }

        foreach ($faqs as $i => [$question, $answer]) {
            $model->faqs()->create([
                'question' => $question,
                'answer' => $answer,
                'sort_order' => $i,
            ]);
        }
    }

    private function solutionContent(): array
    {
        return [
            'networking' => [
                'problem' => 'Most office networks were never designed — they accreted. A switch here, an access point there, and eventually nobody can say which VLAN a device is on or why a cable run terminates where it does.',
                'overview' => '<p>We start with a survey of what is physically installed, then produce an addressing plan, a switching topology and a cable schedule before touching anything.</p><h2>How the work runs</h2><p>Cutover happens out of hours, in stages, with a documented rollback at every step.</p><ul><li>Core and access switching</li><li>VLAN segmentation</li><li>Inter-VLAN routing and ACLs</li></ul>',
                'benefits' => ['A network diagram that matches reality', 'Labelled patching, both ends', 'Segmented traffic so one bad device cannot flood the network', 'Capacity headroom for three to five years'],
                'technologies' => ['Cisco Catalyst', 'HPE Aruba CX', 'Ubiquiti UniFi', '802.1X', 'LACP', 'RSTP'],
                'faqs' => [
                    ['Can you work around our production hours?', 'Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage.'],
                    ['Do we have to replace everything at once?', 'Almost never. We stage the work so the oldest and riskiest equipment goes first, and the rest follows as budget allows.'],
                ],
            ],
            'servers' => [
                'problem' => 'A server bought for one job ends up running six, and nobody knows which service will fall over if it is rebooted.',
                'overview' => '<p>We size compute against the workload rather than the budget line, then document what runs where.</p><h2>Virtualise, then consolidate</h2><p>Most small estates run better as two well-specified hosts than five ageing ones, and failover stops being theoretical.</p>',
                'benefits' => ['Documented workloads, not folklore', 'Headroom for the next three years', 'Out-of-band management on every host', 'A tested failover path'],
                'technologies' => ['Dell PowerEdge', 'VMware vSphere', 'Hyper-V', 'Windows Server', 'iDRAC'],
                'faqs' => [
                    ['Can you migrate our existing servers?', 'Yes — physical-to-virtual migrations run out of hours, and we keep the original box untouched until you have signed off the new one.'],
                ],
            ],
            'storage' => [
                'problem' => 'Shared drives grow until nobody can find anything, permissions are inherited from a decision made years ago, and the only backup is the drive itself.',
                'overview' => '<p>Centralised storage with a permission model somebody can explain, snapshots that let you recover a file without a restore ticket, and capacity planning that accounts for growth.</p>',
                'benefits' => ['Permissions by role, not by person', 'Snapshots for same-day recovery', 'Capacity alerts before the drive fills', 'Separate backup target'],
                'technologies' => ['Synology', 'Btrfs snapshots', 'iSCSI', 'Active Directory integration'],
                'faqs' => [],
            ],
            'firewall' => [
                'problem' => 'The firewall was configured once, at install, and every rule added since has been "temporary".',
                'overview' => '<p>We audit the existing policy, remove what no longer matches anything, and document what remains.</p><h2>Policy review</h2><p>Rules are reviewed quarterly, because a policy describes a network that keeps changing underneath it.</p>',
                'benefits' => ['A rule set you can read', 'TLS inspection where it is warranted', 'Site-to-site VPN that stays up', 'Quarterly policy review'],
                'technologies' => ['Fortinet FortiGate', 'Sophos XGS', 'IPsec', 'SD-WAN'],
                'faqs' => [
                    ['Will inspection slow our connection down?', 'Full inspection costs throughput — we size the appliance against the threat-protection figure rather than the headline firewall number, so the answer is no.'],
                ],
            ],
            'enterprise-wifi' => [
                'problem' => 'Wi-Fi that tested fine in an empty building falls apart once the racking, the people and the stock arrive.',
                'overview' => '<p>We survey the building as it is used, not as it was drawn, then design for capacity rather than raw coverage.</p><h2>Density beats power</h2><p>Two access points at moderate power outperform one at maximum power in nearly every occupied room.</p>',
                'benefits' => ['A survey done in the occupied building', 'Roaming that does not drop calls', 'Separate guest and corporate traffic', 'Controller-managed estate'],
                'technologies' => ['Ubiquiti UniFi', 'HPE Aruba', 'Wi-Fi 6', 'WPA3', '802.1X'],
                'faqs' => [
                    ['Do you re-survey after fit-out?', 'Yes, and we recommend it. Racking and stock change the RF picture more than any other single factor.'],
                ],
            ],
            'backup' => [
                'problem' => 'Backups run nightly and nobody has restored from one in two years.',
                'overview' => '<p>A backup nobody has restored is a hypothesis. We set up on-site and off-site copies, then test the restore path on a schedule and give you the evidence.</p>',
                'benefits' => ['3-2-1 by default', 'Documented restore procedure', 'Restores tested, not assumed', 'Retention that matches your obligations'],
                'technologies' => ['Veeam', 'Synology Active Backup', 'Immutable off-site copies'],
                'faqs' => [
                    ['How often do you test a restore?', 'Quarterly at minimum, and we send you the result whether or not it went well.'],
                ],
            ],
            'cybersecurity' => [
                'problem' => 'Security spending goes on products while the actual exposure is unpatched machines and shared passwords.',
                'overview' => '<p>Patch discipline, endpoint protection, access control and the training to go with them — in that order, because the boring controls stop most of what actually happens.</p>',
                'benefits' => ['Patch status you can see', 'Endpoint protection that is actually enrolled', 'Least-privilege access', 'Staff awareness training'],
                'technologies' => ['Sophos Intercept X', 'Microsoft Defender', 'MFA', 'Patch management'],
                'faqs' => [],
            ],
            'surveillance' => [
                'problem' => 'Cameras were installed where cable was easy to run rather than where they see anything useful.',
                'overview' => '<p>Camera placement designed against sight lines and lighting, NVR storage sized for the retention you actually need, and remote viewing that does not involve opening a port to the internet.</p>',
                'benefits' => ['Placement designed for sight lines', 'Storage sized to real retention', 'Remote viewing without port forwarding', 'Cameras on their own VLAN'],
                'technologies' => ['IP cameras', 'NVR', 'PoE switching', 'VLAN segmentation'],
                'faqs' => [],
            ],
            'amc' => [
                'problem' => 'Support is whoever answers the phone, and nobody has an inventory of what is installed.',
                'overview' => '<p>An annual maintenance contract with defined response times, scheduled preventive visits and an asset register that stays current.</p><h2>What is covered</h2><ul><li>Defined SLA by priority</li><li>Preventive site visits</li><li>Asset register and warranty tracking</li></ul>',
                'benefits' => ['Response times in writing', 'Preventive visits, not just fire-fighting', 'A current asset register', 'One accountable contact'],
                'technologies' => ['Ticketing with SLA tracking', 'Remote monitoring', 'Asset management'],
                'faqs' => [
                    ['What response time do we get?', 'It depends on priority — a service-down incident is four hours, and the full matrix is in the contract rather than buried in a footnote.'],
                ],
            ],
        ];
    }

    private function serviceContent(): array
    {
        return [
            'domains' => [
                'body' => '<p>Registration, transfer and renewal, with DNS configured correctly from the start — the records that matter for email deliverability included.</p><h2>What we set up</h2><ul><li>Registrar lock and auto-renew</li><li>SPF, DKIM and DMARC</li><li>Sensible TTLs before a migration</li></ul>',
                'faqs' => [['Can you transfer a domain we registered elsewhere?', 'Yes. We need the authorisation code from your current registrar and the domain must be outside its 60-day transfer lock.']],
            ],
            'web-hosting' => [
                'body' => '<p>Linux and Windows hosting on managed infrastructure, with backups and SSL included rather than sold separately.</p><h2>Included as standard</h2><ul><li>Daily backups with a 30-day window</li><li>Let\'s Encrypt certificates, renewed automatically</li><li>Staging subdomain on request</li></ul>',
                'faqs' => [['Do you migrate the existing site?', 'Yes, and we run it on a staging URL for you to check before the DNS is pointed across.']],
            ],
            'business-email' => [
                'body' => '<p>Professional mailboxes on your own domain, with anti-spam, archiving and mobile sync configured — not left as an exercise for the user.</p><h2>Migration</h2><p>Existing mail is migrated with folder structure intact, and the cutover happens outside working hours.</p>',
                'faqs' => [['Will we lose mail during the migration?', 'No. Mail is synchronised first and the cutover only flips where new mail is delivered.']],
            ],
            'ssl' => [
                'body' => '<p>DV, OV and wildcard certificates issued, installed and — the part that actually causes outages — renewed before they expire.</p>',
                'faqs' => [['Do we need OV rather than DV?', 'Only if you need the organisation name in the certificate. For most sites DV is equivalent in encryption terms.']],
            ],
            'vps' => [
                'body' => '<p>Dedicated CPU and memory with root access, for applications that have outgrown shared hosting but do not warrant a server on site.</p>',
                'faqs' => [],
            ],
            'website-services' => [
                'body' => '<p>Corporate websites, migrations and ongoing maintenance, built on foundations that will still be maintainable in three years.</p>',
                'faqs' => [],
            ],
        ];
    }

    private function industryContent(): array
    {
        return [
            'smb' => '<p>Infrastructure sized for the business you are, with an upgrade path for the one you are becoming. No enterprise licensing you will never use.</p>',
            'healthcare' => '<p>Clinical devices cannot share a broadcast domain with guest phones. We segment the network, protect the data at rest and design for uptime during clinic hours.</p>',
            'education' => '<p>High-density Wi-Fi that survives a full timetable, content filtering that satisfies safeguarding requirements, and lab networks kept away from admin systems.</p>',
            'manufacturing' => '<p>Shop-floor resilience and a clear OT/IT boundary. Production does not stop because someone opened an attachment in the office.</p>',
            'corporate' => '<p>Multi-site connectivity with a standardised build, so a new office is a repeat of a known process rather than a fresh design each time.</p>',
            'government' => '<p>Compliance-aware deployment with the documentation to evidence it, and procurement-friendly specifications.</p>',
        ];
    }
}
