<?php

/**
 * The blog as it ships: twenty published articles and one draft.
 *
 * Read by `BlogPostSeeder`. Bodies are nowdocs so they can be edited as
 * HTML rather than as escaped strings. Slugs are the URL contract and are
 * set explicitly, as everywhere else in this project; a slug changed here
 * is a new post, not a renamed one, and the old URL needs a redirect.
 *
 * Covers are deliberately absent. A cover is a file in the media library,
 * uploaded through the console or imported by hand, and `DemoContentSeeder`
 * fills a blank `cover_image_path` with a generated banner so nothing renders
 * a hole. Every picture on the blog is cropped 4:3 — the hero, the rows, the
 * cards and the post page all draw a 4:3 well.
 */
return [
    'categories' => [
        ['name' => 'Networking', 'slug' => 'networking', 'sort_order' => 0],
        ['name' => 'Security', 'slug' => 'security', 'sort_order' => 1],
        ['name' => 'Infrastructure', 'slug' => 'infrastructure', 'sort_order' => 2],
        ['name' => 'Backup & Recovery', 'slug' => 'backup-recovery', 'sort_order' => 3],
        ['name' => 'Wi-Fi', 'slug' => 'wi-fi', 'sort_order' => 4],
        ['name' => 'Surveillance', 'slug' => 'surveillance', 'sort_order' => 5],
        ['name' => 'Power', 'slug' => 'power', 'sort_order' => 6],
    ],

    'posts' => [
        [
            'slug' => 'guest-wifi-that-never-touches-the-office-network',
            'title' => 'Guest Wi-Fi that never touches the office network',
            'excerpt' => 'A visitor password on the staff SSID is the most common way a small office gives strangers a route to the file server. Separation is a VLAN, a firewall rule and one setting on the controller.',
            'categories' => ['wi-fi', 'security'],
            'published_at' => '2026-09-09 09:30:00',
            'featured' => true,
            'body' => <<<'HTML'
<p>Most offices offer guest Wi-Fi. Most of them offer it by writing the staff password on a whiteboard in reception. Everybody knows this is wrong and nobody changes it, because the alternative sounds like a project. It is not. It is three settings, and the order matters.</p>

<h2>What "guest" has to mean</h2>

<p>A guest device gets to the internet and to nothing else. Not the printer, not the NAS, not the recorder, not the other guests. If a visitor's laptop can see the accounts server on the network browser, the guest network is a second staff network with a weaker password.</p>

<p>That is a definition, not a preference. Everything below follows from it.</p>

<h2>One: a VLAN of its own</h2>

<p>The guest SSID is mapped to its own VLAN on the controller, and that VLAN is trunked to the access points and to the firewall — and to nothing else. It does not need to exist on the switch that serves the server room. If it does not exist there, nothing in there can be reached from it, whatever the firewall says.</p>

<p>Give it its own DHCP scope, handed out by the firewall rather than the office server. A guest network whose addresses come from the domain controller is a guest network that can reach the domain controller.</p>

<h2>Two: the firewall rule, written the right way round</h2>

<p>The rule is not "block guest from the LAN". It is "allow guest to the internet, deny everything else". The difference is what happens when a new internal subnet appears next year: a deny-list has to be updated and will not be; an allow-list needs nothing.</p>

<p>Allow DNS and HTTP/S outbound. Deny RFC 1918 destinations as an explicit rule above the default, so the log shows an attempt rather than a silent drop when somebody's laptop goes looking for a printer.</p>

<h2>Three: client isolation</h2>

<p>The setting on the SSID that stops guest devices from talking to each other. It is one tick box and it is usually off. With it off, a guest network at a busy reception is a room full of unpatched laptops introducing themselves to each other.</p>

<h2>Bandwidth, and the reason it matters more than it looks</h2>

<p>Rate-limit the guest SSID. Not to be unkind — because a visitor's phone syncing a photo library over your uplink at nine in the morning is indistinguishable, from the office's side, from the internet being down. A ceiling of 10 or 20 Mbps per client is generous for a guest and invisible to staff.</p>

<h2>What to do about the whiteboard</h2>

<p>Rotate the guest password monthly and print it on the visitor sign-in sheet. A guest password that has been the same since the network was installed is public. A captive portal is the tidier answer where the controller offers one, and a QR code on the reception desk does the same job for nothing.</p>

<h2>How to check it</h2>

<p>Join the guest network with a phone. Try the printer's address. Try the NAS. Try the recorder. Try a colleague's laptop on the same guest SSID. Every one of those should fail, and they should fail now — not after the next audit.</p>
HTML,
        ],
        [
            'slug' => 'camera-placement-the-four-shots-every-site-needs',
            'title' => 'Camera placement: the four shots every site needs',
            'excerpt' => 'A surveillance system is judged on one afternoon — the day something happens and somebody asks for the footage. Most systems fail that day because of where the cameras point, not what they cost.',
            'categories' => ['surveillance', 'security'],
            'published_at' => '2026-09-04 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Camera systems are usually specified by count. "We need eight cameras." Eight cameras pointed at nothing in particular produce eight streams of nothing in particular, and the day something is stolen the footage shows a shoulder, a hood and a car with the plate out of frame.</p>

<p>Specify by shot instead. Four of them cover most sites, and the count follows.</p>

<h2>Shot one: every way in, at face height</h2>

<p>One camera per entrance, mounted so that a person walking in fills the frame from the waist up. That means low — two to two and a half metres — and pointing along the path of travel, not down at the top of a head. This is the camera that identifies somebody, and it is the one most often mounted too high on the argument that height stops tampering. A face at four metres is a hat.</p>

<h2>Shot two: the approach, wide</h2>

<p>A second camera covering the outside of the entrance from further back. It sees what the first cannot: the vehicle, the second person who waited outside, the direction they came from and left in. This is the camera that gives the identification camera its context, and on a lot of sites it is the one that catches the plate.</p>

<h2>Shot three: the thing worth stealing</h2>

<p>The stock room, the server rack, the till, the loading bay. Close enough that a hand in a drawer is a hand in a drawer. This is the shot a manager actually reviews, because it answers questions that are not about crime — who left the door open, when the delivery arrived, whether the fridge was closed.</p>

<h2>Shot four: the cash and the counter</h2>

<p>Where money changes hands, one camera looking at the transaction from the customer's side and slightly above. It protects staff as much as stock; most disputes at a counter are resolved by a minute of footage that shows both parties.</p>

<h2>Things that ruin all four</h2>

<ul>
<li><strong>Backlighting.</strong> A camera facing a glass door at midday sees a silhouette. Face it away from the light or choose a camera with real wide dynamic range, and test it at the worst hour, not at installation time.</li>
<li><strong>Infra-red bounce.</strong> A camera with IR illumination mounted close to a wall or a ceiling tile floods itself with its own light at night. Move it or angle it.</li>
<li><strong>Resolution spent on width.</strong> A 4K camera covering a whole car park has fewer pixels on a face than a 2MP camera covering a doorway. Pixels per metre at the target is the number; the box's headline is not.</li>
<li><strong>Retention nobody checked.</strong> Sixteen cameras at high bitrate on a 2TB recorder keeps four days. The incident is discovered on day six. See the note on recorder storage.</li>
</ul>

<h2>Walk it before it is drilled</h2>

<p>Stand where each camera will be, hold a phone at the mounting height, and look at what it sees. It costs an hour and it is the only survey that matters. A camera moved after installation is a second visit, a patched hole and a cable that is now too short.</p>
HTML,
        ],
        [
            'slug' => 'firewall-rules-that-stop-working',
            'title' => 'Firewall rules that quietly stop working',
            'excerpt' => 'Five policy patterns that pass review, look correct a year later, and no longer do what anybody thinks they do.',
            'categories' => ['networking', 'security'],
            'published_at' => '2026-08-12 09:00:00',
            'featured' => true,
            'body' => <<<'HTML'
<p>A firewall policy is not a static document. It describes a network that keeps changing underneath it, and the rules that cause trouble are rarely the wrong ones — they are the ones that were right on the day they were written. Here are the five we see most.</p>

<h2>1. The address object nobody decommissioned</h2>

<p>An object called <code>FINANCE-SRV</code> points at an address whose server was retired two years ago. The rule that allows the internet to reach it on 443 is still there. It matches nothing, so nobody notices — until DHCP hands that address to a visitor's laptop, or a new appliance is given it by hand because it was "free".</p>

<p>Audit address objects quarterly against what actually answers. Prefer FQDN objects where the platform supports them; a name that stops resolving is a rule that stops matching, which is the safe direction.</p>

<h2>2. "Temporary" with no expiry</h2>

<p>The rule added at 6pm so the vendor could finish the migration. It has a comment that says <em>temp — remove Monday</em>. It has been there since 2023. Most firewalls can put a schedule or an expiry on a rule; use it, and let the rule switch itself off rather than relying on a Monday that never came.</p>

<h2>3. The any-any that was going to be tightened later</h2>

<p>A new segment goes in, the application does not work, somebody adds <em>segment → any, any service, allow</em> to get it working, and the plan is to narrow it once the application's real ports are known. They are never written down, so it is never narrowed. Six months later that segment is the one with the least protection on the network, and it is usually the one holding the CCTV recorder or the building controller.</p>

<p>Narrow it the same day by reading the session log for that rule. The ports in use are all there.</p>

<h2>4. Shadowed rules</h2>

<p>A deny rule sits below an allow that already matches the same traffic. It looks correct on the screen. It never fires, because the allow above it wins first. Every platform has a rule-usage counter; a deny with zero hits since it was created is either shadowed or unnecessary, and either way it is not doing what its author thinks.</p>

<h2>5. NAT that outlived the policy</h2>

<p>The port forward for the old remote-desktop gateway is still in the NAT table after the gateway was replaced with a VPN. NAT and policy are two tables on most firewalls, and cleaning up one does not clean up the other. A forward with nothing behind it is harmless today and a straight path to whatever is given that address tomorrow.</p>

<h2>The review that catches all five</h2>

<p>Export the policy, sort by last-hit, and read the rules with no hits in ninety days. Read the objects with no rules referencing them. Read the NAT table against the policy. It takes an afternoon, it needs no tool the firewall does not already have, and it is the difference between a policy and a list of things that used to be true.</p>
HTML,
        ],
        [
            'slug' => 'sizing-a-ups',
            'title' => 'Sizing a UPS for a small server room',
            'excerpt' => 'Load, runtime and the mistake almost everybody makes with the number on the label. A UPS that is too small does not fail gracefully — it fails at the exact moment it was bought for.',
            'categories' => ['power', 'infrastructure'],
            'published_at' => '2026-08-04 09:00:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Most undersized UPS installations are not the result of saving money. They are the result of reading the wrong number off the label, and the wrong number is printed larger.</p>

<h2>VA is not watts</h2>

<p>A UPS is sold by VA — volt-amps — and the load on it is drawn in watts. The two are related by the power factor, and on a cheaper unit that can be as low as 0.6. So a "1500&nbsp;VA" UPS delivers around 900&nbsp;W, and a rack drawing 1100&nbsp;W will overload it the first time the mains drops. It will not have failed slowly beforehand: on mains, the UPS was passing the load straight through and reporting nothing.</p>

<p>Read the watt rating. If the label does not give one, assume 0.6 and buy accordingly, or buy a unit that states its power factor.</p>

<h2>Measure the load, do not add up the labels</h2>

<p>The rating plate on a server says what its power supply <em>can</em> deliver, not what the machine draws. A server with two 750&nbsp;W supplies typically draws 200–300&nbsp;W. Adding plates produces a figure three to four times the real load and a UPS that is either far too large or, more often, dismissed as impossible and replaced by guesswork.</p>

<p>Plug a clamp meter or a metered PDU on the feed for a working day. Take the peak, add 25% for growth, and that is the watt figure to size against.</p>

<h2>Decide what the runtime is for</h2>

<p>There are two honest answers and they lead to different purchases.</p>

<ul>
<li><strong>Ride through the flicker and shut down cleanly.</strong> Five to ten minutes. The UPS covers the short interruptions that are most outages, and for a real cut it signals the servers to shut down properly. This is the right answer for almost every small server room, and it is the cheaper one.</li>
<li><strong>Stay up until the generator takes over.</strong> Only meaningful if there is a generator, and then the runtime need only cover the generator's start time — usually under a minute, sized as five for margin.</li>
</ul>

<p>"Stay up as long as possible" is not an answer. It is the phrase that buys a UPS with two hours of runtime under a load that nobody shuts down, so the batteries drain flat and the servers crash anyway — after two hours instead of at once.</p>

<h2>The shutdown signal is the whole point</h2>

<p>A UPS that cannot tell the servers the power has gone is a large battery. The USB or network card that lets it do so is the part most often left in the box. Install the agent on every server, test it by pulling the plug once, and put that test in the AMC schedule.</p>

<h2>Batteries have a date</h2>

<p>Sealed lead-acid batteries hold rated capacity for three to five years and then lose it quickly. A five-year-old UPS that has never been tested will report "battery good" right up to the outage, when it will give thirty seconds. Replace on schedule, not on failure; the batteries cost a fraction of the unit and the outage costs more than both.</p>

<h2>Do not plug these in</h2>

<p>Laser printers, space heaters, the kettle in the corner. A laser printer's fuser draws over a kilowatt for a second when it warms up, which is enough to trip a UPS sized for the rack — and it will do so on a Monday morning, on mains, with nothing else wrong.</p>
HTML,
        ],
        [
            'slug' => 'recorder-storage-retention-days-not-terabytes',
            'title' => 'Recorder storage: buy retention days, not terabytes',
            'excerpt' => 'The incident is discovered on day six and the recorder kept four. The arithmetic that avoids it takes ten minutes and is almost never done.',
            'categories' => ['surveillance', 'backup-recovery'],
            'published_at' => '2026-04-16 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>A recorder is specified by how many cameras it accepts and how many terabytes it holds. Neither is the number that matters. The number that matters is how many days back the footage goes, because that is the question that gets asked — usually on a Monday, about the previous Wednesday.</p>

<h2>The arithmetic</h2>

<p>Each camera writes a stream at some bitrate. A 4MP camera at a sensible frame rate and compression writes roughly 4&nbsp;Mbps. That is 0.5&nbsp;MB a second, 43&nbsp;GB a day. Sixteen of them is about 690&nbsp;GB a day. A 4TB recorder therefore keeps a little under six days; the 2TB unit that was quoted keeps under three.</p>

<p>Run the figure for the system being proposed before it is ordered. Every recorder manufacturer publishes a calculator, and every camera's bitrate is on its datasheet.</p>

<h2>What retention should be</h2>

<p>Thirty days is the usual floor for a business. Not because anything reviews a month of footage, but because that is how long it takes for an incident to be noticed, reported, and asked about — an invoice queried, a missing item counted, a complaint made. Fourteen days is a reasonable minimum where budget is tight; below that the system is recording for the sake of recording.</p>

<h2>Ways to keep more days without buying more disk</h2>

<ul>
<li><strong>Motion-triggered recording</strong> on cameras watching a corridor at night. Continuous recording of an empty corridor is what fills most recorders.</li>
<li><strong>Two streams per camera:</strong> a lower-bitrate continuous stream, and full quality only on motion or alarm.</li>
<li><strong>Frame rate.</strong> Twelve to fifteen frames a second is fine for identification; thirty is for sport. Halving the frame rate very nearly halves the storage.</li>
<li><strong>H.265 over H.264</strong>, where every camera and the recorder support it. Between a third and a half less data for the same picture.</li>
</ul>

<h2>Surveillance-rated disks</h2>

<p>A recorder writes sixteen streams continuously for years. A desktop hard disk is designed for bursts and idles, and it will fail in a recorder well inside its warranty — usually without the recorder saying so. Use disks rated for surveillance; the premium is small and the alternative is discovering, on the day the footage is needed, that the recorder has been silently writing to nothing for a month.</p>

<h2>Check it monthly</h2>

<p>Open the recorder and look at the oldest recording. If it is not at least as old as the retention that was agreed, something has changed — a camera's bitrate was raised, a disk has failed, motion recording was switched to continuous by somebody looking for a clip. It is a one-minute check and it belongs on the AMC visit sheet.</p>
HTML,
        ],
        [
            'slug' => 'cooling-a-server-room-that-used-to-be-a-cupboard',
            'title' => 'Cooling a server room that used to be a cupboard',
            'excerpt' => 'Most small server rooms are rooms that were available, not rooms that were chosen. The equipment does not know that, and heat is the reason a five-year server lasts three.',
            'categories' => ['infrastructure', 'power'],
            'published_at' => '2026-04-02 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>The comms room in most offices is whatever room was free when the network went in. It has a door, a power socket and no window, and it was fine with one switch in it. Then it acquired a server, a NAS, a recorder and a UPS, and now it is thirty-four degrees with the door propped open.</p>

<h2>What heat actually does</h2>

<p>Nothing dramatic. Servers throttle rather than fail, so performance drops and nobody connects it to the room. Disks fail earlier — the failure-rate curves published by the large operators are unambiguous above about thirty degrees. UPS batteries lose half their life for every ten degrees over their rated ambient. The room is not causing an outage; it is shortening the interval between them.</p>

<h2>The arithmetic, again</h2>

<p>Every watt drawn is a watt of heat. A rack drawing 1200&nbsp;W is a 1200&nbsp;W heater running around the clock, and it needs 1200&nbsp;W of cooling — plus the heat that comes through the walls and the door. In air-conditioning terms that is a little over 4,000&nbsp;BTU, which is small: a domestic split unit of 9,000&nbsp;BTU is comfortably enough for most comms rooms, with margin.</p>

<h2>A split unit, not a portable one</h2>

<p>Portable air conditioners exhaust through a hose to somewhere, and in a room with no window that somewhere is the ceiling void, from where the heat comes back. They also need their condensate emptied. A wall-mounted split unit with the outdoor unit outside is the correct answer and it costs about the same as the portable unit that will be replaced by it anyway.</p>

<p>Two things about the split unit that the installer will not think of unless asked: it must be set to <strong>restart automatically after a power cut</strong>, and it must be on a circuit that is <em>not</em> the UPS. A unit that stays off after an outage cooks the room while everything else comes back up.</p>

<h2>Air has to move through the equipment</h2>

<p>Servers and switches draw cool air in at the front and push hot air out of the back. A rack pushed against the wall recirculates its own exhaust. Leave a gap behind it, and do not point the air conditioner's cold stream at the back of the rack — it goes in the front.</p>

<h2>Know before it is a problem</h2>

<p>A temperature sensor in the rack that sends an alert costs less than a disk. Most UPS network cards have a sensor input; most switches report their internal temperature over SNMP. Set an alert at twenty-eight degrees and the first sign of a failed air conditioner is a message, not a smell.</p>

<h2>The door</h2>

<p>Propping the comms room door open cools it with the office's air conditioning, which works until the office's air conditioning switches off at seven. It also means the room is not locked. Close the door and cool the room on its own terms.</p>
HTML,
        ],
        [
            'slug' => 'a-two-factor-rollout-staff-will-actually-use',
            'title' => 'A two-factor rollout that staff will actually use',
            'excerpt' => 'The technology is the easy half. The rollout fails on the twelve people who share a login, the director who will not install an app, and the day the phone is lost.',
            'categories' => ['security'],
            'published_at' => '2026-03-19 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Two-factor authentication on email and remote access is the single most effective control a small business can add, and the one most often abandoned two weeks after it is switched on. It is abandoned because it was rolled out as a setting rather than as a change to how people work.</p>

<h2>Start with what is exposed</h2>

<p>Email, the VPN or remote-desktop gateway, the accounting system if it is in the cloud, and anything with an administrator role. Not the internal wiki. A rollout that covers everything at once produces a week of lockouts and a general instruction to switch it all off; one that covers the four things that matter is done in a day and stays on.</p>

<h2>Choose the method for the people, not the policy</h2>

<ul>
<li><strong>An authenticator app</strong> for anybody with a company phone, or who is willing to put the app on their own. It is the right default.</li>
<li><strong>A hardware key</strong> for administrators and for anyone who will not install an app on a personal phone — and that refusal is reasonable, not obstructive. A key costs less than an hour of the argument.</li>
<li><strong>SMS</strong> only where nothing else is possible. It is much better than nothing and materially weaker than the other two; treat it as the exception, not the fallback.</li>
</ul>

<h2>The shared login</h2>

<p>Every business has one: <em>sales@</em>, <em>accounts@</em>, the login for the courier portal. Two-factor cannot be attached to a login that twelve people use, and the usual outcome is that it is exempted, which makes it the one account without protection and the one worth attacking.</p>

<p>Turn shared mailboxes into shared mailboxes — delegated access from named accounts, which most mail platforms support natively. For the portal logins that genuinely cannot be individual, put the code in the password manager the team shares, and make sure it is a team password manager rather than a spreadsheet.</p>

<h2>Enrol in person, in one session</h2>

<p>Do not send the instructions by email. Book fifteen minutes with each person, sit with them, and enrol the app or the key while they watch. Register a second method at the same time — a backup phone number or a printed set of recovery codes in a sealed envelope — because the question is never <em>whether</em> a phone will be lost.</p>

<h2>Write down the lost-phone procedure before the first phone is lost</h2>

<p>Who can reset a factor, how they verify the person asking, and how long it takes. If the answer is "the IT company, by email, next working day", then a sales manager at an airport on Friday evening has no email until Monday, and the next thing that happens is somebody switching two-factor off for them. A named person in the business with the right to reset, and a verification step that is not "they sounded like themselves on the phone".</p>

<h2>Measure it after a month</h2>

<p>Every platform reports which accounts have a second factor. The number should be everyone; if it is everyone minus three, those three are the accounts worth attacking, and they are usually the senior ones.</p>
HTML,
        ],
        [
            'slug' => 'cat6a-when-the-switches-are-gigabit',
            'title' => 'Why Cat6A when the switches are only gigabit',
            'excerpt' => 'The cable outlives the switches on both ends, twice over. Choosing it for the equipment being installed today is choosing it for the equipment being thrown away first.',
            'categories' => ['networking', 'infrastructure'],
            'published_at' => '2026-03-05 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>The question comes up on every fit-out. The switches are gigabit, the laptops are gigabit, Cat5e does gigabit, so why is the quote for Cat6A? The answer is that the cable is the only part of the network that will still be there in fifteen years, and it will be there because replacing it means opening the ceilings.</p>

<h2>What is actually being bought</h2>

<p>Structured cabling is the part of a network installation that is built into the building: the runs from the patch panel to every outlet, in the ceiling void, in the trunking, under the floor. Switches are swapped in an afternoon. Cabling is a refurbishment.</p>

<p>Cat6A carries 10 Gbps over the full 100 metres and, more relevant to most offices, it carries the higher PoE budgets — the ones that power a Wi-Fi 6E access point or a PTZ camera — with much less heat in a bundle. Cat5e does gigabit and low PoE, and that is the end of what it will ever do.</p>

<h2>The access points are the reason today</h2>

<p>Modern access points have multi-gigabit uplinks. A Wi-Fi 6 access point on a Cat5e run is a fast radio behind a slow cable, and the next generation of access points will not be specified with gigabit ports at all. The cable to the ceiling is the one that most needs headroom, and it is the one hardest to reach afterwards.</p>

<h2>The cost difference is smaller than it sounds</h2>

<p>The cable itself costs perhaps 40% more per metre. Labour is the same, and labour is most of the invoice. On a typical fifty-outlet office the difference between Cat5e and Cat6A is a few percent of the whole job, and a fraction of what it will cost to do the job twice.</p>

<h2>Where Cat6 rather than Cat6A is fine</h2>

<p>Short runs inside a room to desks that will only ever hold a laptop. Cat6 does 10 Gbps to 55 metres, which is most of a floor plate, and it is easier to terminate. What it does not do well is a dense bundle carrying high-power PoE — the heat builds up — so the runs to the ceiling are Cat6A regardless.</p>

<h2>Things that matter more than the category</h2>

<ul>
<li><strong>Certification.</strong> Every run tested with a certifier to the standard, with the results handed over. An uncertified run is a run that might be fine.</li>
<li><strong>Labelling.</strong> Both ends, matching the patch panel, matching the plan. Unlabelled cabling is re-traced every time something moves, at an hourly rate.</li>
<li><strong>Spare outlets.</strong> Two per desk position and one in any wall that could hold a screen, a printer or an access point. Adding one later costs more than adding ten now.</li>
<li><strong>Separation from power.</strong> Data cable run alongside mains in the same trunking picks up interference, and the symptom is a link that works most of the time.</li>
</ul>

<h2>The honest summary</h2>

<p>Cat6A is not for today's switches. It is for the switches that replace them, and the ones after that, on a cable nobody will want to touch again.</p>
HTML,
        ],
        [
            'slug' => 'when-to-refresh-a-laptop-fleet-and-when-not-to',
            'title' => 'When to refresh a laptop fleet, and when not to',
            'excerpt' => 'A three-year cycle is a habit, not an analysis. The machines that need replacing are identifiable, and they are not the oldest ones.',
            'categories' => ['infrastructure'],
            'published_at' => '2026-02-19 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Most fleets are refreshed by age. Every machine over three years old is replaced, in a batch, in whatever quarter has budget. It is easy to administer and it replaces a lot of perfectly good hardware while leaving some genuinely bad hardware in place because it is only two years old.</p>

<h2>What actually makes a laptop due</h2>

<ul>
<li><strong>The operating system is leaving support.</strong> This is the only hard deadline. A machine that cannot run a supported OS is a security problem regardless of how well it works, and the date is published years ahead.</li>
<li><strong>Battery health under 60%.</strong> Reported by the OS. A laptop that lasts ninety minutes is a desktop with a handle, and a battery replacement is often the cheaper fix on a machine that is otherwise sound.</li>
<li><strong>8 GB of memory</strong> on a machine used for anything beyond email. The browser alone now uses most of it. Where the memory can be upgraded, that is a twenty-minute job; where it is soldered, the machine is due.</li>
<li><strong>A spinning disk.</strong> Any laptop still on a hard disk rather than an SSD is slow in a way its user has stopped noticing and everybody around them has not. An SSD swap transforms it for the price of a keyboard.</li>
<li><strong>Repairs exceeding a third of replacement.</strong> A cracked screen on a four-year-old machine is the end of it. The same screen on a one-year-old machine is a repair.</li>
</ul>

<h2>What does not make a laptop due</h2>

<p>Being three years old. Being slower than the newest one in the office. Having a scuffed lid. A four-year-old business laptop with an SSD, 16 GB and a good battery is a fine machine for most work, and replacing it buys nothing except a warranty.</p>

<h2>Refresh the people, not the batch</h2>

<p>Replacing the whole fleet at once means the whole fleet is due again at once, in the same quarter, forever. Spread it. Replace the machines that fail the tests above as they fail them, and the fleet's age spreads out into a rolling third or quarter a year — which is also a budget line that stays the same size.</p>

<h2>Buy for the job, in two or three shapes</h2>

<p>One specification for most staff, one for the people who run heavy software, and possibly a rugged one for anybody who works out of a van. Not one per person. Three shapes means spares are interchangeable and a failed machine is swapped from stock in an hour rather than ordered.</p>

<h2>Warranty matters more than speed</h2>

<p>A business laptop with next-business-day on-site cover for three years costs more than a consumer machine with return-to-base. The difference is whether a failed screen is a day of downtime or a fortnight. On a fleet of forty, one of them fails every couple of months; that is the number to price against.</p>

<h2>What happens to the old ones</h2>

<p>Wipe them — a real erase, not a delete — and keep a record of the serial and the date. A laptop that leaves the business with last year's accounts on it is a data-protection incident waiting for somebody to find it at a car-boot sale. Certified disposal costs almost nothing per unit and produces the certificate an auditor asks for.</p>
HTML,
        ],
        [
            'slug' => 'site-to-site-vpn-between-two-offices-without-the-surprises',
            'title' => 'A site-to-site VPN between two offices, without the surprises',
            'excerpt' => 'Two firewalls, one tunnel, and the four things that turn "it connected" into "it works": addressing, routing, DNS and the phone line that goes down every Tuesday.',
            'categories' => ['networking', 'security'],
            'published_at' => '2026-02-05 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Connecting a second office to the first is usually a site-to-site VPN between the two firewalls. Bringing the tunnel up takes an hour. Making the two offices behave as one network is the rest of the week, and the difference is almost entirely in things decided before the tunnel exists.</p>

<h2>The two offices must not share an address range</h2>

<p>Both offices were installed with the default 192.168.1.0/24, because every router ships with it. A tunnel between two identical ranges cannot route: a packet for 192.168.1.20 is delivered locally at both ends. The fix is to re-address one office, and it is much easier before the tunnel than after. Choose ranges that are distinct <em>and</em> unusual — 10.20.0.0/16 for one site, 10.30.0.0/16 for the other — so a third office, or a colleague's home router, does not collide next year.</p>

<h2>Routing is a decision, not a side effect</h2>

<p>Decide what crosses the tunnel. Everything, or only the server VLAN? Should the branch's guest Wi-Fi reach the head-office file server? It should not, and it will unless the tunnel's traffic selectors say otherwise. Write the list of what each site may reach on the other, and configure the tunnel to carry exactly that.</p>

<h2>DNS is what makes it feel like one network</h2>

<p>Staff at the branch type <em>\\fileserver</em>, not an address. That name has to resolve at the branch, which means the branch's DHCP must hand out a DNS server that knows it — the head-office domain controller across the tunnel, or a local resolver forwarding to it. Skip this and the tunnel is up, the ping works, and nobody can open anything.</p>

<h2>The tunnel will drop; decide what happens then</h2>

<p>Dead-peer detection on both ends, so a tunnel that has silently died is torn down and rebuilt rather than sitting "up" carrying nothing. A keepalive, so an idle tunnel is not timed out by an ISP's connection tracking. And a monitor that alerts on tunnel state — because the first report of a dead tunnel is otherwise a branch that cannot print.</p>

<h2>The Tuesday problem</h2>

<p>One branch's tunnel dropped for four minutes every Tuesday at 2 am. It was the ISP's scheduled maintenance renewing the DHCP lease on the WAN, and the branch firewall's public address changed each time. Two answers: a static public address at both ends, which is worth its small monthly cost; or a tunnel configured with a dynamic-DNS name on the branch side and the head office set to accept it. Static is better. A tunnel between two changing addresses is a tunnel that will fail on a night nobody is watching.</p>

<h2>Bandwidth and the file server</h2>

<p>The tunnel is as fast as the slower office's uplink, minus overhead. Opening a 200 MB drawing across it takes a while, and that is not a VPN problem. If the branch works heavily on head-office files, the answer is a file server at the branch that synchronises, not a faster tunnel.</p>

<h2>Checklist before calling it done</h2>

<ul>
<li>Distinct address ranges at both sites, documented.</li>
<li>Traffic selectors carrying only what was agreed, in both directions.</li>
<li>Name resolution working from a branch laptop for head-office names.</li>
<li>Dead-peer detection and keepalives on both firewalls.</li>
<li>Static public addresses, or dynamic DNS with the peer set to accept it.</li>
<li>The tunnel's state monitored, with an alert that reaches a person.</li>
</ul>
HTML,
        ],
        [
            'slug' => 'vlan-design-that-survives-the-next-office-move',
            'title' => 'VLAN design that survives the next office move',
            'excerpt' => 'Most VLAN schemes are drawn around a floor plan. Then the floor plan changes, and the scheme becomes a list of exceptions nobody can read.',
            'categories' => ['networking'],
            'published_at' => '2026-08-28 09:30:00',
            'featured' => true,
            'body' => <<<'HTML'
<p>Almost every VLAN scheme starts the same way: somebody opens the floor plan and draws one VLAN per area. Sales on the second floor, accounts on the third, a separate one for the meeting rooms. It is easy to explain, easy to document, and it survives exactly until the first desk move.</p>

<h2>Why the floor plan is the wrong axis</h2>

<p>A VLAN is a broadcast domain and, in practice, a security boundary. Neither of those things has anything to do with where somebody sits. When accounts takes six desks on the second floor because the third is being repainted, a location-based scheme leaves you with three bad options: trunk the accounts VLAN to a switch that should not carry it, move those users into the sales VLAN and lose the boundary, or re-address six machines.</p>

<p>All three happen. The third is the only correct one and it is the one nobody has time for, so the exceptions accumulate. Two years later the documentation says one thing and the switch configuration says another, and the person who knows the difference has left.</p>

<h2>Segment by what the traffic is, not where it sits</h2>

<p>The scheme that ages well is drawn around function:</p>

<ul>
<li><strong>Staff devices</strong> — laptops and desktops that people log into.</li>
<li><strong>Servers</strong> — anything that other things connect to.</li>
<li><strong>Voice</strong> — handsets, which want their own QoS treatment anyway.</li>
<li><strong>Surveillance</strong> — cameras and the recorder, which talk to each other constantly and to nothing else.</li>
<li><strong>Building services</strong> — access control, HVAC, anything with a web interface from 2014 that will never be patched.</li>
<li><strong>Guest</strong> — internet only, no route to anything internal.</li>
</ul>

<p>A desk move now changes nothing. The port gets the staff VLAN because a staff laptop is plugged into it, and that is true on every floor.</p>

<h2>The one that is always forgotten</h2>

<p>Building services. It is the VLAN nobody asks for and the one that matters most, because it contains the devices with the worst security stories and the longest lives. An access control panel commissioned in 2016 with a default password and no firmware since is a real thing in real buildings. It needs to reach one server and nothing else, and the only reliable way to enforce that is to put it somewhere it cannot reach anything else by default.</p>

<h2>Leave room</h2>

<p>Number them with gaps. VLAN 10, 20, 30, 40 rather than 1, 2, 3, 4. When a new category appears — and it will, the first time somebody installs a digital signage system — there is somewhere obvious to put it that does not mean renumbering.</p>

<p>The same applies to addressing. A /24 per VLAN is more than most segments will ever use, and the alternative is re-subnetting a live network at the exact moment you are busiest.</p>

<h2>Write down why, not just what</h2>

<p>The documentation that survives is not the list of VLAN IDs. It is the one sentence per VLAN explaining what belongs in it. "VLAN 50 is for devices that must reach the recorder and nothing else" answers next year's question. "VLAN 50 — CCTV" does not.</p>
HTML,
        ],
        [
            'slug' => 'a-wifi-survey-belongs-before-the-ceiling-goes-up',
            'title' => 'A Wi-Fi survey belongs before the ceiling goes up',
            'excerpt' => 'Predictive surveys are cheap and done from a drawing. Everything that makes them wrong is decided on site, usually after the drawing is signed off.',
            'categories' => ['infrastructure', 'wi-fi'],
            'published_at' => '2026-08-19 09:30:00',
            'featured' => true,
            'body' => <<<'HTML'
<p>A predictive Wi-Fi survey is a model built from a floor plan: walls, materials, ceiling height, and a set of assumptions about what is behind them. It is genuinely useful, it costs almost nothing, and it is the right first step. It is also a model, and the building will differ from it.</p>

<h2>What the drawing does not show</h2>

<p>The drawing shows a wall. It does not show that the wall is a double layer of plasterboard on a steel frame with a foil-backed insulation board in the middle, which is a great deal more attenuation than plasterboard.</p>

<p>It does not show the racking. Warehouse plans are drawn empty, and a warehouse is not empty — it is a grid of steel uprights holding metal shelves loaded with stock whose density changes weekly. A survey done in an empty building is a survey of a building that will never exist again.</p>

<p>It does not show the mirrors in the bathroom corridor, the lift shaft, the fire doors that are held open by magnets and close during a drill, or the plant room somebody decided to put a repeater in.</p>

<h2>Two surveys, not one</h2>

<p>The pattern that works is predictive first, then a validation survey once the space is built and before the ceiling is closed.</p>

<p>The second one is the one that saves money, because the cost of moving an access point is entirely determined by whether the ceiling is open. Before the tiles go in, moving a point three metres is twenty minutes. After, it is a cable pull through a live ceiling void, usually out of hours, and somebody has to make good.</p>

<h2>Density beats coverage</h2>

<p>The most common design mistake is optimising for coverage — a signal everywhere — when the actual requirement is capacity, meaning enough radios that the clients in one area are not all contending for the same one.</p>

<p>A single high-powered access point covering an open-plan floor produces a perfect coverage heat map and a terrible experience at 3pm, because every one of those clients is sharing one radio and the slowest of them sets the pace. Several lower-powered points, each covering less, is almost always the better answer.</p>

<p>This is also why turning the transmit power up is rarely the fix it appears to be. It extends the cell of the access point, so more clients join it, and it does nothing for the client's own transmit power — the laptop still cannot shout back from the far corner. You get a device that shows four bars and cannot pass traffic.</p>

<h2>Survey with the right device</h2>

<p>Survey with the worst client you have to support, not the best. A current laptop with a good radio will report a usable signal in places a handheld barcode scanner will not, and if the scanners are what the business runs on then the scanner is what the design has to satisfy.</p>
HTML,
        ],
        [
            'slug' => 'raid-is-not-a-backup-and-the-day-that-becomes-obvious',
            'title' => 'RAID is not a backup, and the day that becomes obvious',
            'excerpt' => 'RAID protects against one specific failure: a disk dying. It offers nothing at all against the four things that actually destroy data.',
            'categories' => ['infrastructure', 'backup-recovery'],
            'published_at' => '2026-08-06 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>RAID solves one problem well. A disk fails, the array carries on, you replace the disk and it rebuilds. That is worth having and it is not a backup, because the failure it protects against is not the failure that usually costs people their data.</p>

<h2>The four things RAID does not help with</h2>

<p><strong>Deletion.</strong> A file deleted on a RAID array is deleted on every disk in it, immediately and consistently. That is what the array is for — the disks agree.</p>

<p><strong>Corruption.</strong> If an application writes bad data, the array faithfully stores bad data with full redundancy.</p>

<p><strong>Ransomware.</strong> Encryption is just writing. The array has no opinion about what it is asked to write.</p>

<p><strong>Losing the box.</strong> Fire, flood, theft, a failed controller that takes the array's metadata with it. Every disk is in the same chassis in the same room.</p>

<p>Each of these is more likely than the mechanical failure of two disks at once, and RAID is defence against precisely the one that is least likely.</p>

<h2>The rebuild window is the risk nobody prices</h2>

<p>When a disk in a RAID 5 array fails, the array is running without redundancy until the replacement finishes rebuilding. That rebuild reads every sector of every remaining disk — the heaviest sustained load those disks will ever see — and it does it on drives of the same age, from the same batch, with the same hours on them.</p>

<p>On large modern drives a rebuild is measured in days, not hours. A second failure during that window loses the array, and the load makes a second failure more likely, not less. This is the argument for RAID 6 over RAID 5 on any array built from large disks, and it is why "we have RAID" should always be followed by "and how long is a rebuild".</p>

<h2>What a backup has that RAID does not</h2>

<p>Three properties, and none of them is redundancy:</p>

<ul>
<li><strong>History.</strong> Yesterday's version, and last month's. Redundancy gives you the current state on more than one disk; a backup gives you a different state.</li>
<li><strong>Separation.</strong> A copy that a compromise of the live system cannot reach or modify.</li>
<li><strong>A restore that has been tested.</strong> An untested backup is a belief.</li>
</ul>

<h2>The one question worth asking</h2>

<p>Not "are we backed up" — everybody says yes. Ask: <em>when did somebody last restore a file from it, and how long did it take?</em></p>

<p>If nobody can answer, the backup has not been tested, only performed. The two are different, and the difference only ever surfaces on the worst possible day.</p>
HTML,
        ],
        [
            'slug' => 'reading-a-switchs-error-counters-before-anybody-complains',
            'title' => 'Reading a switch\'s error counters before anybody complains',
            'excerpt' => 'A link that is failing does not go down. It goes slow, intermittently, in a way that gets blamed on the application for months.',
            'categories' => ['networking'],
            'published_at' => '2026-07-24 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>A cable that has been damaged rarely fails cleanly. Clean failure is easy — the link light goes out, somebody notices, the cable gets replaced. What actually happens is that the link stays up and starts corrupting a small fraction of frames, and everything above it deals with the loss by retransmitting.</p>

<p>The result is a network that works, with occasional slowness that nobody can reproduce. It gets attributed to the file server, then the internet connection, then "the system". The switch has been reporting the real answer the whole time.</p>

<h2>The counters worth looking at</h2>

<p><strong>CRC errors and FCS errors.</strong> A frame arrived and its checksum did not match. This is the single most useful counter on a switch. It means physical-layer damage: a bad cable, a bad patch lead, a connector that was never properly terminated, or interference along the run. It is almost never the device at the end.</p>

<p><strong>Input errors and runts.</strong> Frames shorter than the minimum. Often the same causes as CRC errors, sometimes a duplex mismatch.</p>

<p><strong>Late collisions.</strong> On any modern switched network this should be zero forever. A non-zero count is a duplex mismatch — one end forced to full, the other auto-negotiating down to half — and it produces exactly the intermittent slowness described above.</p>

<p><strong>Output drops.</strong> The switch had traffic to send and nowhere to queue it. Not a fault; a capacity signal. Consistent output drops on an uplink mean that uplink is the bottleneck.</p>

<h2>Rates, not totals</h2>

<p>A switch that has been up for two years will have accumulated errors, and the total tells you almost nothing — some of them may be from a cable that was replaced eighteen months ago.</p>

<p>What matters is whether the number is <em>increasing</em>. Clear the counters, wait a day, look again. A port with a rising CRC count has a live physical problem. A port with a large total and no movement had one, once.</p>

<h2>The comparison that finds it fastest</h2>

<p>Errors on one port and not on its neighbours points at that cable run. Errors across every port on one switch points at the switch, its power, or its earth. Errors on both ends of the same link point at the link itself.</p>

<p>That triangulation takes about two minutes and resolves most "the network is slow" reports faster than any packet capture.</p>

<h2>Do it before the complaint</h2>

<p>All of this is worth reading on a schedule rather than during an outage. A monthly look at error rates across the access switches turns a class of problem that presents as a mystery into a maintenance task with a cable at the end of it.</p>
HTML,
        ],
        [
            'slug' => 'three-two-one-and-what-it-actually-costs',
            'title' => 'Three, two, one — and what it actually costs',
            'excerpt' => 'The rule is quoted everywhere and implemented almost nowhere, because the second half is inconvenient and the third half costs money.',
            'categories' => ['backup-recovery'],
            'published_at' => '2026-07-11 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Three copies of the data, on two different kinds of media, with one of them off site. It is repeated so often that it has stopped being advice and become a slogan, and the slogan is easier to agree with than to implement.</p>

<h2>What each number is actually for</h2>

<p><strong>Three copies</strong> means the live data plus two backups. Not the live data plus one backup — the point is that discovering a corrupt backup should not be the same event as needing it.</p>

<p><strong>Two media</strong> is the one that gets quietly dropped. Two copies on the same NAS is one media type; so is two folders on the same disk. The purpose is to avoid a single failure mode taking both: a controller fault, a firmware bug, a filesystem problem, or a ransomware process that walks every mounted share.</p>

<p><strong>One off site</strong> is the one that costs money, and it is the only one that survives the building.</p>

<h2>The honest costs</h2>

<p>Off-site is where the arithmetic gets uncomfortable, and it is worth doing openly rather than discovering it later.</p>

<p><em>Cloud storage is cheap to write and expensive to read.</em> Most object storage charges little to store and meaningfully more to retrieve — and a restore is, by definition, retrieving all of it at once. The monthly cost is not the number that matters; the number that matters is what a full restore costs, and it is worth asking the provider that question before signing.</p>

<p><em>Bandwidth is the real constraint.</em> Over a 100 Mbps upload, a terabyte takes roughly a day at full line rate, which you will not get. The first seed is the painful one, and if the initial upload cannot complete in a reasonable window then the whole plan needs rethinking rather than starting and hoping.</p>

<p><em>Rotated disks are not obsolete.</em> For many small businesses, two external drives rotated weekly to somebody's house is a legitimate off-site copy: cheap, fast to restore from, and offline between rotations, which is a genuine defence against ransomware. Its weakness is that it depends on a person remembering, which is why the rotation needs to be somebody's named job rather than a good intention.</p>

<h2>The property that is missing from the rule</h2>

<p>The rule was written before ransomware, and it does not say anything about <em>immutability</em>. A backup the live system can write to is a backup the live system can encrypt.</p>

<p>Whatever the media, at least one copy should be unreachable from the production environment: offline between rotations, or held under a retention lock the production credentials cannot lift. That is the property that decides whether a backup survives a bad week, and it is not implied by any of the three numbers.</p>

<h2>Then test it</h2>

<p>Restore something on a schedule. Not a test-restore of a test file into a test folder — a real file that somebody would actually ask for, restored the way it would be on the day. Time it, and write the time down. That number is the recovery estimate; everything else is a guess.</p>
HTML,
        ],
        [
            'slug' => 'cable-management-is-a-maintenance-decision',
            'title' => 'Cable management is a maintenance decision, not a tidiness one',
            'excerpt' => 'A tidy rack looks like pride in the work. What it actually buys is the difference between a five-minute change and an outage.',
            'categories' => ['infrastructure'],
            'published_at' => '2026-06-27 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Cable management gets treated as aesthetics — something to photograph when the install is finished. It is not. Every decision in a rack is a bet on how long the next change will take and how likely it is to break something unrelated.</p>

<h2>The cost is paid later, by somebody else</h2>

<p>A rack wired without discipline works exactly as well as a tidy one on day one. Both pass traffic. The difference appears the first time somebody has to change one thing at 7am with the office arriving at 9.</p>

<p>In a tidy rack, tracing a run takes seconds and pulling it disturbs nothing. In the other kind, the cable disappears into a bundle, and the only way to find its other end is to pull gently and watch what moves — which is how an unrelated service goes down during a routine change.</p>

<h2>Slack is not waste</h2>

<p>The most common mistake is cutting patch leads to the exact length. It looks precise and it means a switch cannot be slid forward on its rails without unplugging it, which turns "check the serial number" into a maintenance window.</p>

<p>Leave enough slack for the equipment to travel its full rail extension with everything still connected. Service loops belong at the side of the rack where they can be dressed, not coiled behind the equipment where they block airflow.</p>

<h2>Airflow is a cabling problem</h2>

<p>Rack equipment pulls air front to back. A dense bundle of cables across the rear of a switch is a wall in front of its exhaust, and the fans respond by working harder and lasting less time.</p>

<p>Blanking panels matter for the same reason: an open U in a populated rack lets hot exhaust air circulate round to the front and be drawn straight back in. They cost very little and they are almost always missing.</p>

<h2>Label both ends, at the time</h2>

<p>Labels applied later never happen. The moment to label a cable is when it is being terminated, because that is the only moment when somebody knows for certain what is at the other end.</p>

<p>Both ends, the same scheme, and a scheme that means something without a document — a label reading <code>2F-24</code> tells the next engineer where to go; one reading <code>Cable 47</code> requires a spreadsheet that will be lost.</p>

<h2>The photograph is the documentation</h2>

<p>Photograph the front and rear of every rack when the work is finished, and again after any significant change. It costs a minute, it survives staff turnover, and it answers most remote questions without anybody driving to site.</p>
HTML,
        ],
        [
            'slug' => 'what-an-amc-should-actually-cover',
            'title' => 'What an AMC should actually cover',
            'excerpt' => 'Most maintenance contracts are priced on response time and silent on the things that decide whether you ever need to invoke them.',
            'categories' => ['infrastructure'],
            'published_at' => '2026-06-12 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>An annual maintenance contract is usually sold on two numbers: how fast somebody responds, and how much it costs. Both matter. Neither says anything about the work that stops you needing to call.</p>

<h2>Reactive cover is the easy half</h2>

<p>Response time is easy to write into a contract and easy to measure, which is why it dominates the conversation. It is also the half that only matters once something has already gone wrong.</p>

<p>Worth reading carefully: response time is usually the time to <em>respond</em>, not to fix. Those are different commitments and the difference is where most disappointment lives. If restoration time is what matters to the business, that is the thing to ask about, and the honest answer is usually a range rather than a number.</p>

<h2>The preventive half is what you are really buying</h2>

<p>The questions worth asking of any contract:</p>

<ul>
<li><strong>Are backups verified, and by whom?</strong> Not "are they running" — is somebody restoring from them on a schedule and recording the result.</li>
<li><strong>Are firmware and patch levels reviewed?</strong> On a schedule, with a decision recorded each time — including the decision not to update.</li>
<li><strong>Is capacity tracked?</strong> Disk, bandwidth, PoE budget, UPS runtime. Every one degrades quietly and every one has a threshold where it stops being a graph and becomes an outage.</li>
<li><strong>Are UPS batteries tested?</strong> A UPS reports a healthy battery right up until it is asked to hold load. Batteries are consumables with a service life measured in a few years, and testing is the only way to know where in that life you are.</li>
<li><strong>Are logs reviewed by somebody?</strong> Collection is not review. The switch error counters that predict a cable failure are only useful if a person looks at them.</li>
</ul>

<h2>Ask what is excluded</h2>

<p>Every contract has exclusions and they are the most informative part of the document. Common ones worth checking: parts, out-of-hours attendance, anything the vendor calls a "project", and equipment past end of support.</p>

<p>That last one deserves attention. Hardware beyond the manufacturer's support date cannot be patched and often cannot be replaced quickly, and a contract that covers it is promising something it can only partly deliver. The useful conversation is about which equipment is approaching that date and what replacing it will cost — before the failure, not after.</p>

<h2>A contract should produce a document</h2>

<p>The output of good preventive maintenance is an up-to-date picture of the estate: what is installed, what version it runs, when it was last checked, and what is coming to end of life.</p>

<p>If a year of maintenance has not produced that, the contract has been buying attendance rather than maintenance — and the two look identical right up until the day they do not.</p>
HTML,
        ],
        [
            'slug' => 'poe-budgets-why-the-eighth-camera-fails',
            'title' => 'PoE budgets: why the eighth camera fails',
            'excerpt' => 'Seven cameras work. The eighth is identical and does not. Nothing is faulty — the arithmetic ran out.',
            'categories' => ['networking', 'security'],
            'published_at' => '2026-05-29 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>This one has a specific signature. A set of identical devices is installed, most work, and the last one or two behave oddly: they boot, run for a while, then reboot, or they never come up at all. Swapping the device changes nothing. Swapping the port sometimes helps, which sends everyone down the wrong path.</p>

<p>It is almost always the power budget.</p>

<h2>Two numbers, not one</h2>

<p>A PoE switch has a per-port maximum and a total budget, and they are not related in the way people assume. A 24-port switch advertising PoE+ on every port does not have 24 × 30 W available. It has a supply — often 180 W, 370 W or similar — and that supply is shared.</p>

<p>The per-port figure says what one device may draw. The total says how many of them can draw it at once. A switch supporting 30 W per port with a 185 W budget runs six devices at full draw, not twenty-four.</p>

<h2>Work it out before ordering</h2>

<p>The arithmetic is simple and almost nobody does it:</p>

<ol>
<li>Take each device's <em>maximum</em> draw from its datasheet, not its typical draw. A camera's typical figure is measured in daylight; the maximum is with infra-red illuminators on, and the illuminators come on at exactly the time all the cameras need to be working.</li>
<li>Add a margin for cable loss. Power dissipates along the run, and the switch supplies more than the device receives — the longer the run, the bigger the gap.</li>
<li>Compare the total against the switch's budget, and leave headroom for the device somebody adds next year.</li>
</ol>

<p>A pan-tilt-zoom camera is the one that catches people out: it draws modestly at rest and far more while the motor is running, which is a brief peak that happens at the worst moment.</p>

<h2>What the switch does when it runs out</h2>

<p>Behaviour varies and none of it is obvious from the front panel. Some switches refuse power to the next device that asks, which is at least clear. Others shed load by priority, which means an unrelated device goes dark. Others try to supply everything and brown out, which produces the reboot loop.</p>

<p>The last of these is the one that wastes days, because the device looks faulty and behaves faultily and is not.</p>

<h2>How to confirm it in a minute</h2>

<p>Every managed PoE switch will report power consumed against power available, per port and in total. If consumption is sitting near the budget, that is the answer — no further diagnosis is needed.</p>

<p>The fix is either a switch with a larger supply, splitting the load across two switches, or an injector for the devices that need the most. All three are cheaper than the week spent replacing working cameras.</p>
HTML,
        ],
        [
            'slug' => 'firmware-updates-on-a-live-network',
            'title' => 'Firmware updates on a live network',
            'excerpt' => 'The two common policies are update everything immediately and update nothing ever. Both are decisions nobody made deliberately.',
            'categories' => ['security', 'infrastructure'],
            'published_at' => '2026-05-14 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Firmware sits in an awkward place. It is the layer with the most serious vulnerabilities and the least appetite for change, because a failed firmware update on a switch is not a rollback — it is a site visit.</p>

<p>So most organisations end up at one of two extremes by default rather than by decision: update immediately because the vendor said so, or never update because the last one caused an outage.</p>

<h2>Neither extreme survives contact</h2>

<p>Updating immediately means running vendor code that has been in the field for days. Firmware regressions are real and they surface in exactly the configurations that are unusual — which, on any network that has grown organically, is most of them.</p>

<p>Never updating means accumulating known, published, exploitable vulnerabilities in the devices that carry every packet. It also means that when an update finally becomes unavoidable, the jump is across several major versions, which is the riskiest kind.</p>

<h2>A workable middle</h2>

<p><strong>Read the release notes and triage.</strong> Most releases are not urgent. A remote unauthenticated vulnerability in a component you expose is urgent; a fix for a feature you do not use is not. This triage takes minutes and it is the step that gets skipped.</p>

<p><strong>Let a release age, unless it cannot.</strong> A few weeks between release and deployment lets other people find the regressions. Security fixes for something reachable from outside are the exception.</p>

<p><strong>Update one first.</strong> One access switch, one access point — something real, in production, whose failure is survivable. Then wait. A regression that only shows under load will not appear in ten minutes.</p>

<p><strong>Never both members of a redundant pair on the same night.</strong> The whole point of the pair is that they fail independently, and identical firmware applied at the same moment removes exactly that property.</p>

<h2>Before you touch anything</h2>

<p>Save the running configuration off the device, and confirm you can read the file. A configuration backup that lives only on the device being updated is not a backup.</p>

<p>Know the rollback path and whether the device actually supports one. Many switches hold two firmware images and can boot the previous one; many access points cannot. That difference decides whether an update is reversible, and it is worth knowing before rather than during.</p>

<p>And check console access. If the update goes wrong, the network is how you would normally reach the device, and the network is what just broke. Somebody needs to be able to get to a physical port, or the recovery plan is a drive.</p>

<h2>Write down what you decided</h2>

<p>Including the decision not to update. A note saying "reviewed, no security content, deferred" is the difference between a considered position and an oversight — and it is what makes the next review take five minutes instead of starting again.</p>
HTML,
        ],
        [
            'slug' => 'nas-permissions-that-do-not-become-a-liability',
            'title' => 'NAS permissions that do not become a liability',
            'excerpt' => 'Shared drives fail slowly. Every exception is reasonable on the day it is made, and the result is a share where everyone can read everything.',
            'categories' => ['security', 'infrastructure'],
            'published_at' => '2026-04-30 09:30:00',
            'featured' => false,
            'body' => <<<'HTML'
<p>Almost every shared drive ends up in the same state: a folder structure nobody planned, permissions granted to individuals as favours, and an <em>Everyone</em> group that quietly has more access than anybody intended. Nothing went wrong on any single day. Each change was reasonable.</p>

<h2>Why it drifts</h2>

<p>The drift has one cause: permissions get granted to people rather than to roles. Somebody in accounts needs a file in the operations folder, so they are added to the operations folder. They move department, or leave, and nobody removes them — because nobody knows the grant was ever made.</p>

<p>Do that for four years and the permissions describe the history of who once asked for something, not who should have access today.</p>

<h2>Groups, always</h2>

<p>Permissions go to groups. People go into groups. That is the whole discipline, and it holds because it makes the two questions separable: <em>what should this role reach</em>, and <em>who is in this role</em>. The first changes rarely; the second changes constantly.</p>

<p>It also makes the audit possible. "Who can read the payroll folder" is answerable in one step when it is a group and requires walking every folder when it is a list of individuals.</p>

<h2>Depth is the enemy</h2>

<p>Set permissions near the top and let them inherit. Every level at which somebody breaks inheritance to make an exception is a level where the effective permission stops being predictable, and nested exceptions six folders deep are where the surprises live.</p>

<p>If a folder needs different access from its parent, that is usually a sign it belongs somewhere else in the structure rather than a sign it needs an exception.</p>

<h2>Deny is a last resort</h2>

<p>An explicit deny overrides allows, which makes it feel like a precise instrument. In practice it is the entry that causes the "I have permission but cannot open it" ticket that takes an afternoon, because the deny is inherited from a folder nobody thought to check.</p>

<p>Almost every case for a deny is better served by removing an allow.</p>

<h2>The share that should not exist</h2>

<p>Every NAS ships with a default public share and it should be the first thing removed. It is the folder that fills with things people meant to move later — which routinely includes scans of documents that were never supposed to be on a general share.</p>

<h2>Review it once a year</h2>

<p>Export the permissions, sit with whoever runs each department, and go through who is in each group. It takes an hour and it is the only thing that reverses the drift. Every leaver who still has access is found in that hour, and nowhere else.</p>
HTML,
        ],
        [
            // One draft, so the CMS list demonstrates the status filter and the
            // public site demonstrably does not show it.
            'slug' => 'switch-stacking-in-practice',
            'title' => 'Switch stacking in practice',
            'excerpt' => 'When stacking earns its licence cost, and when two independent switches serve you better.',
            'categories' => ['networking'],
            'published_at' => null,
            'featured' => false,
            'body' => <<<'HTML'
<p>Stacking simplifies management, but it also turns two failure domains into one.</p>
HTML,
        ],
    ],
];
