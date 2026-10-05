<?php

namespace Tests\Unit;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\FormReader;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\PriceReader;
use App\Support\WordPress\Rendered\RenderedSections;
use Tests\TestCase;

/**
 * A rendered WordPress page read for what its page builder drew (0.110.0):
 * each signature family's widgets, the grouping of neighbours, the heading
 * and kicker taken from above, and the fallbacks that keep every word.
 */
class RenderedSectionsTest extends TestCase
{
    private function walker(): RenderedSections
    {
        return new RenderedSections(
            fn (string $html) => trim($html) === '' ? null : $html,
            fn (string $src) => 'media/'.basename((string) parse_url($src, PHP_URL_PATH)),
        );
    }

    /** @return list<Piece> */
    private function pieces(string $html): array
    {
        return $this->walker()->pieces($html);
    }

    /** @return list<string> */
    private function kinds(string $html): array
    {
        return array_map(fn (Piece $p) => $p->kind, $this->pieces($html));
    }

    // ── Elementor ──────────────────────────────────────────────────────

    private function elementorPrice(string $name, string $whole, string $period, bool $ribbon = false): string
    {
        return '<div class="elementor-column elementor-col-33"><div class="elementor-widget-wrap">'
            .'<div class="elementor-element elementor-widget elementor-widget-price-table" data-widget_type="price-table.default"><div class="elementor-widget-container">'
            .'<div class="elementor-price-table"><div class="elementor-price-table__header"><h3 class="elementor-price-table__heading">'.$name.'</h3>'
            .'<span class="elementor-price-table__subheading">For small offices</span></div>'
            .'<div class="elementor-price-table__price"><span class="elementor-price-table__currency">₹</span><span class="elementor-price-table__integer-part">'.$whole.'</span>'
            .'<div class="elementor-price-table__after-price"><span class="elementor-price-table__fractional-part">00</span><span class="elementor-price-table__period elementor-typo-excluded">'.$period.'</span></div></div>'
            .'<ul class="elementor-price-table__features-list"><li><div class="elementor-price-table__feature-inner"><i class="fa fa-check"></i><span>Remote support</span></div></li>'
            .'<li><div class="elementor-price-table__feature-inner"><span>Quarterly visit</span></div></li></ul>'
            .'<div class="elementor-price-table__footer"><a class="elementor-price-table__button elementor-button" href="/contact">Choose plan</a></div></div>'
            .($ribbon ? '<div class="elementor-ribbon"><div class="elementor-ribbon-inner">Popular</div></div>' : '')
            .'</div></div></div></div>';
    }

    public function test_elementor_price_tables_in_columns_are_one_pricing_piece_under_their_heading(): void
    {
        $html = '<div class="elementor-section"><div class="elementor-container">'
            .'<div class="elementor-widget elementor-widget-heading"><div class="elementor-widget-container"><h2 class="elementor-heading-title">Support plans</h2></div></div>'
            .'</div></div><div class="elementor-section"><div class="elementor-container">'
            .$this->elementorPrice('Basic', '1,999', '/month').$this->elementorPrice('Plus', '3,999', '/month', true).$this->elementorPrice('Enterprise', '9,999', '/month')
            .'</div></div>';

        $pieces = $this->pieces($html);

        $this->assertCount(1, $pieces);
        $this->assertSame('pricing', $pieces[0]->kind);
        $this->assertSame('Support plans', $pieces[0]->heading);
        $this->assertCount(3, $pieces[0]->items);
        $plus = $pieces[0]->items[1];
        $this->assertSame('Plus', $plus['name']);
        $this->assertSame(399900, $plus['price_monthly_paise']);
        $this->assertSame('Popular', $plus['badge']);
        $this->assertTrue($plus['highlighted']);
        $this->assertSame(['Remote support', 'Quarterly visit'], $plus['features']);
        $this->assertSame(['label' => 'Choose plan', 'href' => '/contact'], $plus['cta']);
        $this->assertSame('For small offices', $plus['description']);
        $this->assertArrayNotHasKey('highlighted', $pieces[0]->items[0]);
    }

