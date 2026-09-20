<?php

namespace App\Support\Newsletter;

use App\Models\NewsletterSubscriber;
use App\Support\HtmlSanitiser;

/**
 * Blocks to email HTML.
 *
 * **Tables and inline styles, deliberately, and it is not 2005 nostalgia.**
 * Outlook on Windows renders with Word's HTML engine, which supports no
 * `float`, no `flex`, no `grid` and no reliable `<style>` block; Gmail strips
 * `<head>` entirely. A layout built the way the rest of this project builds
 * layouts arrives as a single unstyled column, and there is no way to find
 * that out from a browser preview. So: nested tables, widths as attributes as
 * well as CSS, and every style declared on the element that uses it.
 *
 * The responsive part is one `@media` block in a `<style>` tag — which Gmail
 * discards, and that is fine: the mobile rules only *narrow* a layout that is
 * already readable at full width, so a client that ignores them shows the
 * desktop version rather than a broken one. Degrading to "correct but wide" is
 * the only safe direction here.
 *
 * Everything an editor typed goes through `HtmlSanitiser` on the way in, so
 * what arrives here is already the allowlisted set; this class composes it and
 * never trusts it.
 */
class EmailRenderer
{
    /** The width every serious template uses, and what Outlook assumes. */
    public const WIDTH = 600;

    /**
     * @param  array<int, array<string, mixed>>  $blocks
     * @param  array<string, string|null>  $branding  logo_url, company, address, site_url
     */
    public static function render(array $blocks, array $branding = []): string
    {
        $body = '';

        foreach ($blocks as $block) {
            $body .= self::block(is_array($block) ? $block : [], $branding);
        }

        return self::document($body, $branding);
    }

    private static function document(string $body, array $branding): string
    {
        $preheader = self::e($branding['preheader'] ?? '');
        $bg = self::colour($branding['background'] ?? null, '#f4f5f2');

        return <<<HTML
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>{$preheader}</title>
        <style type="text/css">
        /* Narrowing only. A client that drops this shows the full-width
           layout, which is correct rather than broken. */
        @media only screen and (max-width: 620px) {
          .nl-wrap { width: 100% !important; }
          .nl-col { display: block !important; width: 100% !important; }
          .nl-pad { padding-left: 20px !important; padding-right: 20px !important; }
          .nl-h1 { font-size: 24px !important; line-height: 32px !important; }
          .nl-hide-sm { display: none !important; }
        }
        </style>
        </head>
        <body style="margin:0;padding:0;background-color:{$bg};">
        <!-- The preheader: shown by the client after the subject, and hidden
             in the message itself. Without it the client invents one from the
             first words of the body, which is usually "View in browser". -->
        <div style="display:none;font-size:1px;color:{$bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{$preheader}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:{$bg};">
        <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" class="nl-wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        {$body}
        </table>
        </td></tr>
        </table>
        </body>
        </html>
        HTML;
    }

    private static function block(array $block, array $branding): string
    {
        $type = (string) ($block['type'] ?? 'text');

        return match ($type) {
            'header' => self::header($block, $branding),
            'heading' => self::heading($block),
            'text' => self::text($block),
            'image' => self::image($block),
            'button' => self::button($block),
            'divider' => self::divider($block),
            'spacer' => self::spacer($block),
            'columns' => self::columns($block),
            'article' => self::article($block),
            'product' => self::product($block),
            'social' => self::social($block, $branding),
            'footer' => self::footer($block, $branding),
            // An unknown block renders as nothing rather than as an error
            // banner in somebody's inbox. A template saved by a newer version
            // of the editor must degrade, not shout.
            default => '',
        };
    }

    private static function header(array $b, array $branding): string
    {
        $logo = $b['logo_url'] ?? $branding['logo_url'] ?? null;
        $company = self::e($b['company'] ?? $branding['company'] ?? '');
        $bg = self::colour($b['background'] ?? null, '#ffffff');

        $mark = $logo
            ? '<img src="'.self::e($logo).'" alt="'.$company.'" width="180" style="display:block;border:0;max-width:180px;height:auto;" />'
            : '<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#3f4d24;">'.$company.'</span>';

        return '<tr><td class="nl-pad" style="padding:28px 32px 12px 32px;background-color:'.$bg.';">'.$mark.'</td></tr>';
    }

