<?php

namespace App\Support\SiteImport\Steps;

use App\Http\Controllers\Api\V1\Admin\SettingController;
use App\Models\Setting;
use App\Support\CustomFonts;
use App\Support\Fonts\GoogleFonts;
use App\Support\Import\MediaDownload;
use App\Support\SiteImport\Brand;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\Decisions;
use App\Support\SiteImport\Paths;
use App\Support\SiteImport\ZipSource;
use App\Support\WordPress\Outcome;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The site's colours and fonts, applied to this one — **only when the review
 * accepted them**, and only in the commit.
 *
 * The change is made the way the settings screen makes it: the same
 * `SettingController::update()`, so every rule that screen enforces (a colour
 * is `#rrggbb`, a font is an id) is enforced here, with `theme` set to
 * `custom` so the colours are the generator's input rather than a preset's.
 * A font that is not one of the vendored faces but arrived as a WOFF2 file is
 * stored in a custom slot (`CustomFonts`) — only a slot that is **empty**:
 * a company's own uploaded font is never replaced by an import's. The public
 * site picks the settings up when its cache turns over; the console purges it
 * as it does after a settings save.
 *
 * Nothing is applied for a role the stylesheets did not settle.
 */
class BrandStep extends Step
{
    public function key(): string
    {
        return 'brand';
    }

    public function label(): string
    {
        return 'Colours and fonts';
    }

    public function applies(Context $ctx): bool
    {
        return ! $ctx->dryRun && Decisions::brandChoice($ctx)['accept'];
    }

    public function records(Context $ctx): iterable
    {
        return [];
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        return Outcome::delegated('');
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void {}

    public function finish(Context $ctx): void
    {
        $brand = (array) ($ctx->site()['brand'] ?? []);
        $choice = Decisions::brandChoice($ctx);
        $settings = [];

        if ($choice['colours']) {
            foreach (Brand::ROLES as $role) {
                if (is_string($hex = $brand['colours'][$role] ?? null) && preg_match('/^#[0-9a-f]{6}$/', $hex)) {
                    $settings["theme_{$role}"] = $hex;
                }
            }
        }

        if ($choice['fonts']) {
            $slots = [];

            foreach (['display' => 'theme_font_display', 'body' => 'theme_font_body'] as $role => $key) {
                $face = $brand['fonts'][$role] ?? null;
                $id = is_array($face) ? ($face['id'] ?? $this->install($ctx, $face, $slots)) : null;

                // A Google font (0.179.0) is copied here before the settings
                // save, which refuses a `g-` id that is not installed. A
                // refusal costs this role its font and nothing else.
                if (is_string($id) && str_starts_with($id, 'g-')) {
                    try {
                        GoogleFonts::install(substr($id, 2));
                    } catch (ValidationException $e) {
                        $ctx->report->notice("The site's {$role} font could not be copied from Google: ".collect($e->errors())->flatten()->first());
                        $id = null;
                    }
                }

                if (is_string($id) && $id !== '') {
                    $settings[$key] = $id;
                }
            }
        }

        if ($settings === []) {
            $ctx->report->notice('The site\'s colours and fonts were accepted, but its stylesheets settled none of them, so nothing was changed.');

            return;
        }

        // Colours are the generator's input only under the custom theme.
        $settings['theme'] = 'custom';

        try {
            app(SettingController::class)->update(Request::create('/api/v1/admin/settings', 'PATCH', [
                'settings' => array_map(fn (string $key, string $value) => ['key' => $key, 'value' => $value], array_keys($settings), array_values($settings)),
            ]));
        } catch (ValidationException $e) {
            $ctx->report->notice('The settings screen refused the site\'s colours or fonts: '.collect($e->errors())->flatten()->first());

            return;
        }

        Setting::flushCache();

        foreach ($settings as $_) {
            $ctx->report->count($this->key(), 'update');
        }
    }

    /**
     * A font that came as a file, into a custom slot nobody has used; its id,
     * or null (and a notice) when it could not be.
     *
     * @param  array<string, mixed>  $face
     * @param  array<string, string>  $slots  family => id, for a family both roles use
     */
    private function install(Context $ctx, array $face, array &$slots): ?string
    {
        $family = (string) ($face['family'] ?? '');
        $files = is_array($face['custom'] ?? null) ? $face['custom'] : null;

        if ($files === null) {
            return null;
        }

        if (isset($slots[$family])) {
            return $slots[$family];
        }

        foreach (CustomFonts::all() as $slot) {
            if ($slot['regular'] !== null) {
                continue;
            }

            $regular = $this->fetch($ctx, (string) $files['regular']);
            $bold = ! empty($files['bold']) ? $this->fetch($ctx, (string) $files['bold']) : null;

            if ($regular === null) {
                $ctx->report->notice("The font file for {$family} could not be brought across, so the site keeps its own font for it.");

                return null;
            }

            CustomFonts::store(
                $slot['slot'],
                trim((string) preg_replace('/[^A-Za-z0-9 .\'&-]/', '', $family)) ?: 'Imported font',
                $regular,
                $bold,
                false,
            );

            foreach ([$regular, $bold] as $file) {
                if ($file !== null) {
                    @unlink((string) $file->getRealPath());
                }
            }

            return $slots[$family] = $slot['id'];
        }

        $ctx->report->notice("{$family} is a font file, but both custom font slots already hold a font of yours, so it was not installed.");

        return null;
    }

    /** A WOFF2 file as an upload object the font store takes, or null. */
    private function fetch(Context $ctx, string $url): ?UploadedFile
    {
        $tmp = null;

        try {
            if ($ctx->isZip()) {
                $relative = ltrim(rawurldecode((string) parse_url($url, PHP_URL_PATH)), '/');
                $path = ZipSource::filesDir($ctx->import).'/'.$relative;

                if (str_contains($relative, '..') || ! Storage::disk('local')->exists($path)) {
                    return null;
                }

                $tmp = (string) tempnam(sys_get_temp_dir(), 'fnt');
                file_put_contents($tmp, Storage::disk('local')->get($path));
            } elseif (Paths::sameSite($url, $ctx->siteUrl())) {
                $tmp = MediaDownload::toTemp($url, (bool) config('site_import.allow_private_hosts'), CustomFonts::MAX_KB * 1024);
            }
        } catch (Throwable) {
            return null;
        }

        $file = $tmp === null ? null : new UploadedFile($tmp, 'font.woff2', 'font/woff2', null, true);

        // The files the store reads are the ones it checks: a WOFF2 begins `wOF2` and is no larger than a slot takes.
        if ($file === null || ! CustomFonts::isWoff2($file) || filesize($tmp) > CustomFonts::MAX_KB * 1024) {
            if ($tmp !== null) {
                @unlink($tmp);
            }

            return null;
        }

        return $file;
    }
}
