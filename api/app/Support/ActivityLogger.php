<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Decides what is worth recording, and records it.
 *
 * ### Rules, not a list of routes
 *
 * The log covers sensitive actions rather than all 67 admin writes, and the
 * obvious way to express that -- an array of route names to log -- is the one
 * shape that fails silently: a route added next year is simply absent, and
 * nobody notices until they go looking for something that was never written.
 *
 * So sensitivity is decided by rules that already cover routes nobody has
 * written yet:
 *
 *   - **Every DELETE is sensitive**, wherever it lives. Destroying a record is
 *     the action people come to an audit log about, and a new destructive
 *     endpoint is caught the day it is added rather than the day it is missed.
 *   - **Every creation is sensitive.** A record appearing is as much a
 *     question as one disappearing, and `store` is a route name, so a new
 *     entity is covered before anybody thinks about it.
 *   - **Everything under staff, customers, settings and auth is sensitive**,
 *     whatever the verb. Those are accounts, other people's accounts, and the
 *     configuration that decides how the site behaves.
 *
 * Editing a blog post is deliberately not logged. It is the ordinary work of
 * the console, the CMS already keeps the content, and a log that records
 * everything is one nobody reads.
 */
class ActivityLogger
{
    /** Route groups where any write is worth a line. */
    private const SENSITIVE_GROUPS = ['staff', 'customers', 'settings', 'auth'];

    /**
     * Request keys that may be copied into `context`.
     *
     * An allowlist, never a blocklist. The settings form carries the SMTP
     * password and the integrations API key, so anything that copies a request
     * body wholesale is writing credentials to a table built to be read.
     */
    /*
     * `email` is here for one route: the mail test, which may now be pointed
     * at an address outside the company. Sending one fixed sentence to an
     * arbitrary inbox is a small thing, and a small thing that leaves no trace
     * is how it stays small until it does not.
     *
     * It is safe under the rule this list exists for — no settings key called
     * `email` holds a credential, and `NEVER` still wins where the two meet.
     */
    private const CONTEXT_ALLOWLIST = ['status', 'reason', 'role', 'roles', 'is_active', 'key', 'note', 'email'];

    /** Values never copied, even when a key above happens to match. */
    private const NEVER = ['password', 'password_confirmation', 'token', 'secret', 'value'];

    public static function record(Request $request, Response $response): void
    {
        try {
            if (! self::shouldRecord($request, $response)) {
                return;
            }

            $actor = $request->user();

            if (! $actor instanceof User) {
                return;
            }

            $subject = self::subjectOf($request);

            Activity::create([
                'user_id' => $actor->id,
                // Copied, not joined. See the note on the migration.
                'actor_name' => $actor->name,
                'actor_email' => $actor->email,
                'action' => self::actionOf($request),
                'subject_type' => self::morphKeyOf($subject),
                'subject_id' => $subject?->getKey(),
                'subject_label' => self::labelOf($subject),
                'context' => self::contextOf($request),
                'ip' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
            ]);
        } catch (\Throwable $e) {
            // Swallowed for the same reason Notifier swallows: the work this
            // describes is already committed, and failing the request now
            // would undo a save to protect a note about it.
            Log::error('Could not write the activity log', ['error' => $e->getMessage()]);
        }
    }

    /**
     * A staff member signed in.
     *
     * Recorded here rather than by the middleware because the sign-in route is
     * deliberately outside the admin group -- you cannot be authenticated to
     * authenticate -- so there is no `$request->user()` for the middleware to
     * read. This is the case an explicit call is for.
     */
    public static function signIn(User $user, Request $request): void
    {
        self::write([
            'user_id' => $user->id,
            'actor_name' => $user->name,
            'actor_email' => $user->email,
            'action' => 'login',
        ], $request);
    }

    /**
     * Somebody tried and failed.
     *
     * The most useful line in the log during an incident, and the one nothing
     * else keeps: a refused sign-in leaves no other trace, because the response
     * is deliberately uninformative about why.
     *
     * `user_id` stays null even when the address matches a real account. The
     * row is about an attempt, not about that person -- attributing a failed
     * attempt to whoever owns the address puts somebody else's mistake, or an
     * attacker's guess, under their name.
     */
    public static function signInFailed(string $email, Request $request, string $why = 'bad_credentials'): void
    {
        self::write([
            'user_id' => null,
            'actor_name' => 'Unknown',
            'actor_email' => substr($email, 0, 255),
            'action' => 'login_failed',
            'context' => ['reason' => $why],
        ], $request);
    }

    /**
     * Somebody asked for a sign-in code for the console.
     *
     * Recorded for every address, including ones with no account behind them —
     * the response is identical either way on purpose, so a run of these
     * against addresses that do not exist is the only visible trace of
     * somebody working through a list. `user_id` stays null for the same
     * reason a failed sign-in's does: the row is about an attempt.
     */
    public static function signInCodeRequested(string $email, Request $request): void
    {
        self::write([
            'user_id' => null,
            'actor_name' => 'Unknown',
            'actor_email' => substr($email, 0, 255),
            'action' => 'login_code_requested',
        ], $request);
    }

