<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ContentBlockType;
use App\Http\Controllers\Controller;
use App\Http\Resources\ContentBlockResource;
use App\Models\ContentBlock;
use App\Models\NewsletterGroup;
use App\Models\Setting;
use App\Notifications\BlockLeadCaptured;
use App\Support\Crm\LeadIntake;
use App\Support\Newsletter\SubscriberIntake;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Content blocks on the public site: one by slug for a shortcode, the
 * default CTA for every page's closing band, and the three forms a CTA can
 * carry.
 */
class ContentBlockController extends Controller
{
    /**
     * One published block. A draft, an unknown slug and a block with nothing
     * in it are all a 404 — the slider rule: the page's fallback is to render
     * nothing, so an empty success would put an empty section in a body.
     */
    public function show(string $slug): ContentBlockResource
    {
        $block = ContentBlock::query()->published()->where('slug', $slug)->first();

        abort_if(! $block || empty($block->data), 404);

        return new ContentBlockResource($block);
    }

    /**
     * The site's default CTA, or `{data: null}` in a 200.
     *
     * A null in a 200 rather than a 404, the menu rule: Next's data cache
     * stores only a 200, and this is fetched by every page that ends on the
     * closing band — a 404 for the ordinary "none chosen" case would be a live
     * round trip on every render of every one of them.
     */
    public function defaultCta(): JsonResponse
    {
        $block = ContentBlock::query()->published()
            ->where('type', ContentBlockType::Cta)->where('is_default', true)->first();

        return response()->json(['data' => $block ? (new ContentBlockResource($block))->resolve() : null]);
    }

    /**
     * A CTA's form: an inline newsletter, a gated download or a webinar.
     *
     * The honeypot is `website`, the convention every public form here uses,
     * and a filled one gets the ordinary answer with nothing stored — telling
     * a bot it was caught is telling it what to change. A download's answer
     * is the only place its file's URL is ever given.
     */
    public function submit(Request $request, string $slug): JsonResponse
    {
        $block = ContentBlock::query()->published()
            ->where('type', ContentBlockType::Cta)->where('slug', $slug)
            ->whereIn('layout', ['newsletter', 'gated_download', 'webinar'])->first();

        abort_if(! $block, 404);

        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'name' => [$block->layout === 'webinar' ? 'required' : 'nullable', 'string', 'max:120'],
            'company' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'website' => ['nullable', 'string', 'max:200'],
        ]);

        if ($block->layout === 'newsletter') {
            $answer = response()->json(['message' => 'Thank you. If that address is not already on the list, you will hear from us soon.'], 202);
            if (filled($data['website'] ?? null)) {
                return $answer;
            }
            // A `boolean` row: `Setting::get()` casts it, so off is `false`, never
            // the string '0' this compared against until 2026-09-24 — when
            // switching signup off refused nothing.
            if (! filter_var(Setting::get('newsletter_signup_enabled', true), FILTER_VALIDATE_BOOL)) {
                return response()->json(['message' => 'Newsletter signup is closed.'], 403);
            }
            $group = NewsletterGroup::where('slug', 'general-newsletter')->first();
            SubscriberIntake::take($data['email'], ['first_name' => $data['name'] ?? null], $group ? [$group->id] : [], 'banner');

            return $answer;
        }

        $webinar = $block->layout === 'webinar';
        $message = $webinar
            ? 'You are registered. We will email the details before it starts.'
            : 'Thank you — your download is ready.';

        if (filled($data['website'] ?? null)) {
            return response()->json(['message' => $message], 202);
        }

        $lead = LeadIntake::fromBlock($block, $webinar ? 'webinar' : 'download', $data, $request);
        if ($lead) {
            Notifier::route('sales_email', new BlockLeadCaptured($lead, $block));
        }

        if ($webinar) {
            return response()->json(['message' => $message], 202);
        }

        $path = $block->datum('media_path');

        return response()->json([
            'message' => $message,
            'data' => ['url' => filled($path) ? asset('storage/'.$path) : null],
        ]);
    }
}
