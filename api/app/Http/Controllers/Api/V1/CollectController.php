<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Analytics\Collector;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The beacon's door (C3): 204 always — a beacon has nobody to tell. */
class CollectController extends Controller
{
    private const BEACON_KINDS = ['pageview', 'outbound', 'download', 'contact'];

    public function __invoke(Request $request): Response
    {
        $raw = $request->getContent();
        $body = strlen($raw) <= 2048 ? json_decode($raw, true) : null;

        if (is_array($body) && in_array($body['k'] ?? null, self::BEACON_KINDS, true)) {
            $kind = $body['k'];
            $target = is_string($body['t'] ?? null) ? $body['t'] : null;
            // A call, an email or a WhatsApp chat is recorded as its kind of link, never the number or the address.
            if ($kind === 'contact' && $target !== null) {
                $target = match (true) {
                    str_starts_with($target, 'tel:') => 'tel', str_starts_with($target, 'mailto:') => 'mailto', default => 'whatsapp'
                };
            }
            Collector::record($request, $kind, [
                'path' => is_string($body['p'] ?? null) ? $body['p'] : null,
                'referrer' => is_string($body['r'] ?? null) ? mb_substr($body['r'], 0, 2048) : null,
                'utm' => is_array($body['u'] ?? null) ? array_map(fn ($v) => is_string($v) ? $v : null, array_intersect_key($body['u'], array_flip(['source', 'medium', 'campaign']))) : [],
                'width' => is_int($body['w'] ?? null) ? $body['w'] : null,
                'target' => $target,
            ]);
        }

        return response()->noContent();
    }
}