    /** Shared tail: stamp the request details, and never fail the caller. */
    private static function write(array $row, Request $request): void
    {
        try {
            Activity::create($row + [
                'ip' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
            ]);
        } catch (\Throwable $e) {
            Log::error('Could not write the activity log', ['error' => $e->getMessage()]);
        }
    }

    private static function shouldRecord(Request $request, Response $response): bool
    {
        // A refused or failed request changed nothing. Logging it would fill
        // the screen with validation errors and bury the actual events.
        if ($response->getStatusCode() >= 400) {
            return false;
        }

        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return false;
        }

        if ($request->isMethod('DELETE')) {
            return true;
        }

        // A new record. `store` is the route's own name, so this covers an
        // entity nobody has written yet.
        if (self::actionOf($request) === 'store') {
            return true;
        }

        return in_array(self::groupOf($request), self::SENSITIVE_GROUPS, true);
    }

    /**
     * The resource segment of the route name.
     *
     * Routes are named `api.v1.admin.customers.approve`, so the group and the
     * action are both already written down and neither has to be invented per
     * call site.
     */
    private static function groupOf(Request $request): ?string
    {
        $name = $request->route()?->getName();

        if (! $name || ! str_contains($name, 'admin.')) {
            return null;
        }

        $parts = explode('.', str_replace('api.v1.admin.', '', $name));

        return $parts[0] ?? null;
    }

    private static function actionOf(Request $request): string
    {
        $name = $request->route()?->getName();

        if ($name) {
            $parts = explode('.', $name);
            $last = end($parts);

            if ($last && $last !== 'admin') {
                return substr($last, 0, 40);
            }
        }

        return strtolower($request->method());
    }

    /**
     * The subject's morph key, or null if it has none.
     *
     * `enforceMorphMap` throws for an unregistered model, and this is called
     * inside the one place that must never lose a row: an audit log that drops
     * a deletion because it could not name the thing deleted has failed at its
     * only job. The label is stored separately and survives regardless, so the
     * line still reads. The real fix is registering the model — see
     * AppServiceProvider — and this is the seatbelt for the day somebody
     * forgets.
     */
    private static function morphKeyOf(?Model $subject): ?string
    {
        if (! $subject) {
            return null;
        }

        try {
            return $subject->getMorphClass();
        } catch (\Throwable $e) {
            Log::warning('Activity subject is not in the morph map', [
                'model' => $subject::class,
            ]);

            return null;
        }
    }

    /** The first bound model in the route, if there is one. */
    private static function subjectOf(Request $request): ?Model
    {
        foreach ($request->route()?->parameters() ?? [] as $parameter) {
            if ($parameter instanceof Model) {
                return $parameter;
            }
        }

        return null;
    }

    /**
     * What the record was called at the time.
     *
     * Stored rather than resolved later, because half the point of this log is
     * reading it after the thing was deleted.
     */
    private static function labelOf(?Model $subject): ?string
    {
        if (! $subject) {
            return null;
        }

        foreach (['name', 'title', 'reference', 'email', 'from_path'] as $attribute) {
            $value = $subject->getAttribute($attribute);

            if (filled($value)) {
                return substr((string) $value, 0, 255);
            }
        }

        return '#'.$subject->getKey();
    }

    private static function contextOf(Request $request): ?array
    {
        $context = [];

        /*
         * Which settings were touched, never what they were set to.
         *
         * "Somebody changed a setting" is close to useless; "somebody changed
         * mail_password" is the line an operator actually needs. The values are
         * the one thing that must not be here — that request body carries the
         * SMTP password and the integrations API key.
         */
        if (is_array($settings = $request->input('settings'))) {
            $keys = array_values(array_filter(array_map(
                fn ($row) => is_array($row) && is_string($row['key'] ?? null) ? $row['key'] : null,
                $settings,
            )));

            if ($keys) {
                $context['settings'] = array_slice($keys, 0, 40);
            }
        }

        foreach (self::CONTEXT_ALLOWLIST as $key) {
            if (in_array($key, self::NEVER, true) || ! $request->has($key)) {
                continue;
            }

            $value = $request->input($key);

            // Scalars and flat arrays only. Anything nested is a payload, and
            // a payload is the thing this must not store.
            if (is_scalar($value)) {
                $context[$key] = is_string($value) ? substr($value, 0, 255) : $value;
            } elseif (is_array($value) && $value === array_filter($value, 'is_scalar')) {
                $context[$key] = array_slice($value, 0, 20);
            }
        }

        return $context ?: null;
    }
}