    public function test_elementor_counters_testimonials_accordion_icon_boxes_and_tabs(): void
    {
        $counter = fn (string $to, string $suffix, string $title) => '<div class="elementor-widget elementor-widget-counter" data-widget_type="counter.default"><div class="elementor-widget-container"><div class="elementor-counter">'
            .'<div class="elementor-counter-number-wrapper"><span class="elementor-counter-number-prefix"></span><span class="elementor-counter-number" data-duration="2000" data-to-value="'.$to.'" data-from-value="0">0</span><span class="elementor-counter-number-suffix">'.$suffix.'</span></div>'
            .'<div class="elementor-counter-title">'.$title.'</div></div></div></div>';
        $box = fn (string $title) => '<div class="elementor-widget elementor-widget-icon-box"><div class="elementor-widget-container"><div class="elementor-icon-box-wrapper"><div class="elementor-icon-box-content">'
            .'<h3 class="elementor-icon-box-title"><span>'.$title.'</span></h3><p class="elementor-icon-box-description">We look after it for you.</p></div></div></div></div>';

        $html = '<p class="elementor-heading-title">Why us</p><h2 class="elementor-heading-title">By the numbers</h2>'
            .$counter('16', '+', 'Years').$counter('340', '+', 'Sites').$counter('12500', '', 'Tickets closed')
            .'<h2>Clients say</h2>'
            .'<div class="elementor-widget elementor-widget-testimonial"><div class="elementor-widget-container"><div class="elementor-testimonial-wrapper">'
            .'<div class="elementor-testimonial-content">They kept our network up through the monsoon.</div>'
            .'<div class="elementor-testimonial-meta"><div class="elementor-testimonial-details"><div class="elementor-testimonial-name">Asha Rao</div><div class="elementor-testimonial-job">IT head, Meridian</div></div></div></div></div></div>'
            .'<h2>Questions</h2>'
            .'<div class="elementor-widget elementor-widget-accordion"><div class="elementor-accordion">'
            .'<div class="elementor-accordion-item"><div class="elementor-tab-title"><a class="elementor-accordion-title">Do you visit?</a></div><div class="elementor-tab-content"><p>Yes, within four hours.</p></div></div>'
            .'<div class="elementor-accordion-item"><div class="elementor-tab-title"><a class="elementor-accordion-title">Weekends?</a></div><div class="elementor-tab-content"><p>On the plus plan.</p></div></div>'
            .'</div></div>'
            .$box('Managed Wi-Fi').$box('Firewalls').$box('Backups')
            .'<div class="elementor-widget elementor-widget-tabs"><div class="elementor-tabs">'
            .'<div class="elementor-tabs-wrapper"><div class="elementor-tab-title elementor-tab-desktop-title" data-tab="1">Offices</div><div class="elementor-tab-title elementor-tab-desktop-title" data-tab="2">Factories</div></div>'
            .'<div class="elementor-tabs-content-wrapper"><div class="elementor-tab-title elementor-tab-mobile-title">Offices</div><div class="elementor-tab-content" data-tab="1"><p>Desks and Wi-Fi.</p></div>'
            .'<div class="elementor-tab-title elementor-tab-mobile-title">Factories</div><div class="elementor-tab-content" data-tab="2"><p>Rugged switches.</p></div></div></div></div>';

        $pieces = $this->pieces($html);
        $this->assertSame(['figures', 'testimonial', 'faq', 'features', 'tabs'], array_map(fn ($p) => $p->kind, $pieces));

        $this->assertSame('By the numbers', $pieces[0]->heading);
        $this->assertSame('Why us', $pieces[0]->data['kicker']);
        $this->assertSame([['value' => '16+', 'label' => 'Years'], ['value' => '340+', 'label' => 'Sites'], ['value' => '12,500', 'label' => 'Tickets closed']], $pieces[0]->items);
        $this->assertSame(['quote' => 'They kept our network up through the monsoon.', 'name' => 'Asha Rao', 'role' => 'IT head, Meridian'], $pieces[1]->items[0]);
        $this->assertSame('Questions', $pieces[2]->heading);
        $this->assertSame(['question' => 'Do you visit?', 'answer' => 'Yes, within four hours.'], $pieces[2]->items[0]);
        $this->assertSame(['Managed Wi-Fi', 'Firewalls', 'Backups'], array_column($pieces[3]->items, 'title'));
        $this->assertSame(['Offices', 'Factories'], array_column($pieces[4]->items, 'label'));
        $this->assertSame('Rugged switches.', $pieces[4]->items[1]['body']);
    }

