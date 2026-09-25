<?php

namespace App\Support\Messaging;

use App\Enums\MessageChannel;
use App\Enums\TemplateApproval;
use App\Models\MessageTemplate;
use App\Support\Messaging\Providers\ProviderException;
use App\Support\Messaging\Providers\SyncedTemplate;

/**
 * Submitting a template for approval, and reading back what the provider
 * decided. WhatsApp only — the one channel that approves.
 */
final class TemplateSync
{
    /**
     * Match the provider's list against ours by name and language (by name
     * alone when the language differs only in region — `en` against
     * `en_US`), and copy each state across.
     *
     * @return array{matched: int, unknown: list<string>}
     */
    public static function run(MessageChannel $channel): array
    {
        $provider = self::provider($channel);
        $remote = $provider->client()->syncTemplates();

        $matched = 0;
        $seen = [];

        foreach (MessageTemplate::query()->where('channel', $channel->value)->get() as $template) {
            $hit = self::match($template, $remote);

            if ($hit === null) {
                continue;
            }

            $seen[] = $hit->name.'|'.$hit->language;
            $matched++;

            $template->update([
                'approval_status' => $hit->status,
                'approval_reason' => $hit->reason,
                'provider_template_id' => $hit->id ?? $template->provider_template_id,
                'synced_at' => now(),
            ]);
        }

        $unknown = [];
        foreach ($remote as $row) {
            if (! in_array($row->name.'|'.$row->language, $seen, true) && $row->name !== '') {
                $unknown[] = $row->name;
            }
        }

        return ['matched' => $matched, 'unknown' => array_values(array_unique($unknown))];
    }

    public static function submit(MessageTemplate $template): MessageTemplate
    {
        $provider = self::provider($template->channel);
        $result = $provider->client()->submitTemplate($template);

        $template->update([
            'approval_status' => $result->status === TemplateApproval::Draft ? TemplateApproval::Pending : $result->status,
            'approval_reason' => $result->reason,
            'provider_template_name' => $result->name,
            'provider_template_id' => $result->id ?? $template->provider_template_id,
            'submitted_at' => now(),
            'synced_at' => now(),
        ]);

        return $template;
    }

    private static function provider(MessageChannel $channel): ProviderOption
    {
        if (! $channel->needsApproval()) {
            throw new ProviderException("{$channel->label()} templates need no approval.");
        }

        $provider = $channel->current();

        if ($provider === null || ! $provider->client()->configured()) {
            throw new ProviderException("{$channel->label()} has no provider configured. An administrator sets one in Messaging → Settings.");
        }

        return $provider;
    }

    /** @param  list<SyncedTemplate>  $remote */
    private static function match(MessageTemplate $template, array $remote): ?SyncedTemplate
    {
        $name = $template->providerName();
        $language = strtolower((string) $template->language);
        $loose = null;

        foreach ($remote as $row) {
            if ($template->provider_template_id !== null && $row->id === $template->provider_template_id) {
                return $row;
            }

            if ($row->name !== $name) {
                continue;
            }

            if (strtolower($row->language) === $language) {
                return $row;
            }

            if (strtok(strtolower($row->language), '_-') === strtok($language, '_-')) {
                $loose ??= $row;
            }
        }

        return $loose;
    }
}
