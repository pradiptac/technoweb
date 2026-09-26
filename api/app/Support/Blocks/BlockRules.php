<?php

namespace App\Support\Blocks;

use App\Enums\ContentBlockType;
use App\Models\Media;
use App\Support\LinkPattern;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * What a content block's `data` may hold, per type and per layout.
 *
 * Each layout requires what it draws and nothing else — a ring gauge needs a
 * percentage on each figure, a sparkline a series, a gated download a PDF —
 * so an editor is never made to fill in a field the chosen layout ignores.
 *
 * **Every text field is plain text.** The band's words go into each theme's
 * own closing band as a string, and nothing here is rendered through
 * `dangerouslySetInnerHTML`, so there is no markup to sanitise and none is
 * accepted: React escapes all of it at the sink.
 *
 * Every button is held to `PopupRequest`'s link shape — a path, an
 * http(s) URL, a `mailto:` or a `tel:` — because it becomes an `href` on a
 * live page.
 */
final class BlockRules
{
    public const LINK = LinkPattern::RULE;

    /** An `iconMap` key's shape; the frontend draws nothing for one it does not know. */
    private const ICON = 'regex:/^[a-z0-9-]{1,40}$/';

    private const HEX = 'regex:/^#[0-9a-fA-F]{6}$/';

    /**
     * The rules for the request's `content` — the column `data` — keyed as sent (`content.heading`).
     *
     * @return array<string, mixed>
     */
    public static function for(ContentBlockType $type, string $layout): array
    {
        $rules = match ($type) {
            ContentBlockType::Cta => self::cta($layout),
            ContentBlockType::Stats => self::stats($layout),
            ContentBlockType::Pricing => self::pricing($layout),
            ContentBlockType::Stack => self::stack($layout),
        };

        $prefixed = ['content' => ['required', 'array']];
        foreach ($rules as $key => $rule) {
            $prefixed["content.{$key}"] = $rule;
        }

        return $prefixed;
    }

    /** Checks no rule can express: a file that exists, a plan with a price. */
    public static function after(Validator $validator, ContentBlockType $type, string $layout, array $data): void
    {
        $media = function (string $key, ?string $mime = null) use ($validator, $data) {
            $path = data_get($data, $key);
            if (! filled($path)) {
                return;
            }
            $row = Media::query()->where('path', $path)->first();
            if (! $row) {
                $validator->errors()->add("content.{$key}", 'Choose a file from the media library.');
            } elseif ($mime && $row->mime !== $mime) {
                $validator->errors()->add("content.{$key}", 'This has to be a PDF.');
            }
        };

        if ($type === ContentBlockType::Cta) {
            $media('image_path');
            $media('qr_path');
            $media('media_path', 'application/pdf');
        }

        if ($type === ContentBlockType::Stack) {
            $media('center.image_path');
            foreach ((array) data_get($data, 'groups', []) as $g => $group) {
                foreach ((array) ($group['items'] ?? []) as $i => $item) {
                    $pictures = array_filter([
                        filled($item['icon'] ?? null), filled($item['image_path'] ?? null), filled($item['brand_id'] ?? null),
                    ]);
                    if (count($pictures) > 1) {
                        $validator->errors()->add("content.groups.{$g}.items.{$i}.icon", 'Choose one picture: an icon, an image or a brand.');
                    }
                    $media("groups.{$g}.items.{$i}.image_path");
                }
            }
        }

        if ($type === ContentBlockType::Pricing) {
            foreach ((array) data_get($data, 'sets', []) as $s => $set) {
                foreach ((array) ($set['plans'] ?? []) as $p => $plan) {
                    $priced = isset($plan['price_monthly_paise']) || isset($plan['price_yearly_paise']) || filled($plan['price_label'] ?? null);
                    if (! $priced) {
                        $validator->errors()->add("content.sets.{$s}.plans.{$p}.price_monthly_paise", 'Give the plan a price, or a label such as “Custom”.');
                    }
                }
                if ($layout === 'comparison') {
                    $columns = count((array) ($set['plans'] ?? []));
                    foreach ((array) ($set['rows'] ?? []) as $r => $row) {
                        if (count((array) ($row['cells'] ?? [])) !== $columns) {
                            $validator->errors()->add("content.sets.{$s}.rows.{$r}.cells", "Each row needs one cell per plan — {$columns} here.");
                        }
                    }
                }
            }
        }
    }

