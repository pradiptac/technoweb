<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MessageContactResource;
use App\Models\MessageContact;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Who agreed to be messaged — `role:campaign_manager,store_manager`.
 *
 * Read-only apart from recording an opt-out on somebody's behalf. There is
 * **no create**: consent is something a person gives, and a console that
 * could type one in would make every row in this table worthless as
 * evidence. No delete either — an opted-out row is the record that we
 * stopped.
 */
class MessageContactController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = MessageContact::query()->with('customer:id,name,email')->latest('id');

        if ($channel = MessageChannel::tryFrom((string) $request->query('channel'))) {
            $query->where('channel', $channel->value);
        }

        match ($request->query('status')) {
            'active' => $query->active(),
            'opted_out' => $query->whereNotNull('opted_out_at'),
            default => null,
        };

        if (filled($q = trim((string) $request->query('q')))) {
            $digits = preg_replace('/\D/', '', $q);
            $query->where(function ($w) use ($q, $digits) {
                $w->where('name', 'like', '%'.$q.'%')
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', '%'.$q.'%')->orWhere('email', 'like', '%'.$q.'%'));

                if ($digits !== '' && strlen((string) $digits) >= 4) {
                    $w->orWhere('address', 'like', '%'.$digits.'%');
                }
            });
        }

        $counts = MessageContact::query()->active()->selectRaw('channel, count(*) as n')->groupBy('channel')->pluck('n', 'channel');

        return MessageContactResource::collection($query->paginate(min($request->integer('per_page', 40), 100)))
            ->additional(['meta' => [
                'channels' => array_map(fn (MessageChannel $c) => [
                    'value' => $c->value, 'label' => $c->label(), 'active' => (int) ($counts[$c->value] ?? 0),
                ], MessageChannel::cases()),
            ]]);
    }

    /** Recorded on somebody's behalf — "stop messaging me" said on the phone. */
    public function optOut(MessageContact $messageContact): MessageContactResource
    {
        if ($messageContact->opted_out_at === null) {
            $messageContact->update(['opted_out_at' => now(), 'opt_out_reason' => 'staff']);
        }

        return new MessageContactResource($messageContact->load('customer:id,name,email'));
    }
}
