<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnquiryRequest;
use App\Models\Enquiry;
use App\Notifications\EnquiryReceived;
use App\Support\Crm\LeadIntake;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;

class EnquiryController extends Controller
{
    public function store(StoreEnquiryRequest $request): JsonResponse
    {
        $enquiry = Enquiry::create([
            ...$request->safe()->except('website'),
            'ip_address' => $request->ip(),
            'status' => 'new',
        ]);

        /*
         * The pipeline record, before the notification.
         *
         * Order matters: the email is the *announcement* and the lead is the
         * record. A mail server that is down must not be able to lose an
         * enquiry from the desk that works them, which is exactly what
         * notifying first and creating second would risk if this ever threw.
         * `LeadIntake` cannot fail the request either -- see the class.
         */
        $lead = LeadIntake::fromEnquiry($enquiry, $request);

        // Sales inbox address comes from settings, so it can be changed in
        // the admin without a deploy. A mail failure is logged, never thrown:
        // the enquiry is already saved and the visitor must not be told to
        // send it again.
        Notifier::route('sales_email', new EnquiryReceived($enquiry, $lead));

        return response()->json([
            'message' => 'Thank you — we will be in touch shortly.',
            'data' => ['id' => $enquiry->id],
        ], 201);
    }
}
