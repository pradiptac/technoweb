<?php

namespace App\Http\Resources\Admin;

use App\Models\Tender;
use App\Support\Tenders\TenderDocuments;
use App\Support\Tenders\TenderText;
use App\Support\Tenders\TenderWindow;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A tender as the console reads it.
 *
 * `$detail` is **the route, not a flag a caller sets**: `description`, `seo`
 * and `seo_defaults` are on the read, the two writes and the duplicate, and
 * not on an index row. A list of forty tenders has no use for forty scopes
 * of work, and `seo_defaults` resolves an override per row.
 *
 * Datetimes go out twice: wall-clock, which is what a `datetime-local` input
 * holds and what a save posts back, and `*_iso` beside it, the instant with
 * the app zone's offset. Labels come too, so the list's badge and the
 * public page cannot word a deadline two ways.
 *
 * Each document carries its **stored path beside the resolved URL** — the
 * path is what a save posts, the URL is what a link needs — and `missing`
 * when its file has gone from the library, because the editor is the only
 * one who can fix that and hiding it would make the row simply wrong.
 *
 * @mixin Tender
 */
class TenderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Tender $tender */
        $tender = $this->resource;
        $detail = $request->routeIs('*.show', '*.store', '*.update', '*.duplicate');

        return [
            'id' => $tender->id,
            'reference' => $tender->reference,
            'title' => $tender->title,
            'slug' => $tender->slug,
            'summary' => $tender->summary,
            'description' => $this->when($detail, $tender->description),

            'tender_category_id' => $tender->tender_category_id,
            'category' => $tender->relationLoaded('category') && $tender->category !== null
                ? [
                    'id' => $tender->category->id,
                    'name' => $tender->category->name,
                    'is_active' => (bool) $tender->category->is_active,
                ]
                : null,

            'status' => $tender->status->value,
            'status_label' => $tender->status->label(),
            'is_featured' => (bool) $tender->is_featured,
            'sort_order' => (int) $tender->sort_order,

            'opens_at' => TenderText::wallClock($tender->opens_at),
            'closes_at' => TenderText::wallClock($tender->closes_at),
            'opening_at' => TenderText::wallClock($tender->opening_at),
            'prebid_at' => TenderText::wallClock($tender->prebid_at),
            'opens_at_iso' => TenderText::iso($tender->opens_at),
            'closes_at_iso' => TenderText::iso($tender->closes_at),
            'opens_label' => TenderText::dateLabel($tender->opens_at),
            'closes_label' => TenderText::deadlineLabel($tender->closes_at),
            'prebid_place' => $tender->prebid_place,

            ...TenderWindow::for($tender)->toArray(),

            'fee_paise' => $tender->fee_paise,
            'fee_label' => TenderText::money($tender->fee_paise),
            'emd_paise' => $tender->emd_paise,
            'emd_label' => TenderText::money($tender->emd_paise),

            'submission_email' => $tender->submission_email,
            'submission_url' => $tender->submission_url,
            'submission_address' => $tender->submission_address,
            'contact_name' => $tender->contact_name,
            'contact_phone' => $tender->contact_phone,
            'contact_email' => $tender->contact_email,

            'documents' => TenderDocuments::forAdmin($tender->documents),
            'documents_count' => TenderDocuments::count($tender->documents),

            // Paths, never URLs — see CLAUDE.md on `frontend_url` in the console.
            'public_path' => $tender->publicPath(),
            'admin_path' => $tender->adminPath(),

            'seo' => $this->when($detail, fn () => SeoOverrideArray::from($tender->seo)),
            'seo_defaults' => $this->when($detail, fn () => $tender->resolvedSeo()),

            'created_at' => TenderText::iso($tender->created_at),
            'updated_at' => TenderText::iso($tender->updated_at),
        ];
    }
}
