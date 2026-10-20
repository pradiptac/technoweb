<?php

namespace App\Support\Presets;

use App\Enums\CampaignStatus;
use App\Models\ContentType;
use App\Models\CustomFieldValue;
use App\Models\Entry;
use App\Models\NewsletterCampaign;
use App\Models\Setting;
use App\Support\CustomFields\CustomFields;
use App\Support\HtmlSanitiser;
use App\Support\Newsletter\Branding;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Investor alerts (docs/content-presets.md): one email per investor document,
 * to the "Investor updates" group, sent as an ordinary campaign — so the
 * unsubscribe link, the suppression list, tracking, the blocking health
 * checks and the report in Campaign are the newsletter's own.
 *
 * Sent once: `alert_sent_at` is claimed with a conditional UPDATE before
 * anything else happens, so two presses, or a press and the sweep, cannot
 * both send. A refusal (the health checks, the queue) releases the claim and
 * writes `alert_error`, which keeps the document out of `due()` until a save
 * clears it — a broken setting is not retried every ten minutes. Never
 * throws to its caller.
 */
final class InvestorAlerts
{
    public const ALREADY_SENT = 'An alert for this document has already been sent.';

    /** @return Builder<Entry> */
    public static function due(): Builder
    {
        return Entry::query()->published()
            ->whereIn('content_type_id', ContentType::query()->where('preset', 'investors')->select('id'))
            ->where('alert_on_publish', true)
            ->whereNull('alert_sent_at')
            ->whereNull('alert_error');
    }

    /** Null when the alert is on its way; otherwise the sentence saying why not. */
    public static function send(Entry $entry): ?string
    {
        try {
            if (! $entry->isPublic()) {
                return 'Only a published document can be announced.';
            }

            $claimed = Entry::query()->whereKey($entry->id)->whereNull('alert_sent_at')
                ->update(['alert_sent_at' => now(), 'alert_error' => null]);
            if ($claimed === 0) {
                return self::ALREADY_SENT;
            }

            $campaign = self::campaign($entry);
            $health = HealthCheck::run($campaign);
            if ($health['blocking'] !== []) {
                return self::refuse($entry, $campaign, implode(' ', $health['blocking']));
            }

            $campaign->update(['status' => CampaignStatus::Ready, 'health_score' => $health['score']]);
            $result = CampaignSender::queue($campaign->fresh() ?? $campaign);
            if (! $result['queued']) {
                return self::refuse($entry, $campaign, (string) ($result['reason'] ?? 'The alert could not be queued.'));
            }

            Entry::query()->whereKey($entry->id)->update(['alert_campaign_id' => $campaign->id]);

            return null;
        } catch (Throwable $e) {
            Log::warning('Investor alert failed', ['entry' => $entry->id, 'error' => $e->getMessage()]);
            Entry::query()->whereKey($entry->id)->update(['alert_sent_at' => null, 'alert_error' => 'The alert could not be sent. Try again.']);

            return 'The alert could not be sent. Try again.';
        }
    }

    private static function refuse(Entry $entry, NewsletterCampaign $campaign, string $why): string
    {
        $campaign->groups()->detach();
        $campaign->delete();
        Entry::query()->whereKey($entry->id)->update(['alert_sent_at' => null, 'alert_error' => $why]);

        return $why;
    }

    /**
     * A fixed message: what was published, what kind of document it is, and a
     * button to the investors page. No header picture — the image-to-text
     * health check would refuse a message this short that carried a logo.
     */
    private static function campaign(Entry $entry): NewsletterCampaign
    {
        $type = ContentType::query()->whereKey($entry->content_type_id)->firstOrFail();
        $branding = Branding::all();
        $company = (string) (Branding::company() ?: config('app.name'));

        $values = CustomFieldValue::query()->where('fieldable_type', $entry->getMorphClass())
            ->where('fieldable_id', $entry->id)->with('field')->get()
            ->mapWithKeys(fn (CustomFieldValue $v) => [(string) $v->field?->key => $v->value]);
        $field = CustomFields::fieldsFor($type->target())['document_type'] ?? null;
        $kind = filled($values['document_type'] ?? null) ? (string) $field?->optionLabel((string) $values['document_type']) : '';
        $year = (string) ($values['financial_year'] ?? '');

        $url = rtrim((string) config('app.frontend_url'), '/').'/'.$type->slug.'#entry-'.$entry->id;
        $line = trim($kind.($kind !== '' && $year !== '' ? ', ' : '').($year !== '' ? 'financial year '.$year : ''));

        $blocks = [
            ['type' => 'heading', 'level' => 1, 'text' => $entry->title],
            ['type' => 'text', 'html' => '<p>'.e($company).' has published '.e($entry->title)
                .($line !== '' ? ' ('.e($line).')' : '').' on its investors page.</p>'
                .'<p>You are receiving this because you asked to be emailed when '.e($company)
                .' publishes an investor document.</p>'],
            ['type' => 'button', 'label' => 'View on our investors page', 'href' => $url],
            ['type' => 'footer'],
        ];
        $html = EmailRenderer::render($blocks, $branding);

        $campaign = NewsletterCampaign::create([
            'name' => 'Investor alert — '.$entry->title,
            'subject' => $company.': '.$entry->title,
            'from_name' => Setting::get('newsletter_from_name') ?: Setting::get('mail_from_name') ?: config('mail.from.name'),
            'from_email' => Setting::get('newsletter_from_email') ?: Setting::get('mail_from_address') ?: config('mail.from.address'),
            'reply_to' => Setting::get('newsletter_reply_to') ?: null,
            'blocks' => $blocks,
            'html_content' => $html,
            'text_content' => HtmlSanitiser::toText($html),
            'status' => CampaignStatus::Draft,
        ]);
        $campaign->groups()->sync([Presets::investorGroup()->id]);

        return $campaign;
    }
}