    private static function heading(array $b): string
    {
        $level = in_array($b['level'] ?? 1, [1, 2, 3], true) ? (int) $b['level'] : 1;
        $sizes = [1 => '28px', 2 => '22px', 3 => '18px'];
        $align = self::align($b['align'] ?? 'left');

        return '<tr><td class="nl-pad" style="padding:12px 32px 4px 32px;">'
            .'<h'.$level.' class="nl-h'.$level.'" style="margin:0;font-family:Arial,Helvetica,sans-serif;'
            .'font-size:'.$sizes[$level].';line-height:1.3;color:#1d2016;text-align:'.$align.';font-weight:bold;">'
            .self::e($b['text'] ?? '').'</h'.$level.'></td></tr>';
    }

    private static function text(array $b): string
    {
        $align = self::align($b['align'] ?? 'left');

        // Already sanitised on write; run again here because a template
        // shipped with the application is not a request and never went
        // through a form request at all.
        $html = HtmlSanitiser::clean((string) ($b['html'] ?? $b['text'] ?? ''));

        return '<tr><td class="nl-pad" style="padding:8px 32px;font-family:Arial,Helvetica,sans-serif;'
            .'font-size:15px;line-height:24px;color:#3c4234;text-align:'.$align.';">'.$html.'</td></tr>';
    }

    private static function image(array $b): string
    {
        $src = $b['src'] ?? null;

        if (blank($src)) {
            return '';
        }

        // `alt` always, even when empty: a client that blocks images by
        // default — which is most of them — shows this text instead, and the
        // health check counts a missing one.
        $alt = self::e($b['alt'] ?? '');
        $href = $b['href'] ?? null;

        $img = '<img src="'.self::e($src).'" alt="'.$alt.'" width="536" '
            .'style="display:block;border:0;width:100%;max-width:536px;height:auto;border-radius:6px;" />';

        if (filled($href)) {
            $img = '<a href="'.self::e($href).'" style="text-decoration:none;">'.$img.'</a>';
        }

        return '<tr><td class="nl-pad" style="padding:12px 32px;">'.$img.'</td></tr>';
    }

    private static function button(array $b): string
    {
        $label = self::e($b['label'] ?? 'Read more');
        $href = self::e($b['href'] ?? '#');
        $bg = self::colour($b['background'] ?? null, '#4a5a2a');
        $align = self::align($b['align'] ?? 'left');

        /*
         * A table, not an `<a>` with padding.
         *
         * Outlook ignores padding on an inline element, so a styled anchor
         * arrives as underlined text with a coloured background exactly the
         * size of the words. A single-cell table is the shape every email
         * framework converged on for this reason.
         */
        return '<tr><td class="nl-pad" style="padding:16px 32px;" align="'.$align.'">'
            .'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            .'<td align="center" bgcolor="'.$bg.'" style="border-radius:6px;">'
            .'<a href="'.$href.'" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;'
            .'font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">'.$label.'</a>'
            .'</td></tr></table></td></tr>';
    }

    private static function divider(array $b): string
    {
        return '<tr><td class="nl-pad" style="padding:8px 32px;">'
            .'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
            .'<td style="border-top:1px solid #e3e6dd;font-size:0;line-height:0;">&nbsp;</td>'
            .'</tr></table></td></tr>';
    }

    private static function spacer(array $b): string
    {
        $height = max(4, min(80, (int) ($b['height'] ?? 24)));

        return '<tr><td style="height:'.$height.'px;line-height:'.$height.'px;font-size:0;">&nbsp;</td></tr>';
    }