    public function test_an_elementor_form_and_a_youtube_video_widget(): void
    {
        $html = '<div class="elementor-widget elementor-widget-video" data-settings="{&quot;youtube_url&quot;:&quot;https:\/\/www.youtube.com\/watch?v=XHOmBV4js_E&quot;}"><div class="elementor-widget-container"><div class="elementor-wrapper"><div class="elementor-video"></div></div></div></div>'
            .'<div class="elementor-widget elementor-widget-form"><div class="elementor-widget-container">'
            .'<form class="elementor-form" method="post" name="New Form"><input type="hidden" name="post_id" value="12"><input type="hidden" name="form_id" value="4f1e2a9">'
            .'<div class="elementor-form-fields-wrapper">'
            .'<div class="elementor-field-group elementor-col-50 elementor-field-required"><label for="form-field-name" class="elementor-field-label">Name</label><input type="text" name="form_fields[name]" id="form-field-name" required></div>'
            .'<div class="elementor-field-group elementor-col-50"><label for="form-field-email" class="elementor-field-label">Email</label><input type="email" name="form_fields[email]" id="form-field-email" required aria-required="true"></div>'
            .'<div class="elementor-field-group elementor-col-100"><label for="form-field-field_9c1b2" class="elementor-field-label">Company name</label><input type="text" name="form_fields[field_9c1b2]" id="form-field-field_9c1b2"></div>'
            .'<div class="elementor-field-group elementor-col-100"><label for="form-field-message">Message</label><textarea name="form_fields[message]" id="form-field-message"></textarea></div>'
            .'<div class="elementor-field-group elementor-col-100"><input size="1" type="text" name="form_fields[website]" class="elementor-field elementor-field-textual" style="display:none"></div>'
            .'<div class="elementor-field-group elementor-field-type-submit"><button type="submit" class="elementor-button"><span class="elementor-button-text">Request a call</span></button></div>'
            .'</div></form></div></div>';

        $pieces = $this->pieces($html);
        $this->assertSame(['video', 'form'], array_map(fn ($p) => $p->kind, $pieces));
        $this->assertSame('XHOmBV4js_E', $pieces[0]->data['youtube']);

        $form = $pieces[1]->data;
        $this->assertSame('elementor:4f1e2a9', $form['key']);
        $this->assertSame('Request a call', $form['submit_label']);
        $this->assertNull($form['name']);
        $this->assertSame(['name', 'email', 'company_name', 'message'], array_column($form['fields'], 'name'));
        $this->assertSame(['text', 'email', 'text', 'textarea'], array_column($form['fields'], 'kind'));
        $this->assertTrue($form['fields'][0]['required']);
        $this->assertSame('half', $form['fields'][0]['width']);
        $this->assertSame('full', $form['fields'][2]['width']);
    }

    // ── Divi ───────────────────────────────────────────────────────────

