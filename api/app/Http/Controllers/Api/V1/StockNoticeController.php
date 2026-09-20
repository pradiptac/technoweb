<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\StockNotice;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Email me when this is back."
 *
 * **202 and one sentence, always** — the rule `/auth/register` and
 * `/newsletter/subscribe` follow, because a form that answered differently
 * for an address it recognised would be a membership oracle. So a filled
 * honeypot, an address on the suppression list and a product that is in
 * stock all get the same answer as a request that was written, and only the
 * last of those writes anything.
 *
 * A signed-in customer is stamped onto the row, read from the `sanctum`
 * guard by name: this route is public, so `$request->user()` is always null
 * here and would read as working (`CLAUDE.md`, "Laravel conventions").
 */
class StockNoticeController extends Controller
{
    public function request(Request $request, StoreProduct $storeProduct): JsonResponse
    {
        abort_unless($storeProduct->status === PublishStatus::Published, 404);

        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'variation_id' => ['nullable', 'integer'],
            // The honeypot, the field name every public form here uses.
            'website' => ['nullable', 'string', 'max:200'],
        ]);

        $answer = response()->json([
            'message' => 'Thank you. If it comes back into stock, we will email you once.',
        ], 202);

        if (filled($data['website'] ?? null)) {
            return $answer;
        }

        if (NewsletterSuppression::has($data['email'])) {
            return $answer;
        }

        $storeProduct->load('variations');
        $variation = null;

        if (! empty($data['variation_id'])) {
            $variation = $storeProduct->variations->firstWhere('id', (int) $data['variation_id']);

            // A variation that is not this product's is a stale form or a
            // hand-posted body; nothing to wait for, and nothing to say.
            if (! $variation instanceof StoreProductVariation) {
                return $answer;
            }

            $variation->setRelation('product', $storeProduct);
        }

        // Nothing to wait for. Back-ordered counts as buyable, which is what
        // the switch means, so a shelf the shop has agreed to oversell writes
        // nothing either.
        if ($variation !== null ? $variation->inStock() : $storeProduct->inStock()) {
            return $answer;
        }

        $user = $request->user('sanctum');

        StockNotice::arm(
            $storeProduct,
            $variation,
            $data['email'],
            $user instanceof Customer ? $user : null,
        );

        return $answer;
    }

    /**
     * Take one notice off, from the link in the email.
     *
     * Idempotent and always 200: a second click on the same link, after the
     * row has gone, is not an error anybody can act on. A wrong token gets
     * the same answer, so the endpoint cannot be used to test which tokens
     * exist.
     */
    public function cancel(string $token): JsonResponse
    {
        StockNotice::query()->where('token', $token)->delete();

        return response()->json([
            'message' => 'Done. We will not email you about that product.',
        ]);
    }
}