    /** @return array<string, mixed> */
    private static function cta(string $layout): array
    {
        $formLayouts = ['newsletter', 'gated_download', 'webinar'];
        $needsButton = ! in_array($layout, [...$formLayouts, 'two_path', 'app_qr'], true);

        $rules = [
            'kicker' => ['nullable', 'string', 'max:80'],
            'heading' => ['required', 'string', 'max:160'],
            'body' => ['nullable', 'string', 'max:600'],
            'primary' => ['nullable', 'array'],
            'primary.label' => [$needsButton ? 'required' : 'nullable', 'string', 'max:40'],
            'primary.href' => [$needsButton ? 'required' : 'nullable', 'string', 'max:2048', self::LINK],
            // `call` is today's second button — "Call {phone}" from Settings.
            'secondary_mode' => ['nullable', Rule::in(['call', 'link', 'none'])],
            'secondary' => ['nullable', 'array'],
            'secondary.label' => ['nullable', 'required_if:content.secondary_mode,link', 'string', 'max:40'],
            'secondary.href' => ['nullable', 'required_if:content.secondary_mode,link', 'string', 'max:2048', self::LINK],
        ];

        return $rules + match ($layout) {
            'split' => [
                'image_path' => ['required', 'string', 'max:255'],
                'image_side' => ['nullable', Rule::in(['left', 'right'])],
            ],
            'two_path' => [
                'paths' => ['required', 'array', 'size:2'],
                'paths.*.icon' => ['nullable', 'string', self::ICON],
                'paths.*.title' => ['required', 'string', 'max:80'],
                'paths.*.body' => ['nullable', 'string', 'max:300'],
                'paths.*.cta' => ['required', 'array'],
                'paths.*.cta.label' => ['required', 'string', 'max:40'],
                'paths.*.cta.href' => ['required', 'string', 'max:2048', self::LINK],
            ],
            'reassurance' => [
                'promises' => ['required', 'array', 'min:1', 'max:4'],
                'promises.*' => ['required', 'string', 'max:80'],
            ],
            'newsletter' => [
                'placeholder' => ['nullable', 'string', 'max:60'],
                'button_label' => ['nullable', 'string', 'max:30'],
            ],
            'gated_download' => [
                'media_path' => ['required', 'string', 'max:255'],
                'button_label' => ['nullable', 'string', 'max:30'],
            ],
            'countdown' => [
                'ends_at' => ['required', 'date'],
                'expired' => ['nullable', Rule::in(['hide', 'message'])],
                'expired_message' => ['nullable', 'required_if:content.expired,message', 'string', 'max:160'],
            ],
            'webinar' => [
                'starts_at' => ['required', 'date'],
                'duration_minutes' => ['nullable', 'integer', 'min:5', 'max:600'],
                'where' => ['nullable', 'string', 'max:120'],
                'button_label' => ['nullable', 'string', 'max:30'],
            ],
            'hiring' => [
                'limit' => ['nullable', 'integer', 'min:1', 'max:6'],
            ],
            'app_qr' => [
                'url' => ['required', 'url:http,https', 'max:2048'],
                'ios_url' => ['nullable', 'url:http,https', 'max:2048'],
                'android_url' => ['nullable', 'url:http,https', 'max:2048'],
                'qr_path' => ['required', 'string', 'max:255'],
            ],
            default => [],
        };
    }