    /**
     * Two or three columns, which stack on a phone.
     *
     * `display:block` in the media query is what stacks them, and the
     * `nl-col` class is on the `<td>` — Outlook keeps them side by side
     * regardless, which is the correct degradation on a desktop client.
     */
    private static function columns(array $b): string
    {
        $columns = array_values(array_filter((array) ($b['columns'] ?? []), 'is_array'));

        if ($columns === []) {
            return '';
        }

        $width = (int) floor(536 / count($columns)) - 12;
        $cells = '';

        foreach ($columns as $column) {
            $inner = '';

            if (filled($column['image'] ?? null)) {
                $inner .= '<img src="'.self::e($column['image']).'" alt="'.self::e($column['alt'] ?? '').'" width="'.$width.'" '
                    .'style="display:block;border:0;width:100%;max-width:'.$width.'px;height:auto;border-radius:6px;margin-bottom:10px;" />';
            }

            if (filled($column['heading'] ?? null)) {
                $inner .= '<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;'
                    .'font-weight:bold;color:#1d2016;">'.self::e($column['heading']).'</p>';
            }

            if (filled($column['text'] ?? null)) {
                $inner .= '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;'
                    .'line-height:21px;color:#3c4234;">'.self::e($column['text']).'</p>';
            }

            if (filled($column['href'] ?? null)) {
                $inner .= '<p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;">'
                    .'<a href="'.self::e($column['href']).'" style="color:#3f4d24;font-weight:bold;text-decoration:underline;">'
                    .self::e($column['link_label'] ?? 'Read more').'</a></p>';
            }

            $cells .= '<td class="nl-col" width="'.$width.'" valign="top" style="width:'.$width.'px;padding:0 6px;">'.$inner.'</td>';
        }

        return '<tr><td class="nl-pad" style="padding:12px 26px;">'
            .'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'.$cells.'</tr></table>'
            .'</td></tr>';
    }

    private static function article(array $b): string
    {
        $out = '';

        if (filled($b['image'] ?? null)) {
            $out .= self::image(['src' => $b['image'], 'alt' => $b['alt'] ?? '', 'href' => $b['href'] ?? null]);
        }

        if (filled($b['heading'] ?? null)) {
            $out .= self::heading(['text' => $b['heading'], 'level' => 2]);
        }

        if (filled($b['text'] ?? null)) {
            $out .= self::text(['html' => '<p>'.self::e($b['text']).'</p>']);
        }

        if (filled($b['href'] ?? null)) {
            $out .= self::button(['label' => $b['link_label'] ?? 'Read the full story', 'href' => $b['href']]);
        }

        return $out;
    }

    private static function product(array $b): string
    {
        $image = filled($b['image'] ?? null)
            ? '<td width="180" valign="top" class="nl-col" style="width:180px;padding-right:16px;">'
                .'<img src="'.self::e($b['image']).'" alt="'.self::e($b['name'] ?? '').'" width="180" '
                .'style="display:block;border:0;width:100%;max-width:180px;height:auto;border-radius:6px;" /></td>'
            : '';

        $body = '<td valign="top" class="nl-col">'
            .'<p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#1d2016;">'
            .self::e($b['name'] ?? '').'</p>';

        if (filled($b['sku'] ?? null)) {
            $body .= '<p style="margin:0 0 8px 0;font-family:Courier,monospace;font-size:12px;color:#6b7263;">'
                .self::e($b['sku']).'</p>';
        }

        if (filled($b['text'] ?? null)) {
            $body .= '<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#3c4234;">'
                .self::e($b['text']).'</p>';
        }

        if (filled($b['href'] ?? null)) {
            $body .= '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;">'
                .'<a href="'.self::e($b['href']).'" style="color:#3f4d24;font-weight:bold;">'
                .self::e($b['link_label'] ?? 'View details').'</a></p>';
        }

        $body .= '</td>';

        return '<tr><td class="nl-pad" style="padding:12px 32px;">'
            .'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
            .$image.$body.'</tr></table></td></tr>';
    }

    private static function social(array $b, array $branding): string
    {
        $links = array_filter((array) ($b['links'] ?? $branding['social'] ?? []));

        if ($links === []) {
            return '';
        }

        $cells = '';

        foreach ($links as $label => $href) {
            // Text rather than icons: an icon is an image, and most clients
            // block images by default — a row of empty boxes is worse than a
            // row of words.
            $cells .= '<td style="padding:0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;">'
                .'<a href="'.self::e($href).'" style="color:#6b7263;text-decoration:underline;">'.self::e($label).'</a></td>';
        }

        return '<tr><td align="center" style="padding:8px 32px;">'
            .'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'.$cells.'</tr></table></td></tr>';
    }