    public function test_divi_pricing_blurbs_toggles_counters_and_bars(): void
    {
        $table = fn (string $name, string $sum, string $extra = '') => '<div class="et_pb_pricing_table et_pb_pricing_table_0'.$extra.'"><div class="et_pb_pricing_heading"><h2 class="et_pb_pricing_title">'.$name.'</h2></div>'
            .'<div class="et_pb_pricing_content_top"><span class="et_pb_et_price"><span class="et_pb_dollar_sign">$</span><span class="et_pb_sum">'.$sum.'</span><span class="et_pb_frequency">/mo</span></span></div>'
            .'<div class="et_pb_pricing_content"><ul class="et_pb_pricing"><li><span>Email support</span></li><li class="et_pb_not_available"><span>Phone support</span></li></ul></div>'
            .'<div class="et_pb_button_wrapper"><a class="et_pb_button et_pb_pricing_table_button" href="https://example.com/buy">Sign up</a></div></div>';

        $html = '<div class="et_pb_module et_pb_pricing_tables_0 et_pb_pricing clearfix"><div class="et_pb_pricing_table_wrap">'.$table('Starter', '19').$table('Pro', '49', ' et_pb_featured_table').'</div></div>'
            .'<div class="et_pb_module et_pb_blurb"><div class="et_pb_blurb_content"><div class="et_pb_main_blurb_image"><img src="https://site.test/i.png" alt=""></div><div class="et_pb_blurb_container"><h4 class="et_pb_module_header"><a href="/services/amc">AMC</a></h4><div class="et_pb_blurb_description"><p>Yearly care.</p></div></div></div></div>'
            .'<div class="et_pb_module et_pb_toggle et_pb_toggle_close"><h5 class="et_pb_toggle_title">How fast?</h5><div class="et_pb_toggle_content clearfix"><p>Four hours.</p></div></div>'
            .'<div class="et_pb_module et_pb_number_counter"><div class="percent" data-number-value="250" data-number-separator=","><p><span class="percent-value"></span><span class="percent-sign">+</span></p></div><h3 class="title">Racks installed</h3></div>'
            .'<ul class="et_pb_module et_pb_counters"><li class="et_pb_counter_0"><span class="et_pb_counter_title">Networking</span><span class="et_pb_counter_container"><span class="et_pb_counter_amount" data-width="90%"><span class="et_pb_counter_amount_number">90%</span></span></span></li>'
            .'<li class="et_pb_counter_1"><span class="et_pb_counter_title">Storage</span><span class="et_pb_counter_container"><span class="et_pb_counter_amount" data-width="75%"></span></span></li></ul>';

        $pieces = $this->pieces($html);
        $this->assertSame(['pricing', 'features', 'faq', 'figures', 'bars'], array_map(fn ($p) => $p->kind, $pieces));

        // Dollars are kept as they were written, never stored as rupees.
        $this->assertSame(['name' => 'Starter', 'price_label' => '$19', 'period' => 'mo', 'features' => ['Email support'], 'cta' => ['label' => 'Sign up', 'href' => 'https://example.com/buy']], $pieces[0]->items[0]);
        $this->assertTrue($pieces[0]->items[1]['highlighted']);
        $this->assertSame(['title' => 'AMC', 'body' => 'Yearly care.', 'href' => '/services/amc'], $pieces[1]->items[0]);
        $this->assertSame(['question' => 'How fast?', 'answer' => 'Four hours.'], $pieces[2]->items[0]);
        $this->assertSame([['value' => '250+', 'label' => 'Racks installed']], $pieces[3]->items);
        $this->assertSame([['value' => '90%', 'label' => 'Networking', 'percent' => 90], ['value' => '75%', 'label' => 'Storage', 'percent' => 75]], $pieces[4]->items);
    }

    // ── Spectra, Yoast, core ───────────────────────────────────────────

    public function test_spectra_how_to_timeline_and_yoast_faq(): void
    {
        $html = '<div class="wp-block-uagb-how-to"><h3 class="uagb-howto-heading-text">Set up</h3>'
            .'<div class="uagb-how-to-step"><div class="uagb-how-to-step-name">Unbox</div><p class="uagb-how-to-step-text">Check the parts.</p></div>'
            .'<div class="uagb-how-to-step"><div class="uagb-how-to-step-name">Rack it</div><p class="uagb-how-to-step-text">Two people.</p></div></div>'
            .'<div class="wp-block-uagb-content-timeline"><div class="uagb-timeline__field"><div class="uagb-timeline__date-hide">2010</div><h4 class="uagb-timeline__heading">Founded</h4><p class="uagb-timeline-desc-content">In Kolkata.</p></div>'
            .'<div class="uagb-timeline__field"><div class="uagb-timeline__date-hide">2018</div><h4 class="uagb-timeline__heading">Second office</h4></div></div>'
            .'<div class="schema-faq wp-block-yoast-faq-block"><div class="schema-faq-section"><strong class="schema-faq-question">Is it insured?</strong><p class="schema-faq-answer">Yes.</p></div></div>';

        $pieces = $this->pieces($html);
        $this->assertSame(['steps', 'timeline', 'faq'], array_map(fn ($p) => $p->kind, $pieces));
        $this->assertSame([['title' => 'Unbox', 'body' => 'Check the parts.'], ['title' => 'Rack it', 'body' => 'Two people.']], $pieces[0]->items);
        $this->assertSame(['date' => '2010', 'title' => 'Founded', 'body' => 'In Kolkata.'], $pieces[1]->items[0]);
        $this->assertSame(['question' => 'Is it insured?', 'answer' => 'Yes.'], $pieces[2]->items[0]);
    }

