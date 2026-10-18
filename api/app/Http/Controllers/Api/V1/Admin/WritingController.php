<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\WritingMode;
use App\Enums\WritingTone;
use App\Http\Controllers\Controller;
use App\Support\Writing\Surface;
use App\Support\Writing\Surfaces\BodySurface;
use App\Support\Writing\Surfaces\CampaignBlockSurface;
use App\Support\Writing\Surfaces\EmailTemplateSurface;
use App\Support\Writing\Surfaces\SummarySurface;
use App\Support\Writing\Surfaces\TicketReplySurface;
use App\Support\Writing\Writer;
use App\Support\Writing\WritingInput;
use App\Support\Writing\WritingSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Writing help (0.183.0, docs/ai-writing.md). Staff-wide routes; each
 * surface narrows by role. Nothing here writes to a record.
 */
class WritingController extends Controller
{
    /** @var array<string, class-string<Surface>> */
    public const SURFACES = [
        'summary' => SummarySurface::class,
        'body' => BodySurface::class,
        'ticket_reply' => TicketReplySurface::class,
        'campaign_block' => CampaignBlockSurface::class,
        'email_template' => EmailTemplateSurface::class,
    ];

    public function status(): JsonResponse
    {
        $reason = Writer::refusal();

        return response()->json(['data' => [
            'available' => $reason === null,
            'reason' => $reason,
            'used' => WritingSettings::runsToday(),
            'cap' => WritingSettings::dailyCap(),
            'tones' => WritingTone::options(),
            'modes' => WritingMode::options(),
        ]]);
    }

    public function write(Request $request, Writer $writer): JsonResponse
    {
        $data = $request->validate([
            'surface' => ['required', Rule::in(array_keys(static::SURFACES))],
            'mode' => ['required', Rule::enum(WritingMode::class)],
            'tone' => ['nullable', Rule::enum(WritingTone::class)],
            'brief' => ['nullable', 'string', 'max:600'],
            'input' => ['nullable', 'string', 'max:60000'],
            'ref' => ['nullable', 'array'],
            // Surfaces read these keys as scalars, so an array value is a 422 here and never a 500 there.
            'ref.type' => ['sometimes', 'nullable', 'string', 'max:40'],
            'ref.id' => ['sometimes', 'nullable', 'integer'],
            'ref.reference' => ['sometimes', 'nullable', 'string', 'max:40'],
            'ref.campaign_id' => ['sometimes', 'nullable', 'integer'],
            'ref.key' => ['sometimes', 'nullable', 'string', 'max:80'],
            'ref.field' => ['sometimes', 'nullable', 'string', 'max:20'],
            'max' => ['nullable', 'integer', 'min:20', 'max:5000'],
        ]);

        $input = new WritingInput(
            mode: WritingMode::from($data['mode']),
            tone: WritingTone::tryFrom((string) ($data['tone'] ?? '')) ?? WritingTone::Default,
            text: (string) ($data['input'] ?? ''),
            brief: $data['brief'] ?? null,
            ref: $data['ref'] ?? [],
            max: $data['max'] ?? null,
        );

        $result = $writer->run(app(static::SURFACES[$data['surface']]), $input, $request->user());

        if (! $result->ok) {
            return response()->json(['message' => $result->message, 'errors' => ['writing' => [$result->message]]], $result->status);
        }

        return response()->json(['data' => ['output' => $result->output, 'changed' => true]]);
    }

    public function subjects(Request $request, Writer $writer): JsonResponse
    {
        $data = $request->validate(['campaign_id' => ['required', 'integer']]);
        $result = $writer->subjects((int) $data['campaign_id'], $request->user());

        return $result->ok
            ? response()->json(['data' => ['subjects' => json_decode($result->output, true)]])
            : response()->json(['message' => $result->message, 'errors' => ['writing' => [$result->message]]], $result->status);
    }
}
