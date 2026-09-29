<?php

namespace Tests\Unit;

use App\Support\Newsletter\EmailExtractor;
use PHPUnit\Framework\TestCase;

/**
 * Reading addresses, names and companies off a page (the website crawl,
 * docs/newsletter.md "Crawling a website"). One case per way a page writes
 * an address, and one per thing that looks like an address and is not.
 */
class EmailExtractorTest extends TestCase
{
    public function test_a_mailto_link_gives_the_address_and_its_text_the_name(): void
    {
        $page = EmailExtractor::extract('<p><a href="mailto:Priya.Nair@Meridian.in?subject=Hi">Priya Nair</a></p>', 'https://meridian.in/team');

        $this->assertSame(['priya.nair@meridian.in'], array_keys($page['emails']));
        $this->assertSame('Priya Nair', $page['emails']['priya.nair@meridian.in']['name']);
    }

    public function test_a_mailto_whose_text_is_the_address_names_nobody(): void
    {
        $page = EmailExtractor::extract('<a href="mailto:sales@meridian.in">sales@meridian.in</a>');

        $this->assertNull($page['emails']['sales@meridian.in']['name']);
    }

    public function test_the_disguised_spellings_are_read(): void
    {
        $page = EmailExtractor::extract('<p>Write to arjun [at] kaveri [dot] in, or sunita(at)kaveri.in, or ravi at kaveri dot co dot in.</p>');

        $this->assertEqualsCanonicalizing(
            ['arjun@kaveri.in', 'sunita@kaveri.in', 'ravi@kaveri.co.in'],
            array_keys($page['emails']),
        );
    }

    public function test_cloudflare_email_protection_is_decoded(): void
    {
        $encoded = self::cfEncode('desk@lotus.in', 0x42);
        $page = EmailExtractor::extract('<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="'.$encoded.'">[email protected]</a>');

        $this->assertSame(['desk@lotus.in'], array_keys($page['emails']));
    }

    public function test_json_ld_carries_a_person_and_the_organisation(): void
    {
        $html = '<script type="application/ld+json">'.json_encode([
            '@context' => 'https://schema.org',
            '@graph' => [
                ['@type' => 'Organization', 'name' => 'Kaveri Textiles', 'email' => 'info@kaveri.in'],
                ['@type' => 'Person', 'name' => 'Meera Iyer', 'email' => 'mailto:meera@kaveri.in', 'worksFor' => ['@type' => 'Organization', 'name' => 'Kaveri Textiles']],
            ],
        ]).'</script>';

        $page = EmailExtractor::extract($html, 'https://kaveri.in/');

        $this->assertSame('Meera Iyer', $page['emails']['meera@kaveri.in']['name']);
        $this->assertSame('Kaveri Textiles', $page['emails']['meera@kaveri.in']['company']);
        $this->assertSame('Kaveri Textiles', $page['emails']['info@kaveri.in']['company']);
        $this->assertSame('Kaveri Textiles', $page['company']);
    }

    public function test_each_directory_card_gives_its_address_its_own_business(): void
    {
        $html = '<html><head><title>Members — Hooghly Traders Association</title></head><body>'
            .'<div class="card"><h3>Anand Hardware</h3><p>Phone 033 1234</p><a href="mailto:anand@anandhardware.in">Email us</a></div>'
            .'<div class="card"><h3>Bose Electricals</h3><p>bose.electricals@gmail.com</p></div>'
            .'<div class="card"><h3>Chatterjee &amp; Sons</h3><p>Mail: office [at] chatterjeesons [dot] in</p></div>'
            .'</body></html>';

        $page = EmailExtractor::extract($html, 'https://hooghlytraders.in/members');

        $this->assertSame('Anand Hardware', $page['emails']['anand@anandhardware.in']['company']);
        $this->assertSame('Bose Electricals', $page['emails']['bose.electricals@gmail.com']['company']);
        $this->assertSame('Chatterjee & Sons', $page['emails']['office@chatterjeesons.in']['company']);
    }

    public function test_a_signpost_heading_is_not_a_company_and_the_page_names_it_instead(): void
    {
        $html = '<html><head><meta property="og:site_name" content="Lotus Clinics"></head><body>'
            .'<section><h2>Contact us</h2><p>reception@lotusclinics.in</p></section></body></html>';

        $page = EmailExtractor::extract($html, 'https://lotusclinics.in/contact');

        $this->assertSame('Lotus Clinics', $page['emails']['reception@lotusclinics.in']['company']);
    }

    public function test_the_title_names_the_business_not_the_page(): void
    {
        $page = EmailExtractor::extract('<html><head><title>Contact — Anand Hardware</title></head><body><p>rahul@anandhardware.in</p></body></html>');
        $this->assertSame('Anand Hardware', $page['company']);

        $home = EmailExtractor::extract('<html><head><title>Anand Hardware | Tools since 1972</title></head><body></body></html>');
        $this->assertSame('Anand Hardware', $home['company']);
    }

    public function test_things_shaped_like_addresses_are_ignored(): void
    {
        $html = '<img src="/img/logo@2x.png" alt=""><p>logo@2x.png</p>'
            .'<script>Sentry.init({dsn:"https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1"})</script>'
            .'<p>0123456789abcdef0123456789abcdef@errors.meridian.in and you@yourdomain.com and name@company.com</p>'
            .'<p>real.person@meridian.in</p>';

        $page = EmailExtractor::extract($html);

        $this->assertSame(['real.person@meridian.in'], array_keys($page['emails']));
    }

    public function test_links_are_resolved_against_the_page_and_fragments_dropped(): void
    {
        $links = EmailExtractor::links(
            '<a href="/about#team">About</a><a href="contact.html">Contact</a><a href="https://other.in/x">Other</a>'
            .'<a href="javascript:void(0)">No</a><a href="tel:+911234">Call</a><a href="#top">Top</a>',
            'https://meridian.in/company/index.html',
        );

        $this->assertSame(
            ['https://meridian.in/about', 'https://meridian.in/company/contact.html', 'https://other.in/x'],
            array_column($links, 'url'),
        );
    }

    /** Cloudflare's scheme: the first byte is the key, every other byte is XOR'd with it. */
    private static function cfEncode(string $email, int $key): string
    {
        $hex = sprintf('%02x', $key);

        foreach (str_split($email) as $char) {
            $hex .= sprintf('%02x', ord($char) ^ $key);
        }

        return $hex;
    }
}
