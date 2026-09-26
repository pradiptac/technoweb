<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Enums\MessageEvent;
use App\Http\Controllers\Controller;
use App\Models\MessageAutomation;
use App\Models\MessageTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The automations table — `role:campaign_manager,store_manager`: every event
 * crossed with every channel, the template said there and a switch.
 *
 * Always the full grid, rows or none: a cell with no row is a cell switched
 * off, so the screen never has to create what it draws. Saved wholesale,
 * like FAQs, because it is one table somebody edits in one sitting.
 */
class MessageAutomationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => self::grid(), 'meta' => self::meta()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rows' => ['required', 'array', 'max:'.(count(MessageEvent::cases()) * count(MessageChannel::cases()))],
            'rows.*.event' => ['required', Rule::enum(MessageEvent::class)],
            'rows.*.channel' => ['required', Rule::enum(MessageChannel::class)],
            'rows.*.message_template_id' => ['nullable', 'integer', 'exists:message_templates,id'],
            'rows.*.is_enabled' => ['required', 'boolean'],
        ]);

        $templates = MessageTemplate::query()->whereIn('id', collect($data['rows'])->pluck('message_template_id')->filter())
            ->get()->keyBy('id');

        foreach ($data['rows'] as $i => $row) {
            $template = isset($row['message_template_id']) ? $templates->get($row['message_template_id']) : null;

            if ($template !== null && $template->channel->value !== $row['channel']) {
                throw ValidationException::withMessages(["rows.{$i}.message_template_id" => 'That template is for another channel.']);
            }

            if ($row['is_enabled'] && $template === null) {
                throw ValidationException::withMessages(["rows.{$i}.is_enabled" => 'Choose a template before switching this on.']);
            }
        }

        DB::transaction(function () use ($data) {
            foreach ($data['rows'] as $row) {
                MessageAutomation::query()->updateOrCreate(
                    ['event' => $row['event'], 'channel' => $row['channel']],
                    ['message_template_id' => $row['message_template_id'] ?? null, 'is_enabled' => (bool) $row['is_enabled']],
                );
            }
        });

        return response()->json(['data' => self::grid(), 'meta' => self::meta(), 'message' => 'Automations saved.']);
    }

    /**
     * Every (event, channel) cell with what would happen now, and why not
     * when nothing would — a switched-on cell whose WhatsApp template is
     * still waiting for Meta sends nothing, and the screen says so.
     *
     * @return list<array<string, mixed>>
     */
    private static function grid(): array
    {
        $rows = MessageAutomation::query()->with('template')->get()
            ->keyBy(fn (MessageAutomation $a) => $a->event->value.'|'.$a->channel->value);

        $grid = [];

        foreach (MessageEvent::cases() as $event) {
            foreach (MessageChannel::cases() as $channel) {
                $row = $rows->get($event->value.'|'.$channel->value);
                $template = $row?->template;
                $enabled = (bool) ($row?->is_enabled);

                $reason = match (true) {
                    ! $enabled => null,
                    $template === null => 'No template chosen.',
                    ! $channel->ready() => "{$channel->label()} is not configured.",
                    ! $template->sendable() => 'The template is not approved yet.',
                    default => null,
                };

                $grid[] = [
                    'event' => $event->value,
                    'event_label' => $event->label(),
                    'promotional' => $event->promotional(),
                    'channel' => $channel->value,
                    'message_template_id' => $template?->id,
                    'is_enabled' => $enabled,
                    'live' => $enabled && $reason === null,
                    'reason' => $reason,
                ];
            }
        }

        return $grid;
    }

    /** @return array<string, mixed> */
    private static function meta(): array
    {
        return [
            'channels' => array_map(fn (MessageChannel $c) => ['value' => $c->value, 'label' => $c->label(), 'ready' => $c->ready()], MessageChannel::cases()),
            'templates' => MessageTemplate::query()->orderBy('name')->get()->map(fn (MessageTemplate $t) => [
                'id' => $t->id,
                'channel' => $t->channel->value,
                'name' => $t->name,
                'sendable' => $t->sendable(),
                'approval_label' => $t->approval_status->label(),
            ])->all(),
        ];
    }
}