    public function test_a_core_gallery_takes_the_full_size_files_and_captions(): void
    {
        $html = '<figure class="wp-block-gallery has-nested-images columns-2">'
            .'<figure class="wp-block-image size-large"><a href="https://site.test/wp-content/uploads/a.jpg"><img src="https://site.test/wp-content/uploads/a-1024x768.jpg" alt="Rack"></a><figcaption class="wp-element-caption">Day one</figcaption></figure>'
            .'<figure class="wp-block-image size-large"><img src="data:image/gif;base64,R0lGOD" data-src="https://site.test/wp-content/uploads/b.jpg" alt=""></figure>'
            .'<figure class="wp-block-image size-large"><img src="https://site.test/wp-content/uploads/a.jpg" alt="Again"></figure>'
            .'</figure>';

        $pieces = $this->pieces($html);
        $this->assertSame('gallery', $pieces[0]->kind);
        $this->assertSame([
            ['src' => 'https://site.test/wp-content/uploads/a.jpg', 'alt' => 'Rack', 'caption' => 'Day one'],
            ['src' => 'https://site.test/wp-content/uploads/b.jpg'],
        ], $pieces[0]->items);
    }

    public function test_contact_form_7_and_wpforms_with_groups_honeypots_and_uploads(): void
    {
        $cf7 = '<div class="wpcf7 no-js" id="wpcf7-f123-p45-o1" lang="en-US"><div class="screen-reader-response"></div>'
            .'<form action="/contact/#wpcf7-f123-p45-o1" method="post" class="wpcf7-form init"><div style="display: none;"><input type="hidden" name="_wpcf7" value="123"><input type="hidden" name="_wpnonce" value="x"></div>'
            .'<p><label> Your name<br><span class="wpcf7-form-control-wrap" data-name="your-name"><input size="40" class="wpcf7-form-control wpcf7-text wpcf7-validates-as-required" aria-required="true" type="text" name="your-name"></span></label></p>'
            .'<p><label> Your email<br><span class="wpcf7-form-control-wrap"><input class="wpcf7-form-control wpcf7-email" type="email" name="your-email"></span></label></p>'
            .'<p><label> Service<br><span class="wpcf7-form-control-wrap"><select name="menu-service" class="wpcf7-select"><option value="">—Please choose an option—</option><option value="Wi-Fi">Wi-Fi</option><option value="CCTV">CCTV</option></select></span></label></p>'
            .'<p><span class="wpcf7-form-control-wrap"><span class="wpcf7-list-item"><label><input type="checkbox" name="acceptance-1" value="1"><span class="wpcf7-list-item-label">I agree to be contacted</span></label></span></span></p>'
            .'<p><label> Your file<br><input type="file" name="file-cv"></label></p>'
            .'<p><input class="wpcf7-form-control wpcf7-submit" type="submit" value="Send enquiry"></p>'
            .'<div class="wpcf7-response-output" aria-hidden="true"></div></form></div>';

        $wpforms = '<div class="wpforms-container wpforms-container-full" id="wpforms-45"><form id="wpforms-form-45" class="wpforms-validate wpforms-form" data-formid="45" method="post">'
            .'<div class="wpforms-field-container">'
            .'<div id="wpforms-45-field_1-container" class="wpforms-field wpforms-field-name"><label class="wpforms-field-label" for="wpforms-45-field_1">Full name <span class="wpforms-required-label">*</span></label><input type="text" id="wpforms-45-field_1" name="wpforms[fields][1]" required></div>'
            .'<div id="wpforms-45-field_3-container" class="wpforms-field wpforms-field-radio"><label class="wpforms-field-label">Preferred contact</label><ul><li><input type="radio" id="r1" name="wpforms[fields][3]" value="Phone"><label class="wpforms-field-label-inline" for="r1">Phone</label></li><li><input type="radio" id="r2" name="wpforms[fields][3]" value="Email"><label class="wpforms-field-label-inline" for="r2">Email</label></li></ul></div>'
            .'<div class="wpforms-field wpforms-field-hp"><label for="wpforms-45-field-hp" class="wpforms-field-label">Phone</label><input type="text" name="wpforms[hp]" id="wpforms-45-field-hp" class="wpforms-field-medium"></div>'
            .'</div><div class="wpforms-submit-container"><button type="submit" name="wpforms[submit]" class="wpforms-submit">Submit</button></div></form></div>';

        $pieces = $this->pieces($cf7.'<p>Or write to us.</p>'.$wpforms);
        $this->assertSame(['form', 'text', 'form'], array_map(fn ($p) => $p->kind, $pieces));

        $one = $pieces[0]->data;
        $this->assertSame('cf7:123', $one['key']);
        $this->assertSame('Send enquiry', $one['submit_label']);
        $this->assertSame(['name', 'email', 'menu_service', 'acceptance'], array_column($one['fields'], 'name'));
        $this->assertSame(['text', 'email', 'select', 'checkbox'], array_column($one['fields'], 'kind'));
        $this->assertSame('Your name', $one['fields'][0]['label']);
        $this->assertTrue($one['fields'][0]['required']);
        $this->assertSame([['value' => 'Wi-Fi', 'label' => 'Wi-Fi'], ['value' => 'CCTV', 'label' => 'CCTV']], $one['fields'][2]['options']);
        $this->assertSame('—Please choose an option—', $one['fields'][2]['placeholder']);
        $this->assertSame('I agree to be contacted', $one['fields'][3]['label']);
        $this->assertSame(['Your file'], $one['dropped']);

        $two = $pieces[2]->data;
        $this->assertSame('wpforms:45', $two['key']);
        $this->assertSame(['full_name', 'preferred_contact'], array_column($two['fields'], 'name'));
        $this->assertSame('Full name', $two['fields'][0]['label']);
        $this->assertSame('select', $two['fields'][1]['kind']);
        $this->assertSame(['Phone', 'Email'], array_column($two['fields'][1]['options'], 'value'));
    }

