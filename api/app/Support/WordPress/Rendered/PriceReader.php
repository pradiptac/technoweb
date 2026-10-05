<?php

namespace App\Support\WordPress\Rendered;

use App\Support\LinkPattern;
use DOMElement;
use Illuminate\Support\Str;

/**
 * One plan of a pricing table, read from its rendered markup: its name, its
 * price, what it includes, its button, whether it was the one picked out.
 *
 * **A price is stored as rupees only when it says rupees.** `₹1,999`,
 * `Rs. 1999` and `INR 1999` per month or per year become paise, which the
 * pricing block formats and can switch between; anything else — `$49`,
 * `Custom`, a rupee figure with no period, which the block would otherwise
 * label "per month" — is kept as the words the old site showed.
 */
final class PriceReader
{
    private const NAME = '/(price-table__heading|et_pb_pricing_title|pricing-title|plan-name|plan-title|price-title|package-name|pricing-table-title|pricing-header-title|stk-block-pricing-box__title)$/';

    private const PRICE = '/(price-table__price|et_pb_pricing_content_top|et_pb_sum|pricing-price|plan-price|price-amount|price-value|amount|price)$/';

    private const PERIOD = '/(price-table__period|et_pb_frequency|pricing-period|plan-period|period|duration|frequency)$/';

    private const DESCRIPTION = '/(price-table__subheading|et_pb_pricing_subtitle|pricing-subtitle|plan-description|subheading|subtitle|description)$/';

    private const BADGE = '/(elementor-ribbon-inner|et_pb_featured_table_label|ribbon|badge|tag-label|popular-label)$/';

    private const FEATURED = '/(featured|highlight|highlighted|popular|recommended|best-value|is-featured|et_pb_featured_table)$/';

    public const CURRENCY = '/(₹|rs\.?|inr|\$|€|£|usd|eur|gbp)\s*[\d]/iu';

    /** @return array<string, mixed>|null */
    public static function plan(DOMElement $el, bool $featured = false, string $badge = ''): ?array
    {
        $name = Dom::text(Dom::first($el, self::NAME) ?? Dom::firstTag($el, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'));
        $priceEl = Dom::first($el, self::PRICE);
        $periodEl = Dom::first($el, self::PERIOD);
        $period = Dom::text($periodEl);

        $priceText = Dom::text($priceEl);
        // Elementor splits the figure into parts and raises the paise.
        if ($whole = Dom::first($el, '/^elementor-price-table__integer-part$/')) {
            $fraction = Dom::text(Dom::first($el, '/^elementor-price-table__fractional-part$/'));
            $priceText = Dom::text(Dom::first($el, '/^elementor-price-table__currency$/')).Dom::text($whole).($fraction !== '' ? '.'.$fraction : '');
        }
        if ($priceText === '' || ! preg_match('/\d|free|custom|contact|call|quote/i', $priceText)) {
            // No price element: the first currency figure anywhere in the plan.
            $priceText = preg_match('/(₹|rs\.?|inr|\$|€|£)\s*[\d][\d,]*(\.\d+)?(\s*(\/|per)\s*\w+)?/iu', Dom::text($el), $m) ? $m[0] : '';
        }
        if ($period !== '') {
            $priceText = trim(str_replace($period, '', $priceText));
        }

        $price = self::price($priceText, $period);
        if ($name === '' || $price === null || mb_strlen($name) > 60) {
            return null;
        }

        $features = [];
        foreach (Dom::tags($el, 'li') as $li) {
            if (Dom::has($li, '/(not-available|et_pb_not_available|disabled|unavailable)/')) {
                continue;
            }
            $text = trim(Dom::text($li), " \t+-–—✓✔•");
            if ($text !== '' && mb_strlen($text) <= 120) {
                $features[] = $text;
            }
            if (count($features) === 20) {
                break;
            }
        }

        $badge = $badge !== '' ? $badge : Dom::text(Dom::first($el, self::BADGE));
        $description = Dom::text(Dom::first($el, self::DESCRIPTION));

        $plan = ['name' => $name] + $price;
        if ($description !== '' && $description !== $name && mb_strlen($description) <= 300) {
            $plan['description'] = $description;
        }
        if ($badge !== '' && mb_strlen($badge) <= 30) {
            $plan['badge'] = $badge;
        }
        if ($features !== []) {
            $plan['features'] = $features;
        }
        if ($cta = self::button($el)) {
            $plan['cta'] = $cta;
        }
        if ($featured || $badge !== '' || Dom::has($el, self::FEATURED)) {
            $plan['highlighted'] = true;
        }

        return $plan;
    }

    /**
     * The price fields for a price as written.
     *
     * @return array<string, mixed>|null
     */
    public static function price(string $text, string $period = ''): ?array
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        $period = trim((string) preg_replace('/\s+/u', ' ', $period));
        if ($text === '') {
            return null;
        }

        $all = $text.' '.$period;
        $cycle = match (true) {
            (bool) preg_match('/\b(month|mo|monthly|mth|pm|p\/m)\b/i', $all) => 'monthly',
            (bool) preg_match('/\b(year|yr|annual|annually|yearly|pa|p\/a|annum)\b/i', $all) => 'yearly',
            default => null,
        };

        $rupees = (bool) preg_match('/(₹|\brs\.?|\binr\b)/iu', $text);
        if ($rupees && $cycle !== null && preg_match('/(\d[\d,]*)(\.(\d{1,2}))?/', $text, $m)) {
            $paise = (int) str_replace(',', '', $m[1]) * 100 + (int) str_pad($m[3] ?? '0', 2, '0');

            return [$cycle === 'monthly' ? 'price_monthly_paise' : 'price_yearly_paise' => $paise];
        }

        // Kept as written, the period beside it.
        $label = trim((string) preg_replace('/\s*(\/|per)\s*(month|mo|year|yr|annum)\b.*$/i', '', $text));
        if ($label === '' || mb_strlen($label) > 40) {
            return null;
        }

        return array_filter([
            'price_label' => $label,
            'period' => $period !== '' ? Str::limit(ltrim($period, '/ '), 29, '') : ($cycle === 'monthly' ? 'per month' : ($cycle === 'yearly' ? 'per year' : null)),
        ]);
    }

    /** @return array{label: string, href: string}|null */
    private static function button(DOMElement $el): ?array
    {
        $links = Dom::tags($el, 'a');
        foreach (array_reverse($links) as $link) {
            $label = Dom::text($link);
            $href = html_entity_decode($link->getAttribute('href'), ENT_QUOTES);
            if ($label !== '' && $href !== '' && $href !== '#' && LinkPattern::allows($href)) {
                return ['label' => Str::limit($label, 37, '…'), 'href' => $href];
            }
        }

        return null;
    }
}
