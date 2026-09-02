<?php

namespace App\Support\Chat;

use App\Models\ChatConversation;
use App\Models\ChatEvent;
use App\Models\ChatMessage;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The assistant at a glance.
 *
 * §38 and §14 of the roadmap ask for basic analytics and say to keep them
 * light. What is here is what changes a decision: how much it is used, how
 * often it fails to answer, and whether anybody found it useful. Everything
 * else — average messages per conversation, top entry pages — is a number
 * somebody reads once and never acts on.
 *
 * **A figure nobody measured is null, not zero.** A helpfulness rate over no
 * ratings is not 0%, and an assistant nobody has rated would otherwise appear
 * on the dashboard as one everybody hated. The ticket dashboard's medians and
 * the sales report's average make the same call.
 */
class ChatMetrics
{
    /**
     * @return array<string, mixed>
     */
    public static function read(Carbon $from, Carbon $to): array
    {
        $to = $to->copy()->endOfDay();
        $range = [$from, $to];

        $conversations = ChatConversation::whereBetween('created_at', $range)->count();

        $asked = ChatMessage::where('role', 'user')
            ->whereBetween('created_at', $range)->count();

        $unanswered = ChatEvent::where('type', 'unanswered')
            ->whereBetween('created_at', $range)->count();

        $answers = ChatMessage::where('role', 'assistant')->whereBetween('created_at', $range);

        $rated = (clone $answers)->whereNotNull('rating')->count();
        $liked = (clone $answers)->where('rating', 1)->count();

        $leads = ChatConversation::whereBetween('created_at', $range)
            ->whereNotNull('lead_id')->count();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),

            'conversations' => $conversations,
            'questions' => $asked,

            /*
             * The figure this whole module lives or dies by. Every one of these
             * is a visitor who asked something the website could not answer —
             * §42's point exactly: they are not failures to hide, they are the
             * list of pages somebody should write.
             */
            'unanswered' => $unanswered,
            'unanswered_rate' => $asked > 0 ? round($unanswered / $asked * 100, 1) : null,

            'leads' => $leads,
            // Over conversations, not over questions: a lead comes from a
            // person, and one person asking six things is still one chance.
            'lead_rate' => $conversations > 0 ? round($leads / $conversations * 100, 1) : null,

            'rated' => $rated,
            'helpful_rate' => $rated > 0 ? round($liked / $rated * 100, 1) : null,

            'tokens' => (int) ChatConversation::whereBetween('created_at', $range)->sum('tokens_used'),

            'by_intent' => self::byIntent($range),
            'busiest_pages' => self::busiestPages($range),
        ];
    }

    /**
     * What people come to it for.
     *
     * Read off the stored intent rather than recomputed, so the figure and the
     * button somebody was shown at the time cannot disagree — the rule the
     * stored `actions` follow.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function byIntent(array $range): array
    {
        $rows = ChatMessage::where('role', 'assistant')
            ->whereBetween('created_at', $range)
            ->whereNotNull('intent')
            ->selectRaw('intent, count(*) as total')
            ->groupBy('intent')
            ->pluck('total', 'intent');

        // Every intent, including the ones with nothing against them: a row
        // reading zero says the question was asked, and an absent row reads as
        // the report having forgotten to ask it.
        return array_map(fn (string $intent) => [
            'intent' => $intent,
            'total' => (int) ($rows[$intent] ?? 0),
        ], [Intent::GENERAL, Intent::SUPPORT, Intent::SALES]);
    }

    /**
     * Where conversations start.
     *
     * The one piece of "top entry pages" worth keeping, because it is
     * actionable in a way the others are not: a page generating conversations
     * is a page not answering its own question.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function busiestPages(array $range): array
    {
        return ChatConversation::whereBetween('created_at', $range)
            ->whereNotNull('source_path')
            ->selectRaw('source_path, count(*) as total')
            ->groupBy('source_path')
            ->orderByDesc(DB::raw('count(*)'))
            ->limit(6)
            ->get()
            ->map(fn ($row) => ['path' => $row->source_path, 'total' => (int) $row->total])
            ->all();
    }
}