    public function test_options_without_a_value_are_choices_named_by_their_text(): void
    {
        $pieces = $this->pieces('<form><label>Service<select name="service"><option value="">Choose…</option><option>Wi-Fi</option><option>CCTV</option></select></label>'
            .'<label>Size<select name="size"><option>Small</option><option>Large</option></select></label><button>Go</button></form>');

        $fields = $pieces[0]->data['fields'];
        $this->assertSame([['value' => 'Wi-Fi', 'label' => 'Wi-Fi'], ['value' => 'CCTV', 'label' => 'CCTV']], $fields[0]['options']);
        $this->assertSame('Choose…', $fields[0]['placeholder']);
        $this->assertSame(['Small', 'Large'], array_column($fields[1]['options'], 'value'), 'a first option with no value attribute is a choice, not a prompt');
    }

    public function test_a_search_box_and_a_menu_are_not_forms_or_text(): void
    {
        $pieces = $this->pieces('<form role="search" class="search-form"><label>Search for:<input type="search" name="s"></label><button>Search</button></form><nav><a href="/a">A</a></nav><p>Body.</p>');

        $this->assertSame(['text'], array_map(fn ($p) => $p->kind, $pieces));
        $this->assertSame('<p>Body.</p>', $pieces[0]->html);
    }

    // ── the generic fallbacks ─────────────────────────────────────────

    public function test_a_row_of_cards_each_with_a_price_a_list_and_a_button_is_pricing(): void
    {
        $card = fn (string $name, string $price) => '<div class="wp-block-column"><div class="card"><h3>'.$name.'</h3><p><strong>'.$price.'</strong> per year</p><ul><li>One</li><li>Two</li></ul><a href="/contact">Ask</a></div></div>';

        $pieces = $this->pieces('<div class="wp-block-columns">'.$card('Silver', '₹12,000').$card('Gold', '₹24,000').'</div>');

        $this->assertSame('pricing', $pieces[0]->kind);
        $this->assertSame(1200000, $pieces[0]->items[0]['price_yearly_paise']);
        $this->assertSame(['One', 'Two'], $pieces[0]->items[1]['features']);
    }

    public function test_prices_become_paise_only_in_rupees_with_a_period(): void
    {
        $this->assertSame(['price_monthly_paise' => 199950], PriceReader::price('₹1,999.50', '/month'));
        $this->assertSame(['price_yearly_paise' => 2400000], PriceReader::price('Rs. 24000 per year'));
        $this->assertSame(['price_label' => '₹4,999'], PriceReader::price('₹4,999'));
        $this->assertSame(['price_label' => '$49', 'period' => 'per month'], PriceReader::price('$49/mo'));
        $this->assertSame(['price_label' => 'Custom'], PriceReader::price('Custom'));
        $this->assertNull(PriceReader::price(''));
    }

