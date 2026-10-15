<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSeo;
use App\Models\Tender;
use App\Support\Tenders\TenderDocuments;
use App\Support\Tenders\TenderText;
use App\Support\Tenders\TenderWindow;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A tender as the public site lists it — the index row, and the top of the
 * detail (`TenderDetailResource` extends this).
 *
 * **Every label is the API's.** `opens_label`, `closes_label`, `state_label`
 * and `closes_in_label` are written here, in `APP_TIMEZONE`, so no frontend
 * formats a tender's date. That rule earns its keep here more than anywhere:
 * this is a deadline, and a closing date rendered in the reader's own zone
 * is a bid somebody misses by a day.
 *
 * **The state rides on the row, and it is the state when this was read.**
 * A listing is cached for a minute and a tender's page for longer, so the
 * state in a cached response is as old as the response. The page's badge
 * re-asks `GET /tenders/{slug}/state`, which is never cached, after it
 * mounts. There is no stored "open" column to drift from the clock.
 *
 * @mixin Tender
 */
class TenderResource extends JsonResource
{
    use IncludesSeo;

    public function toArray(Request $request): array
    {
        return $this->row();
    }

    /** @return array<string, mixed> */
    protected function row(): array
    {
        /** @var Tender $tender */
        $tender = $this->resource;

        return [
            'id' => $tender->id,
            'reference' => $tender->reference,
            'title' => $tender->title,
            'slug' => $tender->slug,
            'summary' => $tender->summary,

            'category' => $tender->relationLoaded('category') && $tender->category !== null
                ? ['name' => $tender->category->name, 'slug' => $tender->category->slug]
                : null,

            // The instants, with the app zone's offset…
            'opens_at' => TenderText::iso($tender->opens_at),
            'closes_at' => TenderText::iso($tender->closes_at),
            'opening_at' => TenderText::iso($tender->opening_at),
            'prebid_at' => TenderText::iso($tender->prebid_at),

            // …and the words, so nothing downstream formats a date.
            'opens_label' => TenderText::dateLabel($tender->opens_at),
            'closes_label' => TenderText::deadlineLabel($tender->closes_at),
            'opening_label' => TenderText::momentLabel($tender->opening_at),
            'prebid_label' => TenderText::momentLabel($tender->prebid_at),

            'fee_paise' => $tender->fee_paise,
            'fee_label' => TenderText::money($tender->fee_paise),
            'emd_paise' => $tender->emd_paise,
            'emd_label' => TenderText::money($tender->emd_paise),

            ...TenderWindow::for($tender)->toArray(),

            'documents_count' => TenderDocuments::count($tender->documents),
            'is_featured' => $tender->is_featured,

            // The sitemap's `lastmod`, and `seo` so it honours
            // `sitemap_include` on a row it never reads in full.
            'updated_at' => optional($tender->updated_at)->toIso8601String(),
            'seo' => $this->seo(),
        ];
    }
}
