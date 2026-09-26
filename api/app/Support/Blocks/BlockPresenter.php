<?php

namespace App\Support\Blocks;

use App\Enums\ContentBlockType;
use App\Models\Brand;
use App\Models\ContentBlock;
use App\Support\MediaMeta;

/**
 * A content block's `data` as the public site reads it.
 *
 * Three things change on the way out, and each is the point:
 *
 * - **A stored path becomes a URL** — `image_path` → `image` (with
 *   `image_alt` and `image_focus` from the media library, the rule every
 *   public image follows), `qr_path` → `qr`, a stack's centre image and
 *   each node's picture the same way.
 * - **A gated download's `media_path` never leaves.** It becomes
 *   `has_download: true`; the file's URL is handed out only by
 *   `POST /blocks/{slug}/submit`, after an email address, or the gate is a
 *   formality anybody can read past.
 * - **A stack node that names a brand takes the brand's own name and logo**,
 *   read now, so replacing a logo on the brand screen reaches every diagram;
 *   a node whose brand has been deleted is dropped — a blank circle in an
 *   orbit reads as a broken page — and a group left empty goes with it.
 */
final class BlockPresenter
{
    /** @return array<string, mixed> */
    public static function data(ContentBlock $block): array
    {
        $data = $block->data ?? [];

        return match ($block->type) {
            ContentBlockType::Cta => self::cta($data),
            ContentBlockType::Stack => self::stack($data),
            default => $data,
        };
    }

    private static function url(?string $path): ?string
    {
        return filled($path) ? asset('storage/'.$path) : null;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function cta(array $data): array
    {
        $image = $data['image_path'] ?? null;
        $qr = $data['qr_path'] ?? null;
        $hasDownload = filled($data['media_path'] ?? null);
        unset($data['image_path'], $data['qr_path'], $data['media_path']);

        if ($image) {
            $data['image'] = self::url($image);
            $data['image_alt'] = MediaMeta::alt($image) ?? '';
            $data['image_focus'] = MediaMeta::focus($image);
        }
        if ($qr) {
            $data['qr'] = self::url($qr);
        }
        if ($hasDownload) {
            $data['has_download'] = true;
        }

        return $data;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function stack(array $data): array
    {
        $groups = (array) ($data['groups'] ?? []);
        $brandIds = collect($groups)->flatMap(fn ($g) => array_column((array) ($g['items'] ?? []), 'brand_id'))->filter()->unique()->all();
        $brands = $brandIds ? Brand::query()->whereIn('id', $brandIds)->get()->keyBy('id') : collect();

        $centre = $data['center']['image_path'] ?? null;
        $data['center'] = $centre ? ['image' => self::url($centre), 'image_alt' => MediaMeta::alt($centre) ?? ''] : null;

        $data['groups'] = collect($groups)->map(function ($group) use ($brands) {
            $items = collect((array) ($group['items'] ?? []))->map(function ($item) use ($brands) {
                $brandId = $item['brand_id'] ?? null;
                $path = $item['image_path'] ?? null;
                unset($item['brand_id'], $item['image_path']);

                if ($brandId) {
                    $brand = $brands->get($brandId);
                    if (! $brand) {
                        return null;
                    }
                    $item['label'] = filled($item['label'] ?? null) ? $item['label'] : $brand->name;
                    $item['image'] = $brand->logo_path
                        ? asset('storage/'.$brand->logo_path).'?v='.($brand->updated_at->timestamp ?? 0)
                        : null;
                    $item['brand'] = true;
                } elseif ($path) {
                    $item['image'] = self::url($path);
                }

                return $item;
            })->filter()->values()->all();

            return $items ? ['name' => $group['name'] ?? '', 'speed_seconds' => $group['speed_seconds'] ?? null, 'direction' => $group['direction'] ?? 'cw', 'items' => $items] : null;
        })->filter()->values()->all();

        return $data;
    }
}
