<?php

namespace App\Support\Crm;

use App\Models\Lead;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * The two things a notification gains from the pipeline: where the form was,
 * and a way into the record.
 *
 * One class because two notifications need it and they had already been written
 * separately once — the newsletter's footer address is the standing example of
 * what three independent resolutions of one question costs.
 *
 * **The URL is absolute and built on `frontend_url`, which is correct here and
 * would be wrong in the console.** A link rendered inside the console ships as
 * a path so the browser supplies the origin, because `FRONTEND_URL` is pinned
 * to the production domain on every machine and would send a developer to the
 * live site. An email has no origin to inherit, so it needs the absolute form —
 * the same call campaign links, order links and canonicals already make.
 */
class LeadMailLines
{
    /**
     * The same two facts, as a block a template can drop in.
     *
     * A sibling of `add()` rather than a second resolution somewhere else: the
     * docblock above already explains what three independent answers to one
     * question cost this project, and a templated notification needs exactly
     * what a built-in one needs, in a different shape.
     *
     * Empty when there is no lead, which renders nothing at all — a template
     * that always emitted a heading would show an empty panel for every
     * enquiry that predates the pipeline.
     */
    public static function html(?Lead $lead): string
    {
        if (! $lead) {
            return '';
        }

        $out = '';
        $where = self::where($lead);

        if ($where) {
            $out .= '<p><strong>Submitted from:</strong> '.e($where).'</p>';
        }

        if ($lead->utm_campaign) {
            $out .= '<p><strong>Campaign:</strong> '.e($lead->utm_campaign)
                .($lead->utm_source ? ' · '.e($lead->utm_source) : '').'</p>';
        }

        $url = rtrim((string) config('app.frontend_url'), '/').'/admin/leads/'.$lead->id;

        return $out.'<p><a href="'.e($url).'">Open this lead</a></p>';
    }

    public static function add(MailMessage $message, ?Lead $lead): void
    {
        if (! $lead) {
            return;
        }

        $where = self::where($lead);

        if ($where) {
            $message->line('Submitted from: '.$where);
        }

        if ($lead->utm_campaign) {
            $message->line('Campaign: '.$lead->utm_campaign.($lead->utm_source ? ' · '.$lead->utm_source : ''));
        }

        $message->action('Open this lead', rtrim((string) config('app.frontend_url'), '/').'/admin/leads/'.$lead->id);
    }

    /**
     * The page, said the way a person would say it.
     *
     * Title where the browser sent one, falling back to the path — a path is
     * ugly and unambiguous, which beats saying nothing. `?:` rather than `??`
     * because an empty string is what a blank field stores and it would
     * otherwise win over a perfectly good path, which is the footer-address bug
     * this project has already shipped once.
     */
    private static function where(Lead $lead): ?string
    {
        $title = trim((string) ($lead->source_title ?? ''));
        $path = trim((string) ($lead->source_path ?? ''));

        $label = $title ?: $path;

        if ($label === '') {
            return null;
        }

        // Both, when the title is a name rather than a location — "Cisco
        // CBS350 · /products/cisco-cbs350-24t-4g" answers "which page" without
        // anybody having to search for it.
        return $title !== '' && $path !== '' && $title !== $path
            ? $title.' · '.$path
            : $label;
    }
}
