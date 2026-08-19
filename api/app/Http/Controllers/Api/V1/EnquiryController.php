<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnquiryRequest;
use App\Models\Enquiry;
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

        // TODO(phase 4): notify the sales inbox.

        return response()->json([
            'message' => 'Thank you — we will be in touch shortly.',
            'data' => ['id' => $enquiry->id],
        ], 201);
    }
}
