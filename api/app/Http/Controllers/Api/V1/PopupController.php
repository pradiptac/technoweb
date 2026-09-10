<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PopupResource;
use App\Models\Popup;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Every popup that is live right now.
 *
 * **A collection, and an empty one is a 200.** A slider and a gallery both 404
 * when they are empty, because the frontend's fallback there depends on the
 * miss — but no popups is the *ordinary* state of this site and always will be:
 * nothing is seeded, and most installs will run for months without one. A 404
 * on the common case would put an error in the log on every page render.
 *
 * The whole live set comes back rather than the one for a given page, because
 * the caller cannot say which page it is on: a Next layout has no pathname, so
 * the match happens in the browser against `usePathname()`. That is a handful
 * of rows of public content against a round trip per navigation, which is the
 * right way round. The response carries **patterns**, never section keys — see
 * `PopupResource`.
 */
class PopupController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $popups = Popup::query()
            ->live()
            /*
             * The order is the tie-break the browser uses to show exactly one
             * when several match a page, so it has to be total: `sort_order`
             * is an editor's decision and `id` settles two rows that share one,
             * because MySQL is free to order equal rows differently between two
             * reads. The catalogue's `?sort=` makes the same argument.
             */
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return PopupResource::collection($popups);
    }
}
