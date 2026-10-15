<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Models\Tender;
use App\Support\StructuredData;
use App\Support\Tenders\TenderDocuments;
use Illuminate\Http\Request;

/**
 * A tender's page: the index row plus everything only the page shows.
 *
 * `submission` is how a bid is sent — an address, a link, a postal address,
 * whichever the notice names. At least one of them exists on any published
 * tender, because the save refuses to publish a notice nobody can answer.
 *
 * `documents` are resolved from their library paths to addresses, and one
 * whose file has gone is **left out** rather than drawn as a button that
 * 404s (`TenderDocuments`).
 *
 * @mixin Tender
 */
class TenderDetailResource extends TenderResource
{
    use IncludesSchema;

    public function toArray(Request $request): array
    {
        /** @var Tender $tender */
        $tender = $this->resource;

        return [
            ...$this->row(),
            'description' => $tender->description,
            'prebid_place' => $tender->prebid_place,

            'documents' => TenderDocuments::resolve($tender->documents),

            'submission' => [
                'email' => $tender->submission_email,
                'url' => $tender->submission_url,
                'address' => $tender->submission_address,
            ],

            'contact' => [
                'name' => $tender->contact_name,
                'phone' => $tender->contact_phone,
                'email' => $tender->contact_email,
            ],

            'schema' => $this->schema(fn () => StructuredData::tender($tender)),
        ];
    }
}
