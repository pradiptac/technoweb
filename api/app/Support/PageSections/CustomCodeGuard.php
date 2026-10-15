<?php

namespace App\Support\PageSections;

use App\Enums\PageSectionType;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Validator;

/**
 * Who may let custom code run **on the page itself** (0.158.0,
 * `docs/page-builder.md` "Custom code").
 *
 * A custom code section is stored raw. By default the website draws it in a
 * sandboxed frame with no `allow-same-origin`, which cannot read a cookie or
 * call the API. `mode: "page"` skips the frame and puts the code in the page,
 * and the console and the site are one origin, so script there acts as
 * whoever views the page — an administrator included. That choice is an
 * administrator's alone.
 *
 * **One place for every door.** The page requests, the record requests (via
 * `RecordSections::after`) and the library request all call `check()`; the
 * live preview does not, since nothing is saved there and the console never
 * runs the code. A content manager re-saving a page that already holds an
 * administrator's page-mode block is not refused: the block is identical to
 * the stored one (id, code and mode), so nothing new is being authorised.
 *
 * `check()` also marks the request when a save adds or changes a custom code
 * block, which is what the activity log reads (`ActivityLogger`).
 */
final class CustomCodeGuard
{
    public const MESSAGE = 'Only an administrator can let code run on the page itself.';

    public const REQUEST_FLAG = 'custom_code';

    public static function check(Validator $validator, mixed $blocks, string $prefix = 'blocks'): void
    {
        if (! is_array($blocks)) {
            return;
        }

        $request = request();
        $user = $request->user();
        $admin = $user instanceof User && $user->isAdmin();
        $stored = null;

        foreach ($blocks as $i => $block) {
            if (! is_array($block) || ($block['type'] ?? null) !== PageSectionType::CustomCode->value) {
                continue;
            }
            $stored ??= self::stored($request->route()?->parameters() ?? []);
            $data = is_array($block['data'] ?? null) ? $block['data'] : [];
            $unchanged = self::same($stored[(string) ($block['id'] ?? '')] ?? null, $data);

            if (! $unchanged) {
                $request->attributes->set(self::REQUEST_FLAG, true);
            }

            if (($data['mode'] ?? null) === 'page' && ! $admin && ! $unchanged) {
                $validator->errors()->add("{$prefix}.{$i}.data.mode", self::MESSAGE);
            }
        }
    }

    /**
     * The custom code blocks the record in the route holds now, by block id.
     * A create has no such record, so nothing is already authorised.
     *
     * @param  array<string, mixed>  $parameters
     * @return array<string, array<string, mixed>>
     */
    private static function stored(array $parameters): array
    {
        foreach ($parameters as $parameter) {
            $blocks = $parameter instanceof Model ? $parameter->getAttribute('blocks') : null;
            if (! is_array($blocks)) {
                continue;
            }
            $out = [];
            foreach ($blocks as $block) {
                if (is_array($block) && ($block['type'] ?? null) === PageSectionType::CustomCode->value) {
                    $out[(string) ($block['id'] ?? '')] = (array) ($block['data'] ?? []);
                }
            }

            return $out;
        }

        return [];
    }

    /** The submitted code, mode and height are what is already stored (line endings and edge space aside). */
    private static function same(?array $stored, array $given): bool
    {
        if ($stored === null) {
            return false;
        }
        $html = fn (mixed $v) => trim(str_replace("\r\n", "\n", (string) $v));

        return $html($stored['html'] ?? '') === $html($given['html'] ?? '')
            && ($stored['mode'] ?? 'frame') === ($given['mode'] ?? 'frame' ?: 'frame')
            && ($stored['height'] ?? 'auto') === ($given['height'] ?? 'auto' ?: 'auto');
    }
}
