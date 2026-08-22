<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnquiryRequest;
use App\Models\Enquiry;
use App\Notifications\EnquiryReceived;
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

        // Sales inbox address comes from settings, so it can be changed in
        // the admin without a deploy. A mail failure is logged, never thrown:
        // the enquiry is already saved and the visitor must not be told to
        // send it again.
        Notifier::route('sales_email', new EnquiryReceived($enquiry));

        return response()->json([
            'message' => 'Thank you — we will be in touch shortly.',
            'data' => ['id' => $enquiry->id],
        ], 201);
    }
}