    /** @return array<string, mixed> */
    private static function stats(string $layout): array
    {
        return [
            'kicker' => ['nullable', 'string', 'max:80'],
            'heading' => ['nullable', 'string', 'max:160'],
            'heading_emphasis' => ['nullable', 'string', 'max:80'],
            'lede' => ['nullable', 'string', 'max:400'],
            'items' => ['required', 'array', $layout === 'rings' ? 'size:3' : 'min:1', 'max:8'],
            'items.*.value' => ['required', 'string', 'max:20'],
            'items.*.label' => ['required', 'string', 'max:80'],
            'items.*.icon' => ['nullable', 'string', self::ICON],
            'items.*.description' => ['nullable', 'string', 'max:300'],
            'items.*.badge' => ['nullable', 'string', 'max:40'],
            'items.*.series' => [$layout === 'sparkline_cards' ? 'required' : 'nullable', 'array', 'min:2', 'max:12'],
            'items.*.series.*' => ['numeric', 'min:0'],
            'items.*.percent' => [$layout === 'rings' ? 'required' : 'nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.delta' => ['nullable', 'string', 'max:20'],
            'items.*.anomaly' => ['nullable', 'boolean'],
            'recognitions' => ['nullable', 'array', 'max:6'],
            'recognitions.*.icon' => ['nullable', 'string', self::ICON],
            'recognitions.*.score' => ['required', 'string', 'max:20'],
            'recognitions.*.name' => ['required', 'string', 'max:60'],
        ];
    }

    /** @return array<string, mixed> */
    private static function pricing(string $layout): array
    {
        return [
            'kicker' => ['nullable', 'string', 'max:80'],
            'heading' => ['nullable', 'string', 'max:160'],
            'lede' => ['nullable', 'string', 'max:400'],
            'billing' => ['nullable', 'array'],
            'billing.enabled' => ['nullable', 'boolean'],
            'billing.monthly_label' => ['nullable', 'string', 'max:30'],
            'billing.yearly_label' => ['nullable', 'string', 'max:30'],
            'billing.yearly_note' => ['nullable', 'string', 'max:60'],
            'sets' => ['required', 'array', 'min:1', 'max:6'],
            'sets.*.label' => ['required', 'string', 'max:40'],
            'sets.*.plans' => ['required', 'array', 'min:1', 'max:4'],
            'sets.*.plans.*.name' => ['required', 'string', 'max:60'],
            'sets.*.plans.*.badge' => ['nullable', 'string', 'max:30'],
            'sets.*.plans.*.description' => ['nullable', 'string', 'max:300'],
            'sets.*.plans.*.price_monthly_paise' => ['nullable', 'integer', 'min:0', 'max:100000000000'],
            'sets.*.plans.*.price_yearly_paise' => ['nullable', 'integer', 'min:0', 'max:100000000000'],
            'sets.*.plans.*.price_label' => ['nullable', 'string', 'max:40'],
            'sets.*.plans.*.period' => ['nullable', 'string', 'max:30'],
            'sets.*.plans.*.features' => ['nullable', 'array', 'max:20'],
            'sets.*.plans.*.features.*' => ['required', 'string', 'max:120'],
            'sets.*.plans.*.cta' => ['nullable', 'array'],
            'sets.*.plans.*.cta.label' => ['nullable', 'string', 'max:40'],
            'sets.*.plans.*.cta.href' => ['nullable', 'required_with:content.sets.*.plans.*.cta.label', 'string', 'max:2048', self::LINK],
            'sets.*.plans.*.highlighted' => ['nullable', 'boolean'],
            'sets.*.rows' => [$layout === 'comparison' ? 'required' : 'nullable', 'array', 'max:40'],
            'sets.*.rows.*.label' => ['required', 'string', 'max:120'],
            'sets.*.rows.*.group' => ['nullable', 'string', 'max:60'],
            'sets.*.rows.*.cells' => ['required', 'array'],
            'sets.*.rows.*.cells.*' => ['nullable', 'string', 'max:40'],
        ];
    }

    /** @return array<string, mixed> */
    private static function stack(string $layout): array
    {
        $orbit = $layout === 'orbit';

        return [
            'kicker' => ['nullable', 'string', 'max:80'],
            'heading' => ['nullable', 'string', 'max:160'],
            'lede' => ['nullable', 'string', 'max:400'],
            'center' => ['nullable', 'array'],
            'center.image_path' => ['nullable', 'string', 'max:255'],
            'groups' => ['required', 'array', 'min:1', $orbit ? 'max:3' : 'max:4'],
            'groups.*.name' => ['required', 'string', 'max:60'],
            'groups.*.speed_seconds' => ['nullable', 'integer', 'min:12', 'max:120'],
            'groups.*.direction' => ['nullable', Rule::in(['cw', 'ccw'])],
            'groups.*.items' => ['required', 'array', 'min:1', $orbit ? 'max:8' : 'max:12'],
            // A node naming a brand may leave its label blank and take the brand's name.
            'groups.*.items.*.label' => ['nullable', 'required_without:content.groups.*.items.*.brand_id', 'string', 'max:60'],
            'groups.*.items.*.type' => ['nullable', 'string', 'max:40'],
            'groups.*.items.*.badge' => ['nullable', 'string', 'max:30'],
            'groups.*.items.*.description' => ['nullable', 'string', 'max:300'],
            'groups.*.items.*.weight' => ['nullable', 'integer', 'min:1', 'max:5'],
            'groups.*.items.*.icon' => ['nullable', 'string', self::ICON],
            'groups.*.items.*.image_path' => ['nullable', 'string', 'max:255'],
            'groups.*.items.*.brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'groups.*.items.*.colour' => ['nullable', 'string', self::HEX],
            'groups.*.items.*.href' => ['nullable', 'string', 'max:2048', self::LINK],
        ];
    }
}
