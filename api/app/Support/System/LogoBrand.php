<?php

namespace App\Support\System;

use App\Models\Setting;

/**
 * Make one of a logo's readings the site's palette (0.173.0, `docs/theming.md`
 * "Brand from a logo").
 *
 * **The setup wizard is the only caller**, and the only place in the product
 * that applies a logo's colours by itself. The console suggests and never
 * writes — the reading fills the Themes screen's fields and Save applies them
 * — but the wizard has no second screen to save from, so a tick there has to
 * mean it.
 *
 * It lives here rather than inside `Wizard.php` for the reason
 * `Branding::apply()` does: the wizard is framework-free and driven by hand,
 * so anything in it that can be decided is better decided somewhere a test
 * can reach.
 */
final class LogoBrand
{
    /**
     * `theme = custom` is what makes the five colours the ones the generator
     * reads; without it a preset would still win. A blank `topbar` is left
     * alone on purpose: blank means the generator derives the bar from the
     * brand in both schemes, which is better than pinning Primary into it.
     *
     * Background and Text are never written. A logo says nothing about the
     * page's ground, and those two are what make a site unreadable.
     *
     * @param  array{primary: string, secondary: string, accent: string, topbar: string}  $reading
     */
    public static function apply(array $reading): void
    {
        $values = [
            'theme' => 'custom',
            'theme_primary' => $reading['primary'],
            'theme_secondary' => $reading['secondary'],
            'theme_accent' => $reading['accent'],
        ];

        if ($reading['topbar'] !== '') {
            $values['theme_topbar'] = $reading['topbar'];
        }

        foreach ($values as $key => $value) {
            Setting::query()->where('key', $key)->update(['value' => $value]);
        }

        Setting::flushCache();
    }
}