    /**
     * The footer, which carries the two things a marketing email may not ship
     * without: who sent it, and how to stop receiving it.
     *
     * `{{unsubscribe_url}}` is left as a placeholder and filled per recipient
     * — it cannot be baked into the template, because the token identifies the
     * person. The health check refuses a campaign whose HTML does not contain
     * it.
     */
    private static function footer(array $b, array $branding): string
    {
        /*
         * `??` falls through on null and not on an empty string, so a footer
         * block carrying `address => ''` — which is what the editor stores for
         * a field somebody left alone — beat the configured address and the
         * footer came out with none. `?:` is the operator this wanted all
         * along: the block overrides where it *says* something.
         *
         * The guard in front of it is not belt and braces. `?:` reads its left
         * operand, so a block that omits the key **entirely** is a fatal
         * "Undefined array key" rather than a fallback — and that is exactly
         * what a seeded template's footer is, since it carries a company and a
         * line of text and no address at all. Swapping the operator without it
         * turned every "create from a template" into "Not created".
         */
        $company = self::e(($b['company'] ?? null) ?: ($branding['company'] ?? ''));
        $address = self::e(($b['address'] ?? null) ?: ($branding['address'] ?? ''));
        $text = self::e($b['text'] ?? 'You are receiving this because you subscribed to our updates.');

        return '<tr><td class="nl-pad" style="padding:24px 32px 32px 32px;background-color:#f7f8f4;'
            .'border-top:1px solid #e3e6dd;font-family:Arial,Helvetica,sans-serif;font-size:12px;'
            .'line-height:19px;color:#6b7263;text-align:center;">'
            .'<p style="margin:0 0 6px 0;font-weight:bold;color:#3c4234;">'.$company.'</p>'
            .($address !== '' ? '<p style="margin:0 0 10px 0;">'.$address.'</p>' : '')
            .'<p style="margin:0 0 10px 0;">'.$text.'</p>'
            .'<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#6b7263;text-decoration:underline;">'
            .'Unsubscribe from these emails</a></p>'
            .'</td></tr>';
    }

    /**
     * Fill in the per-person values.
     *
     * Escaped, because a subscriber's own first name reaches this — a company
     * called `A <> B` is legitimate and must not be able to close a tag. The
     * fallback matters as much: `Hello ,` is the classic sign of a mail merge
     * that went wrong, and it is what an empty first name produces.
     */
    public static function personalise(string $html, ?NewsletterSubscriber $subscriber, array $extra = []): string
    {
        $first = trim((string) $subscriber?->first_name);

        $values = [
            'first_name' => $first !== '' ? $first : 'there',
            'last_name' => trim((string) $subscriber?->last_name),
            'company' => trim((string) $subscriber?->company),
            'email' => (string) $subscriber?->email,
            ...$extra,
        ];

        foreach ($values as $key => $value) {
            $html = str_replace(
                ['{{'.$key.'}}', '{{ '.$key.' }}'],
                $key === 'unsubscribe_url' ? (string) $value : self::e((string) $value),
                $html,
            );
        }

        /*
         * Anything still in double braces is removed rather than sent.
         *
         * A typo — `{{firstname}}` — would otherwise arrive in somebody's
         * inbox as literal braces, which is the most obviously amateur thing a
         * mailing can do. The specification asks for exactly this.
         */
        return preg_replace('/\{\{\s*[a-z_]+\s*\}\}/i', '', $html) ?? $html;
    }

    private static function align(mixed $value): string
    {
        return in_array($value, ['left', 'center', 'right'], true) ? $value : 'left';
    }

    private static function colour(?string $value, string $fallback): string
    {
        return $value !== null && preg_match('/^#[0-9a-f]{6}$/i', $value) ? $value : $fallback;
    }

    private static function e(?string $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
