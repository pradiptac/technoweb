<?php

namespace App\Support\Events;

use App\Enums\EventFormat;
use App\Enums\EventRegistrationMode;
use App\Enums\PublishStatus;

/**
 * The one rule an event has that depends on its status: it may not be
 * published in a state that would confirm people into something they cannot
 * open.
 *
 * It lived inside `StoreEventRequest`'s validator, which is where an edit
 * asks it. The bulk "Publish" asks it too (0.139.0), and a rule that two
 * paths ask is a rule with one definition — here — whichever way it is
 * reached. The other cross-field checks on an event (a venue unless online,
 * a link when registration is external) do not depend on the status, so a
 * stored event has already passed them and the bulk path need not repeat them.
 */
final class PublishCheck
{
    /**
     * The sentence for why this event may not be published as it stands, or
     * null when it may.
     *
     * The join link is what a registrant is sent. Publishing an online event
     * that registers here without one would confirm people into a webinar
     * they have no way to open.
     */
    public static function joinLinkRefusal(PublishStatus $status, EventFormat $format, EventRegistrationMode $mode, mixed $onlineUrl): ?string
    {
        if ($status === PublishStatus::Published
            && $format->isOnline()
            && $mode === EventRegistrationMode::Open
            && blank($onlineUrl)) {
            return 'Add the join link before publishing — it is what people who register are sent.';
        }

        return null;
    }
}
