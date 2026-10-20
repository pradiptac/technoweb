<?php

namespace App\Support\Presets;

use App\Models\ContentType;
use App\Models\CustomFieldGroup;
use App\Models\Page;
use App\Support\ReservedSlugs;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Installs a preset (docs/content-presets.md): its type(s) and a field group
 * each, in one transaction, so a half-made preset cannot exist. The group is
 * named `preset-<preset>`, which is how the locked-field checks and deleting
 * the type find it again.
 */
final class PresetInstaller
{
    /** Why a slug cannot be used, in one sentence, or null. */
    public static function clash(string $slug): ?string
    {
        if (in_array($slug, ReservedSlugs::all(), true)) {
            return "/{$slug} belongs to a part of the site that already exists.";
        }
        if (Page::query()->where('slug', $slug)->exists()) {
            return "A page already uses /{$slug}.";
        }
        if ($other = ContentType::query()->where('slug', $slug)->value('plural')) {
            return "The content type “{$other}” already uses /{$slug}.";
        }

        return null;
    }

    /**
     * @param  array<string, string>  $slugs  type-level preset key => chosen slug
     * @return list<ContentType>
     */
    public static function install(string $key, array $slugs = []): array
    {
        $def = Presets::all()[$key] ?? null;
        abort_if($def === null, 404);

        foreach ($def['types'] as $t) {
            if (ContentType::query()->preset($t['preset'])->exists()) {
                throw ValidationException::withMessages(['key' => "The {$def['label']} preset is already installed."]);
            }
        }

        $chosen = [];
        foreach ($def['types'] as $i => $t) {
            $slug = strtolower(trim((string) ($slugs[$t['preset']] ?? $t['defaults']['slug'])));
            $field = $i === 0 ? 'slug' : 'coverage_slug';
            if (! preg_match('/^[a-z][a-z0-9-]*$/', $slug)) {
                throw ValidationException::withMessages([$field => 'The address must start with a letter and use only lowercase letters, numbers and hyphens.']);
            }
            if ($why = self::clash($slug)) {
                throw ValidationException::withMessages([$field => $why.' Choose another address.']);
            }
            $chosen[$t['preset']] = $slug;
        }

        return DB::transaction(function () use ($def, $chosen, $key) {
            $made = [];
            foreach ($def['types'] as $t) {
                $type = ContentType::create([
                    ...$t['defaults'],
                    'slug' => $chosen[$t['preset']],
                    'preset' => $t['preset'],
                ]);

                // `hidden`: the preset's own layout draws these fields, so the
                // generic "Details" list would say them twice.
                $group = CustomFieldGroup::create([
                    'name' => $t['defaults']['plural'],
                    'slug' => 'preset-'.$t['preset'],
                    'targets' => [$type->target()],
                    'placement' => 'hidden',
                    'is_active' => true,
                ]);

                foreach ($t['fields'] as $n => $f) {
                    $group->fields()->create([
                        'key' => $f['key'], 'label' => $f['label'], 'kind' => $f['kind'],
                        'help' => $f['help'] ?? null, 'required' => $f['required'],
                        'show_on_page' => false, 'locked' => $f['locked'],
                        'options' => $f['options'] ?? null, 'settings' => $f['settings'] ?? null,
                        'sort_order' => $n,
                    ]);
                }

                $made[] = $type;
            }

            if ($key === 'investors') {
                Presets::investorGroup();
            }

            return $made;
        });
    }
}