    public function test_a_piece_that_fails_its_rules_falls_back_to_its_words(): void
    {
        // One milestone is not a timeline (two at least); its words are kept.
        $html = '<div class="timeline-item"><span class="date">2010</span><h4>Founded</h4></div>';
        $rows = $this->walker()->toSections($html);

        $this->assertCount(1, $rows);
        $this->assertSame('rich_text', $rows[0]['type']);
        $this->assertStringContainsString('Founded', $rows[0]['data']['body']);
    }

    public function test_without_parts_a_form_pricing_and_gallery_stay_text(): void
    {
        $rows = $this->walker()->toSections($this->elementorPrice('Basic', '999', '/month'));

        $this->assertSame(['rich_text'], array_column($rows, 'type'));
        $this->assertStringContainsString('Basic', $rows[0]['data']['body']);
    }

    public function test_sections_from_pieces_heading_split_and_dividers(): void
    {
        $html = '<hr><h2>About</h2><p>We fit networks.</p>'
            .'<div class="elementor-widget elementor-widget-divider"><div class="elementor-divider"><span class="elementor-divider-separator"></span></div></div>'
            .'<div class="counter"><span class="count" data-to="40">0</span><span class="title">Engineers</span></div>'
            .'<div class="counter"><span class="count" data-to="9">0</span><span class="title">Cities</span></div>'
            .'<div class="testimonial-item"><blockquote>Fast.</blockquote><span class="author-name">Neil</span></div>'
            .'<div class="testimonial-item"><blockquote>Kind.</blockquote><span class="author-name">Asha</span></div><hr>';

        $rows = $this->walker()->toSections($html);

        $this->assertSame(['rich_text', 'divider', 'stats', 'testimonials'], array_column($rows, 'type'));
        $this->assertSame('About', $rows[0]['data']['heading']);
        $this->assertSame(['display' => 'figures', 'columns' => 2, 'items' => [['value' => '40', 'label' => 'Engineers'], ['value' => '9', 'label' => 'Cities']]], $rows[2]['data']);
        $this->assertSame(['Neil', 'Asha'], array_column($rows[3]['data']['items'], 'name'));
    }

    public function test_a_cover_opens_the_page_as_its_hero_and_only_at_the_top(): void
    {
        $cover = '<div class="wp-block-cover"><span class="wp-block-cover__background"></span><img class="wp-block-cover__image-background" src="https://site.test/wp-content/uploads/hero.jpg" alt="">'
            .'<div class="wp-block-cover__inner-container"><h1>Networks that stay up</h1><p>Since 2010.</p><div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="/contact">Talk to us</a></div></div></div></div>';

        $rows = $this->walker()->toSections($cover.'<p>More.</p>');
        $this->assertSame('hero', $rows[0]['type']);
        $this->assertSame(['heading' => 'Networks that stay up', 'lede' => 'Since 2010.', 'layout' => 'cover', 'image_path' => 'media/hero.jpg', 'primary' => ['label' => 'Talk to us', 'href' => '/contact']], $rows[0]['data']);

        // Further down, a cover is its words and its picture, split at its heading.
        $later = $this->walker()->toSections('<p>Intro.</p>'.$cover);
        $this->assertSame(['rich_text', 'rich_text'], array_column($later, 'type'));
        $this->assertSame('Networks that stay up', $later[1]['data']['heading']);
    }

    public function test_the_forms_on_a_page_are_listed_in_order(): void
    {
        $forms = RenderedSections::forms('<p>x</p><div class="gform_wrapper" id="gform_wrapper_2"><form id="gform_2" method="post"><ul><li class="gfield gfield_contains_required"><label class="gfield_label" for="input_2_1">Phone</label><div class="ginput_container"><input name="input_1" id="input_2_1" type="tel"></div></li></ul><input type="submit" value="Go"></form></div>');

        $this->assertCount(1, $forms);
        $this->assertSame('gform:2', $forms[0]->data['key']);
        $this->assertSame([['kind' => 'tel', 'name' => 'phone', 'label' => 'Phone', 'required' => true, 'width' => 'full']], $forms[0]->data['fields']);
        $this->assertTrue(FormReader::is(Dom::load('<form><input name="a"></form>')->firstElementChild ?? throw new \RuntimeException));
    }
}
