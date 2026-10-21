# C2 — Notification bell, mentions, team notes and edit awareness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.187.0: a per-person notification bell in the console, @mentions in the desk's note threads and in a new team-notes thread on the 14 content kinds, a live "also editing" strip, and a guard that refuses a save which would overwrite somebody's newer one.

**Architecture:** Three new tables (`staff_notifications`, `record_notes`, `edit_presence`) and one writer (`App\Support\Notifications\Notifications::send`) that every source calls after commit, gated by a PHP mirror of the console's nav roles (`ScreenAccess`) and delivered through B6's preferences, `Notifier` and `StaffPush`. The stale-save guard is one static check (`StaleGuard::check`) at the top of the 14 update actions, fed a hidden `base_updated_at`. The console gains a bell drawer, a mention picker, a team-notes drawer and a presence strip, all through route handlers or Server Actions — no sockets.

**Tech Stack:** Laravel 13 (PHP 8.3, PHPUnit 12, Larastan level 5), Next.js 16 App Router, React 19, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-21-notifications-edit-awareness-design.md`

## Global Constraints

- Everything under `api/` is **LF**. Files under `web/` are mixed — detect `\r\n` before editing with a script; prefer the Edit tool. Never write long files with a Bash heredoc (backslashes are eaten); use the Write tool.
- API tests: from `api/`, `php artisan test --filter=<Class>`. `phpunit.xml` pins `technoweb_test`. Authenticate staff with a **real `Authorization: Bearer` header** and `$this->app['auth']->forgetGuards()` before each switch of principal (copy `staff()`/`asStaff()` from `tests/Feature/ContentRevisionTest.php`).
- `composer analyse` must print "No errors"; never regenerate the baseline. `./vendor/bin/pint` on files you touched only — **never on `api/install/Wizard.php`** (its and `LogoBrandTest.php`'s pint complaints are pre-existing).
- Web gates, from `web/`: `npx tsc --noEmit` and `npm run lint` both exit 0.
- **The mock must match**: every new endpoint and response field is added to `web/mock-api.mjs` (Task 10).
- No hex colours; tokens only. No `text-white` on a fill; `-on` tokens. `Modal size="side"` for drawers. Every console notice/sentence comes from the API.
- A notification line **never** contains a note's body, a customer's email, phone or name, or a ticket's subject/text: only who, the kind, and a record's reference, number or title.
- All text is plain, stored as typed, rendered escaped. No HTML from anybody, no sanitiser path.
- Nothing in this release may fail the request that caused it: every `Notifications::send`, `Mentions::resolve`, delivery and note-delete listener is guarded (`try`/`catch Throwable` → `Log::warning`).
- Paths stored in `staff_notifications.path` are **console paths** (`/admin/...`), never URLs.
- Throttles: `GET /admin/mentionable` 60/min; `POST /admin/record-notes` 20/min; `POST /admin/presence` 12/min; `POST /admin/presence/leave` 30/min.
- Retention: notifications pruned 90 days after `created_at` (nightly); presence rows deleted after 1 hour (hourly); presence older than 60 seconds is ignored.
- Mentions: at most **10** people per note; bad, duplicate or excess ids are dropped silently, never a 422.
- Version: `VERSION.md` and `web/src/lib/version.ts` → `0.187.0` (not package.json).
- Commit `api/` and `web/` changes together when a task spans both. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions taken while planning (deviations from the spec — the user sees these at handoff)

1. **`ready` counts as finished for imports with a review step** (WordPress import, site import, subscriber mailbox scan and website crawl): the bell says "… is ready to review." That is the moment the starter must act; `completed`/`failed` are told too. Cost if wrong: one extra bell row per import.
2. **The product CSV import is not a source of `job_finished`.** It runs synchronously inside its starter's own request, so the starter is the actor and rule 1 would drop the row anyway.
3. **Presence leaving is `POST /admin/presence/leave`, not `DELETE`**: `navigator.sendBeacon` can only POST.
4. **The presence strip is mounted at the top of each form (`<EditPresence>` beside `<FormDraft>`), not inside `FormActions`**: `FormActions` is the sticky bar at the bottom, and the spec puts the strip *above* the form. It reads dirtiness from `isAnyFormDirty()`, the leave guard's own answer — the same source the spec names.
5. **`@Name` highlighting is drawn in team notes only.** The ticket, lead and order threads store no list of who was mentioned, so they render exactly as today. Adding a `mentions` column to three desk tables to colour a word is not worth it. Cost if wrong: a cosmetic follow-up.
6. **When the newer save was the caller's own (another tab)**, the stale refusal reads "You saved this at 10:14 in another tab, after you opened it." rather than naming the caller in the third person.
7. **The section library editor** (`pages/library/[id]`) saves through a function, not a `<form>`: its "Save mine anyway" calls the save again with `overwrite: true`, and "Load the newer version" reloads behind the editor's own leave guard (it has no `FormDraft`).
8. **`AdminJobOpeningResource` gains `updated_at`** — it is the one of the 14 admin resources that lacks it, and the hidden input needs it.

## Review Focus

1. **A person mentioned on, or assigned to, a record they cannot open** (a support engineer @-mentioned in a page note; a sales manager named in a ticket note) gets no row, no email, no push — `ScreenAccess` decides, and an admin always passes. Pinned in Task 4 (`test_a_person_who_cannot_open_the_screen_is_not_mentioned`).
2. **A system write moving `updated_at`** (a "helpful" vote, the health sweep, the search indexer, review summaries, the spec index, IndexNow, revision recording, tag stamping) would make a person's honest save refused as stale. Pinned in Task 6 (`test_system_writes_do_not_move_updated_at`).
3. **Restoring a draft after "Load the newer version" must not restore the old `base_updated_at`**, or the very next save is refused again although the person has now seen the newer version. Pinned in Task 9 (FormDraft skips `base_updated_at` and `overwrite`; probe step).
4. **A customer-visible ticket reply that sends `mentions[]`** must notify nobody, through the real endpoint with a real Bearer header. Pinned in Task 4.
5. **The bell count when the poll fails or the user cannot be read** shows no number (never "0", never stale "9+"); the drawer opened with the API down shows an error state, not an empty "all caught up". Pinned in Task 7 (null count → no badge; drawer error branch).

---

## File map

**API — new**
- `api/database/migrations/2026_10_26_100000_create_notification_tables.php` — the three tables + `staff_preferences.notify_mentions`.
- `api/app/Enums/StaffNotificationKind.php`
- `api/app/Models/StaffNotification.php`, `RecordNote.php`, `EditPresence.php`
- `api/app/Support/Notifications/ScreenAccess.php` — PHP mirror of nav roles.
- `api/app/Support/Notifications/Notifications.php` — the writer + delivery.
- `api/app/Support/Notifications/Mentions.php` — who a note mentions; mentionable list.
- `api/app/Support/Notifications/NoteKinds.php` — the 14 kinds' model class, title and console path.
- `api/app/Support/Notifications/JobFinished.php` — the import/backup finish map.
- `api/app/Support/Notifications/StaleGuard.php`
- `api/app/Notifications/StaffMentioned.php`, `StaffAssigned.php`
- `api/app/Http/Controllers/Api/V1/Admin/StaffNotificationController.php`, `MentionableController.php`, `RecordNoteController.php`, `PresenceController.php`
- `api/app/Console/Commands/PruneStaffNotifications.php`, `PruneEditPresence.php`
- Tests: `api/tests/Feature/StaffNotificationsTest.php`, `MentionsTest.php`, `RecordNotesTest.php`, `EditPresenceTest.php`, `StaleSaveTest.php`

**API — modified**
- `routes/api/admin-auth.php`, `routes/api/admin-revisions.php`, `routes/console.php`
- `app/Providers/AppServiceProvider.php` (morph map `record_note`; per-kind note-delete listeners)
- `app/Models/StaffPreference.php`, `app/Http/Controllers/Api/V1/Admin/NotificationsController.php`
- `app/Http/Controllers/Api/V1/Admin/DashboardController.php` (`newSince`)
- `app/Support/Alerts/AlertCheck.php`
- `app/Http/Controllers/Api/V1/Admin/TicketController.php`, `LeadController.php`, `VisitController.php`, `Store/OrderController.php`, `app/Support/Visits/VisitActions.php`, `app/Support/Meetings/MeetingActions.php`, `app/Http/Controllers/Api/V1/TicketController.php`, `app/Support/InboundMail/TicketPiper.php`
- `app/Models/{WordPressImport,SiteImport,NewsletterImport,Backup,BackupRestore}.php`
- The 14 update methods (Task 6 table), `app/Http/Controllers/Api/V1/ContentController.php`, `app/Http/Resources/Admin/AdminJobOpeningResource.php`
- `app/Support/ActivityLogger.php` (`overwrote()`)
- `app/Support/Mail/MessageCatalogueEntries.php`, `database/seeders/SettingsSeeder.php`
- `tests/Feature/AdminNavRolesTest.php`

**Web — new**
- `web/src/types/notifications.ts` (extend), `web/src/lib/admin/notifications.ts` (extend), `web/src/lib/admin/record-notes.ts`, `web/src/lib/admin/stale.ts`, `web/src/lib/mentions.ts`
- `web/src/app/api/admin/notifications/route.ts`, `web/src/app/api/admin/mentionable/route.ts`, `web/src/app/api/admin/presence/route.ts`
- `web/src/components/admin/notification-bell.tsx`, `mention-field.tsx`, `record-notes-panel.tsx`, `record-notes-dialog.tsx`, `record-notes-actions.ts`, `edit-presence.tsx`, `stale-alert.tsx`
- `web/scripts/mentions.check.mjs`, `web/scripts/probes/edit-awareness.mjs`
- `docs/notifications.md`, `manual/37-notifications.md`

**Web — modified**
- `web/src/app/admin/(app)/layout.tsx`, `new-since.tsx`, `web/src/app/api/admin/new-since/route.ts`
- `web/src/components/admin/form-draft.tsx`, `notifications-panel.tsx`, `web/src/app/admin/(app)/profile/notifications-actions.ts`
- Ticket reply form, lead note form, order note form (located in Task 8)
- The 14 `[id]/page.tsx`, their forms and their update actions (Task 9 table)
- `web/mock-api.mjs`, `web/scripts/audit.mjs`, `web/scripts/mobile-audit.mjs`, `web/scripts/probes/notifications.mjs`, `web/src/lib/help-routes.ts`
- `CLAUDE.md`, `API.md`, `manual/README.md` (row), `web/src/content/help.json` (regenerated), `VERSION.md`, `web/src/lib/version.ts`

---

### Task 1: Notifications core — schema, kinds, ScreenAccess, the writer, delivery

**Files:**
- Create: `api/database/migrations/2026_10_26_100000_create_notification_tables.php`, `api/app/Enums/StaffNotificationKind.php`, `api/app/Models/StaffNotification.php`, `api/app/Models/RecordNote.php`, `api/app/Models/EditPresence.php`, `api/app/Support/Notifications/ScreenAccess.php`, `api/app/Support/Notifications/Notifications.php`, `api/app/Notifications/StaffMentioned.php`, `api/app/Notifications/StaffAssigned.php`, `api/app/Console/Commands/PruneStaffNotifications.php`, `api/app/Console/Commands/PruneEditPresence.php`
- Modify: `api/app/Models/StaffPreference.php`, `api/app/Models/User.php` (relation, if needed), `api/app/Support/Mail/MessageCatalogueEntries.php`, `api/database/seeders/SettingsSeeder.php` (`alertRows()`), `api/routes/console.php`, `api/tests/Feature/AdminNavRolesTest.php`
- Test: `api/tests/Feature/StaffNotificationsTest.php`

**Interfaces:**
- Produces:
  - `enum StaffNotificationKind: string` with cases `MentionTicket='mention_ticket'`, `MentionLead='mention_lead'`, `MentionOrder='mention_order'`, `MentionNote='mention_note'`, `TicketAssigned='ticket_assigned'`, `LeadAssigned='lead_assigned'`, `VisitAssigned='visit_assigned'`, `MeetingBooked='meeting_booked'`, `TicketCustomerReply='ticket_customer_reply'`, `JobFinished='job_finished'`, `Alert='alert'`; methods `label(): string`, `group(): string` (`mention`|`assigned`|`alert`), `delivers(): bool`, `static options(): list<array{value,label,group}>`.
  - `ScreenAccess::can(User $user, string $path): bool`; `ScreenAccess::ROWS` (`list<array{0:string,1:?string,2:bool}>` = href, role gate, exact); `ScreenAccess::GATES` (`list<array{0:string,1:string}>` = regex, role gate).
  - `Notifications::send(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): ?StaffNotification`
  - `Notifications::later(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): void` — the same, wrapped in `DB::afterCommit`.
  - Models `StaffNotification` (fillable `user_id,kind,line,path,subject_type,subject_id,actor_id,actor_name,read_at`; casts `kind` → enum, `read_at` datetime; `UPDATED_AT = null`), `RecordNote` (`subject_type,subject_id,user_id,author_name,body,mentions` (array); `UPDATED_AT = null`), `EditPresence` (`user_id,subject_type,subject_id,dirty,opened_at,last_seen_at`; `$timestamps = false`).
  - `StaffPreference->notify_mentions` (bool, default true).

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * C2 (0.187.0, docs/notifications.md): the bell, team notes and presence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kind', 30);
            $table->string('line', 240);
            $table->string('path', 240)->nullable();
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name', 120)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('record_notes', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('author_name', 120)->nullable();
            $table->text('body');
            $table->json('mentions')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['subject_type', 'subject_id']);
        });

        Schema::create('edit_presence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->boolean('dirty')->default(false);
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->unique(['user_id', 'subject_type', 'subject_id']);
            $table->index(['subject_type', 'subject_id', 'last_seen_at']);
        });

        Schema::table('staff_preferences', function (Blueprint $table) {
            $table->boolean('notify_mentions')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('staff_preferences', fn (Blueprint $table) => $table->dropColumn('notify_mentions'));
        Schema::dropIfExists('edit_presence');
        Schema::dropIfExists('record_notes');
        Schema::dropIfExists('staff_notifications');
    }
};
```

- [ ] **Step 2: Write the enum and the three models**

`api/app/Enums/StaffNotificationKind.php`:

```php
<?php

namespace App\Enums;

/** What a bell row is about (C2, docs/notifications.md). The console lists none of these; `options()` is sent. */
enum StaffNotificationKind: string
{
    case MentionTicket = 'mention_ticket';
    case MentionLead = 'mention_lead';
    case MentionOrder = 'mention_order';
    case MentionNote = 'mention_note';
    case TicketAssigned = 'ticket_assigned';
    case LeadAssigned = 'lead_assigned';
    case VisitAssigned = 'visit_assigned';
    case MeetingBooked = 'meeting_booked';
    case TicketCustomerReply = 'ticket_customer_reply';
    case JobFinished = 'job_finished';
    case Alert = 'alert';

    public function label(): string
    {
        return match ($this) {
            self::MentionTicket => 'Mentioned on a ticket',
            self::MentionLead => 'Mentioned on a lead',
            self::MentionOrder => 'Mentioned on an order',
            self::MentionNote => 'Mentioned in a team note',
            self::TicketAssigned => 'Ticket assigned to you',
            self::LeadAssigned => 'Lead assigned to you',
            self::VisitAssigned => 'Visit assigned to you',
            self::MeetingBooked => 'Meeting booked with you',
            self::TicketCustomerReply => 'Customer replied',
            self::JobFinished => 'Finished',
            self::Alert => 'Alert',
        };
    }

    public function group(): string
    {
        return match ($this) {
            self::MentionTicket, self::MentionLead, self::MentionOrder, self::MentionNote => 'mention',
            self::Alert => 'alert',
            default => 'assigned',
        };
    }

    /** Whether the row may also go by email and push. An alert already has (B6); a finished job is bell only. */
    public function delivers(): bool
    {
        return $this !== self::Alert && $this !== self::JobFinished;
    }

    /** @return list<array{value: string, label: string, group: string}> */
    public static function options(): array
    {
        return array_map(fn (self $k) => ['value' => $k->value, 'label' => $k->label(), 'group' => $k->group()], self::cases());
    }
}
```

`api/app/Models/StaffNotification.php`:

```php
<?php

namespace App\Models;

use App\Enums\StaffNotificationKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line on a staff member's bell (C2, docs/notifications.md). */
class StaffNotification extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'kind', 'line', 'path', 'subject_type', 'subject_id', 'actor_id', 'actor_name', 'read_at'];

    protected function casts(): array
    {
        return ['kind' => StaffNotificationKind::class, 'read_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

`api/app/Models/RecordNote.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A team note on a content record (C2). Never edited; deleted with its record. */
class RecordNote extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['subject_type', 'subject_id', 'user_id', 'author_name', 'body', 'mentions'];

    protected function casts(): array
    {
        return ['mentions' => 'array'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

`api/app/Models/EditPresence.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Who has an edit screen open (C2). A row unseen for 60 seconds is ignored. */
class EditPresence extends Model
{
    protected $table = 'edit_presence';

    public $timestamps = false;

    protected $fillable = ['user_id', 'subject_type', 'subject_id', 'dirty', 'opened_at', 'last_seen_at'];

    protected function casts(): array
    {
        return ['dirty' => 'boolean', 'opened_at' => 'datetime', 'last_seen_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

In `api/app/Models/StaffPreference.php`: add `notify_mentions` to `$fillable`, `'notify_mentions' => 'boolean'` to `casts()`, and `'notify_mentions' => true` to the model's attribute defaults (the same place `alert_email`'s default `true` lives — read the file; if defaults are set in `StaffPreferences::for()`'s `new StaffPreference([...])`, add it there too, since an unsaved preference has no database default).

- [ ] **Step 3: Write `ScreenAccess` and pin it to the nav**

Generate the row list from `web/src/app/admin/(app)/nav-items.tsx` with the same regex `AdminNavRolesTest::navEntries()` uses, extended to read `exact: true`. Run this from `api/` and paste its output into the constant:

```bash
php -r '$s=file_get_contents("../web/src/app/admin/(app)/nav-items.tsx"); preg_match_all("/\{[^{}]*href:\s*\"(\/admin[^\"]*)\"[^{}]*\}/",$s,$m,PREG_SET_ORDER); foreach($m as $x){preg_match("/role:\s*\"([a-z_,]+)\"/",$x[0],$r); $e=preg_match("/exact:\s*true/",$x[0]); echo "        [\x27{$x[1]}\x27, ".(isset($r[1])?"\x27{$r[1]}\x27":"null").", ".($e?"true":"false")."],\n";}'
```

`api/app/Support/Notifications/ScreenAccess.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Models\User;

/**
 * Whether a person can open a console screen — the PHP twin of the console's
 * `screenRole()` (nav-items.tsx + nav-match.ts): SCREEN_GATES first, then the
 * longest matching row, an administrator passing every gate. A path no row
 * matches is refused. `AdminNavRolesTest` fails the moment the two disagree.
 */
final class ScreenAccess
{
    /** @var list<array{0: string, 1: ?string, 2: bool}> href, role gate, exact — generated from nav-items.tsx */
    public const ROWS = [
        // PASTE the generated rows here, in the file's order.
    ];

    /** @var list<array{0: string, 1: string}> regex, role gate — nav-items.tsx's SCREEN_GATES */
    public const GATES = [
        ['#^/admin/events/\d+/registrations$#', 'content_manager,sales_manager'],
    ];

    public static function can(User $user, string $path): bool
    {
        $path = rtrim((string) strtok(strtok($path, '?') ?: $path, '#'), '/') ?: '/';
        if (! str_starts_with($path, '/admin')) {
            return false;
        }

        foreach (self::GATES as [$pattern, $gate]) {
            if (preg_match($pattern, $path) === 1) {
                return self::permits($user, $gate);
            }
        }

        $best = null;
        foreach (self::ROWS as [$href, $gate, $exact]) {
            $hit = $path === $href || (! $exact && str_starts_with($path, $href.'/'));
            if ($hit && ($best === null || strlen($href) > strlen($best[0]))) {
                $best = [$href, $gate];
            }
        }

        return $best !== null && self::permits($user, $best[1]);
    }

    private static function permits(User $user, ?string $gate): bool
    {
        if ($user->isAdmin() || $gate === null) {
            return true;
        }

        foreach (explode(',', $gate) as $role) {
            if ($user->hasRole($role)) {
                return true;
            }
        }

        return false;
    }
}
```

(Check `User::hasRole()`'s parameter type — if it takes `App\Enums\Role`, call `$user->hasRole(\App\Enums\Role::from($role))`. `hasRole()` does not pass an admin; `isAdmin()` is checked first for that reason.)

In `api/tests/Feature/AdminNavRolesTest.php`, add (reusing `navEntries()`'s file read):

```php
public function test_screen_access_mirrors_the_sidebar(): void
{
    $source = file_get_contents(base_path('../web/src/app/admin/(app)/nav-items.tsx'));
    preg_match_all('/\{[^{}]*href:\s*"(\/admin[^"]*)"[^{}]*\}/', $source, $m, PREG_SET_ORDER);
    $rows = array_map(function (array $x): array {
        preg_match('/role:\s*"([a-z_,]+)"/', $x[0], $r);

        return [$x[1], $r[1] ?? null, preg_match('/exact:\s*true/', $x[0]) === 1];
    }, $m);

    $this->assertSame($rows, \App\Support\Notifications\ScreenAccess::ROWS, 'Regenerate ScreenAccess::ROWS from nav-items.tsx.');

    preg_match_all('/\{\s*match:\s*\/(.+?)\/,\s*role:\s*"([a-z_,]+)"\s*\}/', $source, $g, PREG_SET_ORDER);
    $this->assertSame(
        array_map(fn (array $x) => '#'.str_replace('\/', '/', $x[1]).'#', $g),
        array_column(\App\Support\Notifications\ScreenAccess::GATES, 0),
        'ScreenAccess::GATES must match SCREEN_GATES.',
    );
    $this->assertSame(array_column($g, 2), array_column(\App\Support\Notifications\ScreenAccess::GATES, 1));
}
```

- [ ] **Step 4: Run it — it passes once the rows are pasted, fails before**

Run: `php artisan test --filter=test_screen_access_mirrors_the_sidebar`
Expected before pasting: FAIL "Regenerate ScreenAccess::ROWS". After pasting: PASS. (If the gate regex in the test does not match the source's formatting, adjust the test's regex, not the constant.)

- [ ] **Step 5: Write the failing tests for the writer**

`api/tests/Feature/StaffNotificationsTest.php` (helpers `staff()`/`asStaff()` copied from `ContentRevisionTest`; `use Illuminate\Support\Facades\Notification;` and `Notification::fake()` in `setUp()`; `StaffPush` is a no-op unless push is ready, so push is asserted through a counting fake — bind one by wrapping `StaffPush::send` behind a static `$sent` hook only if `StaffPush` already exposes one; otherwise assert push via `MessageChannel::Push` not ready → 0 sends and test quiet hours on the email path only):

```php
public function test_a_row_is_written_for_someone_who_can_open_the_screen(): void
{
    $to = $this->staff(RoleEnum::SupportEngineer, 'to');
    $row = Notifications::send($to, StaffNotificationKind::TicketAssigned, 'Asha assigned TW-2026-00041 to you.', '/admin/tickets/TW-2026-00041');

    $this->assertNotNull($row);
    $this->assertDatabaseHas('staff_notifications', ['user_id' => $to->id, 'kind' => 'ticket_assigned', 'path' => '/admin/tickets/TW-2026-00041']);
}

public function test_nothing_is_written_for_the_actor_an_inactive_account_or_a_screen_they_cannot_open(): void
{
    $engineer = $this->staff(RoleEnum::SupportEngineer, 'e');
    $this->assertNull(Notifications::send($engineer, StaffNotificationKind::TicketAssigned, 'x', '/admin/tickets/TW-1', null, $engineer));

    $off = $this->staff(RoleEnum::SupportEngineer, 'off');
    $off->update(['is_active' => false]);
    $this->assertNull(Notifications::send($off, StaffNotificationKind::TicketAssigned, 'x', '/admin/tickets/TW-1'));

    $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', '/admin/pages/1'));
    $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', '/nowhere'));
    $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', null));
    $this->assertSame(0, StaffNotification::count());
}

public function test_an_administrator_can_be_told_about_any_console_screen(): void
{
    $admin = $this->staff(RoleEnum::Admin, 'adm');
    $this->assertNotNull(Notifications::send($admin, StaffNotificationKind::MentionNote, 'x', '/admin/pages/1'));
}

public function test_delivery_follows_the_preferences_and_the_site_switch(): void
{
    $to = $this->staff(RoleEnum::SupportEngineer, 'd');
    Notifications::send($to, StaffNotificationKind::TicketAssigned, 'one', '/admin/tickets/TW-1');
    Notification::assertSentTo($to, StaffAssigned::class);

    StaffPreference::create(['user_id' => $to->id, 'notify_mentions' => false]);
    $to->unsetRelation('staffPreference');
    Notifications::send($to, StaffNotificationKind::MentionTicket, 'two', '/admin/tickets/TW-1');
    Notification::assertNotSentTo($to, StaffMentioned::class);

    $to->staffPreference->update(['notify_mentions' => true, 'alert_email' => false]);
    $to->unsetRelation('staffPreference');
    Notifications::send($to, StaffNotificationKind::MentionTicket, 'three', '/admin/tickets/TW-1');
    Notification::assertNotSentTo($to, StaffMentioned::class);

    $to->staffPreference->update(['alert_email' => true]);
    $to->unsetRelation('staffPreference');
    Setting::updateOrCreate(['key' => 'alerts_mentions_enabled'], ['group' => 'alerts', 'value' => '0', 'type' => 'boolean']);
    Setting::flushCache();
    Notifications::send($to, StaffNotificationKind::MentionTicket, 'four', '/admin/tickets/TW-1');
    Notification::assertNotSentTo($to, StaffMentioned::class);

    $this->assertSame(4, StaffNotification::where('user_id', $to->id)->count(), 'The bell fills whatever the delivery.');
}

public function test_an_alert_row_and_a_finished_job_are_never_delivered(): void
{
    $to = $this->staff(RoleEnum::Admin, 'al');
    Notifications::send($to, StaffNotificationKind::Alert, 'TW-1 is past its due time.', '/admin/tickets/TW-1', null, null, false);
    Notifications::send($to, StaffNotificationKind::JobFinished, 'The backup has finished.', '/admin/backups');
    Notification::assertNothingSent();
}

public function test_a_failure_never_reaches_the_caller(): void
{
    $to = $this->staff(RoleEnum::SupportEngineer, 'f');
    $long = str_repeat('x', 5000); // longer than the column
    $this->assertNull(Notifications::send($to, StaffNotificationKind::TicketAssigned, $long, '/admin/tickets/TW-1'));
}

public function test_rows_are_pruned_after_ninety_days(): void
{
    $to = $this->staff(RoleEnum::SupportEngineer, 'p');
    $old = Notifications::send($to, StaffNotificationKind::TicketAssigned, 'old', '/admin/tickets/TW-1');
    $old->forceFill(['created_at' => now()->subDays(91)])->save();
    Notifications::send($to, StaffNotificationKind::TicketAssigned, 'new', '/admin/tickets/TW-2');

    $this->artisan('technoware:prune-staff-notifications')->assertExitCode(0);
    $this->assertSame(['new'], StaffNotification::pluck('line')->all());
}
```

(If MySQL in strict mode does not throw on the 5000-character line, truncation is silent — then use a `user_id` of a deleted user, or pass a `$path` of 300 characters, whichever throws; the point is that `send()` returns null instead of throwing. Note the line is also cut to 240 in `send()` — see Step 7 — so pick the path.)

- [ ] **Step 6: Run them — they fail**

Run: `php artisan test --filter=StaffNotificationsTest`
Expected: FAIL — `Class "App\Support\Notifications\Notifications" not found`.

- [ ] **Step 7: Write the writer, the two mails, the setting and the prune commands**

`api/app/Support/Notifications/Notifications.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\Setting;
use App\Models\StaffNotification;
use App\Models\User;
use App\Notifications\StaffAssigned;
use App\Notifications\StaffMentioned;
use App\Support\Alerts\StaffPreferences;
use App\Support\Alerts\StaffPush;
use App\Support\Notifier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * The one writer of the console's bell (C2, docs/notifications.md). Never to
 * the actor, never to an inactive account, never about a screen the person
 * cannot open, and never a failure for the caller.
 */
final class Notifications
{
    public static function send(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): ?StaffNotification
    {
        try {
            if ($actor !== null && $actor->is($to)) {
                return null;
            }
            if (! $to->is_active || $path === null || ! ScreenAccess::can($to, $path)) {
                return null;
            }

            $row = StaffNotification::create([
                'user_id' => $to->id,
                'kind' => $kind,
                'line' => Str::limit($line, 237),
                'path' => $path,
                'subject_type' => $subject?->getMorphClass(),
                'subject_id' => $subject?->getKey(),
                'actor_id' => $actor?->id,
                'actor_name' => $actor?->name,
            ]);

            if ($deliver && $kind->delivers()) {
                self::deliver($to, $row);
            }

            return $row;
        } catch (Throwable $e) {
            Log::warning('Staff notification failed', ['kind' => $kind->value, 'user' => $to->id, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /** `send()` once the caller's transaction commits — immediately when there is none. */
    public static function later(User $to, StaffNotificationKind $kind, string $line, ?string $path, ?Model $subject = null, ?User $actor = null, bool $deliver = true): void
    {
        DB::afterCommit(fn () => self::send($to, $kind, $line, $path, $subject, $actor, $deliver));
    }

    private static function deliver(User $to, StaffNotification $row): void
    {
        if (Setting::get('alerts_mentions_enabled') === false) {
            return;
        }

        $prefs = StaffPreferences::for($to);
        if (! $prefs->notify_mentions) {
            return;
        }

        if ($prefs->alert_email) {
            Notifier::send($to, $row->kind->group() === 'mention' ? new StaffMentioned($row) : new StaffAssigned($row));
        }
        if ($prefs->alert_push && ! $prefs->quietAt(now())) {
            StaffPush::send($to, $row->line, [$row->line], (string) $row->path);
        }
    }
}
```

`api/app/Notifications/StaffMentioned.php` — mirror `StaffAlerts` exactly (same traits, `via()`, method order `templateData(` before `defaultMail(`):

```php
<?php

namespace App\Notifications;

use App\Models\StaffNotification;
use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Mail\Placeholders;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** A staff member was mentioned in a note (C2). The note's text is never in it. */
class StaffMentioned extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail, Templated;

    public function __construct(public readonly StaffNotification $row) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_mentioned';
    }

    protected function templateData(object $notifiable): array
    {
        $base = rtrim((string) config('app.frontend_url'), '/');

        return [
            'name' => (string) ($notifiable->name ?? ''),
            'line' => $this->row->line,
            'url' => $base.$this->row->path,
            'preferences_url' => $base.'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $d = $this->templateData($notifiable);

        return (new MailMessage)
            ->subject($this->row->line)
            ->greeting('Hello '.$d['name'].',')
            ->line($this->row->line)
            ->action('Open it', $d['url'])
            ->line('Choose what reaches you on Your account → Notifications.');
    }
}
```

(Check the imports `StaffAlerts` uses — `QueuedMail` and `Templated` live where `StaffAlerts` imports them from; drop `Placeholders` if unused. Copy, don't guess.)

`api/app/Notifications/StaffAssigned.php`: `class StaffAssigned extends StaffMentioned` with only `templateKey()` returning `'staff_assigned'` and the docblock "Something was assigned to a staff member, or finished, or a customer replied (C2)." — if `MailTemplateTest` slices each class's own source for `templateData(` and fails on a class without one, repeat the two methods instead of extending.

In `api/app/Support/Mail/MessageCatalogueEntries.php`, beside `staff_alerts` (inside `enquiries()`), add `staff_mentioned` and `staff_assigned`, imported with `use`:

```php
'staff_mentioned' => [
    'label' => 'Mentioned — to a staff member',
    'description' => 'Sent when a colleague mentions somebody in a note on a ticket, a lead, an order or a page. It names the record and never quotes the note.',
    'audience' => self::INTERNAL,
    'class' => StaffMentioned::class,
    'variables' => [
        'name' => ['about' => 'The staff member’s name.', 'sample' => 'Priya Sharma'],
        'line' => ['about' => 'What happened, in one sentence.', 'sample' => 'Asha mentioned you on ticket TW-2026-00041.'],
        'url' => ['about' => 'The record in the console.', 'sample' => 'https://www.example.com/admin/tickets/TW-2026-00041'],
        'preferences_url' => ['about' => 'Where to choose what arrives.', 'sample' => 'https://www.example.com/admin/profile'],
    ],
    'subject' => '{{line}}',
    'body' => '<p>Hello {{name}},</p><p>{{line}}</p><p><a href="{{url}}">Open it</a></p><p><a href="{{preferences_url}}">Choose what reaches you</a></p>',
],
'staff_assigned' => [
    'label' => 'Assigned — to a staff member',
    'description' => 'Sent when a ticket, a lead or a visit is assigned to somebody, a meeting is booked with them, or a customer replies on their ticket.',
    'audience' => self::INTERNAL,
    'class' => StaffAssigned::class,
    'variables' => [ /* the same four, sample line 'Asha assigned TW-2026-00041 to you.' */ ],
    'subject' => '{{line}}',
    'body' => '<p>Hello {{name}},</p><p>{{line}}</p><p><a href="{{url}}">Open it</a></p><p><a href="{{preferences_url}}">Choose what reaches you</a></p>',
],
```

(Write the four variables out in full for `staff_assigned` — no comment placeholder in the code.)

In `SettingsSeeder::alertRows()` append `['group' => 'alerts', 'key' => 'alerts_mentions_enabled', 'value' => '1', 'type' => 'boolean']`.

`api/app/Console/Commands/PruneStaffNotifications.php` (copy `PruneAlertFires`'s shape):

```php
protected $signature = 'technoware:prune-staff-notifications';
protected $description = 'Delete bell rows 90 days old.';

public function handle(): int
{
    $deleted = StaffNotification::query()->where('created_at', '<', now()->subDays(90))->delete();
    $this->info("Deleted {$deleted} notification(s).");

    return self::SUCCESS;
}
```

`PruneEditPresence.php`: signature `technoware:prune-edit-presence`, deletes `EditPresence::where('last_seen_at', '<', now()->subHour())`.

In `routes/console.php` beside `prune-alert-fires`:

```php
Schedule::command('technoware:prune-staff-notifications')->dailyAt('03:35');
Schedule::command('technoware:prune-edit-presence')->hourly();
```

- [ ] **Step 8: Run the tests — they pass**

Run: `php artisan test --filter="StaffNotificationsTest|AdminNavRolesTest|MailTemplateTest"`
Expected: PASS (all).

- [ ] **Step 9: Commit**

```bash
git add api/database/migrations/2026_10_26_100000_create_notification_tables.php api/app/Enums/StaffNotificationKind.php api/app/Models/StaffNotification.php api/app/Models/RecordNote.php api/app/Models/EditPresence.php api/app/Models/StaffPreference.php api/app/Support/Notifications api/app/Notifications/StaffMentioned.php api/app/Notifications/StaffAssigned.php api/app/Support/Mail/MessageCatalogueEntries.php api/database/seeders/SettingsSeeder.php api/app/Console/Commands/PruneStaffNotifications.php api/app/Console/Commands/PruneEditPresence.php api/routes/console.php api/tests/Feature/StaffNotificationsTest.php api/tests/Feature/AdminNavRolesTest.php
git commit -m "Notifications: the bell's table, kinds, screen access and writer"
```

---

### Task 2: The bell's API, `new-since`, the preference switch and the alert hookup

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/StaffNotificationController.php`
- Modify: `api/routes/api/admin-auth.php`, `api/app/Http/Controllers/Api/V1/Admin/DashboardController.php`, `api/app/Http/Controllers/Api/V1/Admin/NotificationsController.php`, `api/app/Support/Alerts/AlertCheck.php`
- Test: `api/tests/Feature/StaffNotificationsTest.php` (add)

**Interfaces:**
- Consumes: `Notifications::send`, `StaffNotification`, `StaffNotificationKind::options()` (Task 1).
- Produces: `GET /admin/notifications?filter=unread|all&page=` → `{data: [{id, kind, group, line, path, actor_name, read_at, created_at}], meta: {current_page, last_page, per_page: 30, total, unread, kinds}}`; `POST /admin/notifications/{id}/read` → `{data: row}`; `POST /admin/notifications/read-all` → `{updated: int}`; `GET /admin/new-since` adds `notifications_unread: int`; preferences gain `notify_mentions`.

- [ ] **Step 1: Write the failing tests**

```php
public function test_the_bell_lists_only_the_callers_rows_newest_first_and_counts_unread(): void
{
    $me = $this->staff(RoleEnum::SupportEngineer, 'me');
    $other = $this->staff(RoleEnum::SupportEngineer, 'other');
    Notifications::send($me, StaffNotificationKind::TicketAssigned, 'first', '/admin/tickets/TW-1');
    $this->travel(1)->minutes();
    Notifications::send($me, StaffNotificationKind::TicketAssigned, 'second', '/admin/tickets/TW-2');
    Notifications::send($other, StaffNotificationKind::TicketAssigned, 'not mine', '/admin/tickets/TW-3');

    $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/notifications?filter=all')
        ->assertOk()
        ->assertJsonPath('data.0.line', 'second')
        ->assertJsonPath('data.0.group', 'assigned')
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.unread', 2)
        ->assertJsonPath('meta.per_page', 30);
}

public function test_read_one_read_all_and_another_persons_row_is_a_404(): void
{
    $me = $this->staff(RoleEnum::SupportEngineer, 'me');
    $other = $this->staff(RoleEnum::SupportEngineer, 'other');
    $mine = Notifications::send($me, StaffNotificationKind::TicketAssigned, 'a', '/admin/tickets/TW-1');
    Notifications::send($me, StaffNotificationKind::TicketAssigned, 'b', '/admin/tickets/TW-2');
    $theirs = Notifications::send($other, StaffNotificationKind::TicketAssigned, 'c', '/admin/tickets/TW-3');

    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/notifications/{$theirs->id}/read")->assertNotFound();
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/notifications/{$mine->id}/read")->assertOk();
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/notifications')->assertJsonCount(1, 'data')->assertJsonPath('meta.unread', 1);
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson('/api/v1/admin/notifications/read-all')->assertOk()->assertJsonPath('updated', 1);
    $this->assertNull($theirs->fresh()->read_at);
}

public function test_new_since_carries_the_unread_count(): void
{
    $me = $this->staff(RoleEnum::SupportEngineer, 'me');
    Notifications::send($me, StaffNotificationKind::TicketAssigned, 'a', '/admin/tickets/TW-1');
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/new-since?since='.urlencode(now()->subHour()->toIso8601String()))
        ->assertOk()->assertJsonPath('data.notifications_unread', 1);
}

public function test_the_preference_switch_is_saved(): void
{
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->patchJson('/api/v1/admin/notifications/preferences', ['notify_mentions' => false])
        ->assertOk()->assertJsonPath('data.notify_mentions', false);
}

public function test_an_alert_fire_writes_a_bell_row_and_sends_one_email(): void
{
    // Reuse the fixture the B6 alert test uses for TicketOverdue (see tests/Feature/*Alert*Test.php):
    // an overdue open ticket and a support engineer who holds the rule.
    $engineer = $this->staff(RoleEnum::SupportEngineer, 'al');
    $this->overdueTicket();  // copy the helper from the B6 alerts test

    AlertCheck::run();

    $this->assertDatabaseHas('staff_notifications', ['user_id' => $engineer->id, 'kind' => 'alert']);
    Notification::assertSentToTimes($engineer, StaffAlerts::class, 1);
    Notification::assertNotSentTo($engineer, StaffAssigned::class);

    AlertCheck::run(); // the same fire again: nothing new
    $this->assertSame(1, StaffNotification::where('user_id', $engineer->id)->count());
}
```

(Open the B6 alerts test with `grep -l AlertCheck api/tests/Feature/*.php` and copy its overdue-ticket fixture into a private `overdueTicket()` here.)

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=StaffNotificationsTest`
Expected: the new tests FAIL with 404s / missing `notifications_unread` / no `alert` row.

- [ ] **Step 3: Write the controller and routes**

`api/app/Http/Controllers/Api/V1/Admin/StaffNotificationController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\StaffNotificationKind;
use App\Http\Controllers\Controller;
use App\Models\StaffNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The caller's own bell (C2, docs/notifications.md). Staff-wide: every row is the caller's. */
class StaffNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $page = StaffNotification::query()
            ->where('user_id', $userId)
            ->when($request->query('filter', 'unread') !== 'all', fn ($q) => $q->whereNull('read_at'))
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate(30);

        return response()->json([
            'data' => $page->getCollection()->map(fn (StaffNotification $n) => self::row($n))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'unread' => StaffNotification::query()->where('user_id', $userId)->whereNull('read_at')->count(),
                'kinds' => StaffNotificationKind::options(),
            ],
        ]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $row = StaffNotification::query()->where('user_id', $request->user()->id)->findOrFail($id);
        $row->read_at ??= now();
        $row->save();

        return response()->json(['data' => self::row($row)]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $updated = StaffNotification::query()->where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['updated' => $updated]);
    }

    /** @return array<string, mixed> */
    private static function row(StaffNotification $n): array
    {
        return [
            'id' => $n->id,
            'kind' => $n->kind->value,
            'group' => $n->kind->group(),
            'line' => $n->line,
            'path' => $n->path,
            'actor_name' => $n->actor_name,
            'read_at' => $n->read_at?->toIso8601String(),
            'created_at' => $n->created_at?->toIso8601String(),
        ];
    }
}
```

In `api/routes/api/admin-auth.php`, after the existing `notifications/...` lines (the literals stay above the numbered route):

```php
Route::get('notifications', [StaffNotificationController::class, 'index'])->name('staff-notifications.index');
Route::post('notifications/read-all', [StaffNotificationController::class, 'readAll'])->name('staff-notifications.read-all');
Route::post('notifications/{id}/read', [StaffNotificationController::class, 'read'])->whereNumber('id')->name('staff-notifications.read');
```

In `DashboardController::newSince()`, add to the returned `data`:

```php
'notifications_unread' => StaffNotification::query()->where('user_id', $request->user()->id)->whereNull('read_at')->count(),
```

In `NotificationsController::update()` rules add `'notify_mentions' => ['sometimes', 'boolean'],`, and in the method that builds the `data` shape for `show`/`update` add `'notify_mentions' => (bool) $prefs->notify_mentions,`.

In `AlertCheck::run()`, immediately after the `foreach ($batch ...) { AlertFire::...updateOrCreate(...) }` loop and before `self::deliver(...)`:

```php
foreach ($batch as ['hit' => $hit]) {
    Notifications::send($user, StaffNotificationKind::Alert, $hit->line, $hit->href, null, null, false);
}
```

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="StaffNotificationsTest|Alert"`
Expected: PASS, including the existing B6 alert tests.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/StaffNotificationController.php api/routes/api/admin-auth.php api/app/Http/Controllers/Api/V1/Admin/DashboardController.php api/app/Http/Controllers/Api/V1/Admin/NotificationsController.php api/app/Support/Alerts/AlertCheck.php api/tests/Feature/StaffNotificationsTest.php
git commit -m "Notifications: the bell's API, the unread count and alert rows"
```

---

### Task 3: The sources — assignments, customer replies, meetings, finished jobs

**Files:**
- Create: `api/app/Support/Notifications/JobFinished.php`
- Modify: `api/app/Http/Controllers/Api/V1/Admin/TicketController.php` (`apply()`, ~line 309–325), `LeadController.php` (`update()`, ~229–233), `VisitController.php` (`update()`, ~127–132), `api/app/Support/Visits/VisitActions.php` (`confirm()`, ~162–171), `api/app/Support/Meetings/MeetingActions.php` (`book()`, after commit ~196), `api/app/Http/Controllers/Api/V1/TicketController.php` (`storeMessage()`), `api/app/Support/InboundMail/TicketPiper.php` (`reply()`, ~293), `api/app/Models/{WordPressImport,SiteImport,NewsletterImport,Backup,BackupRestore}.php`
- Test: `api/tests/Feature/StaffNotificationsTest.php` (add)

**Interfaces:**
- Consumes: `Notifications::later(...)` (Task 1).
- Produces: `JobFinished::tell(Model $job): void` and `JobFinished::watch(string $class): void`.

Lines (exact wording; references only, never contact details or subjects):
- ticket: `"{actor} assigned {reference} to you."`, path `/admin/tickets/{reference}`
- lead: `"{actor} assigned lead #{id} to you."`, path `/admin/leads/{id}`
- visit: `"{actor} assigned visit {reference} to you."`, path `/admin/visits/{reference}`
- meeting: `"Meeting {reference} was booked with you for {date_label} at {time_label}."` (use the meeting's own API labels; if the model has no label accessors, format `starts_at` in `config('app.timezone')` as `j F` and `g:i a`), path `/admin/my-meetings/{reference}`
- customer reply: `"The customer replied on {reference}."`, path `/admin/tickets/{reference}`, actor null
- job: `"{label} has finished."` / `"{label} failed."` / `"{label} is ready to review."`

- [ ] **Step 1: Write the failing tests**

```php
public function test_assigning_a_ticket_tells_the_assignee_and_not_the_assigner(): void
{
    $engineer = $this->staff(RoleEnum::SupportEngineer, 'eng');
    $ticket = $this->ticket(); // copy the minimal ticket factory used by tests/Feature/AdminTicketTest.php (customer + category)

    $this->asStaff(RoleEnum::SupportEngineer, 'lead')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $engineer->id])->assertOk();

    $row = StaffNotification::where('user_id', $engineer->id)->sole();
    $this->assertSame('ticket_assigned', $row->kind->value);
    $this->assertSame("Support_engineer lead assigned {$ticket->reference} to you.", $row->line);
    $this->assertStringNotContainsString($ticket->subject, $row->line);

    $this->asStaff(RoleEnum::SupportEngineer, 'eng')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $engineer->id]);
    $this->assertSame(1, StaffNotification::where('user_id', $engineer->id)->count(), 'An unchanged assignee is not told again.');
}

public function test_a_customer_reply_tells_the_assignee(): void
{
    $engineer = $this->staff(RoleEnum::SupportEngineer, 'eng');
    $ticket = $this->ticket(['assigned_to' => $engineer->id]);
    $this->asCustomer($ticket->customer)->postJson("/api/v1/tickets/{$ticket->reference}/messages", ['body' => 'Any news?'])->assertCreated();

    $this->assertDatabaseHas('staff_notifications', ['user_id' => $engineer->id, 'kind' => 'ticket_customer_reply', 'line' => "The customer replied on {$ticket->reference}."]);
}

public function test_assigning_a_lead_tells_the_assignee(): void
{
    $sales = $this->staff(RoleEnum::SalesManager, 's');
    $lead = $this->lead(); // copy the minimal Lead::create from tests/Feature/LeadsTest.php
    $this->asStaff(RoleEnum::SalesManager, 'boss')->patchJson("/api/v1/admin/leads/{$lead->id}", ['assigned_to' => $sales->id])->assertOk();
    $this->assertDatabaseHas('staff_notifications', ['user_id' => $sales->id, 'kind' => 'lead_assigned', 'path' => "/admin/leads/{$lead->id}"]);
}

public function test_a_finished_backup_tells_whoever_started_it(): void
{
    $admin = $this->staff(RoleEnum::Admin, 'bk');
    $backup = Backup::create([/* the minimum columns BackupTest uses */ 'created_by' => $admin->id, 'status' => 'uploading']);
    $backup->update(['status' => 'completed']);
    $this->assertDatabaseHas('staff_notifications', ['user_id' => $admin->id, 'kind' => 'job_finished', 'line' => 'The backup has finished.']);
    Notification::assertNothingSent();
}
```

Add one test each for a visit (`PATCH /admin/visits/{reference}` with `assigned_to`), a meeting booked by a sales manager with a `meeting_host` host (`MeetingActions::book(..., by: $sales, hostId: $host->id)`), and a WordPress import moving to `ready` ("The WordPress import is ready to review."), copying fixtures from `VisitsTest`, `MeetingsTest` and `WordPressImportTest`. Add `asCustomer()` from the portal ticket tests (customer token named `portal`, real Bearer header, `forgetGuards()`).

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=StaffNotificationsTest`
Expected: the new tests FAIL (no rows written).

- [ ] **Step 3: Write the sources**

`TicketController::apply()` — inside the assignee block, after `$ticket->assigned_to = $to;` (the block already knows the old value and `$staffId`):

```php
if ($to !== null && $to !== $previousAssigneeId) {   // name the variable the block already holds for the old id
    $assignee = User::find($to);
    $actor = User::find($staffId);
    if ($assignee !== null) {
        Notifications::later($assignee, StaffNotificationKind::TicketAssigned, ($actor?->name ?? 'Somebody')." assigned {$ticket->reference} to you.", "/admin/tickets/{$ticket->reference}", $ticket, $actor);
    }
}
```

`LeadController::update()` — inside the `assigned_to` block, after `$lead->assigned_to = ...`:

```php
if ($to !== null) {
    Notifications::later($to, StaffNotificationKind::LeadAssigned, "{$actor->name} assigned lead #{$lead->id} to you.", "/admin/leads/{$lead->id}", $lead, $actor);
}
```

`VisitController::update()` and `VisitActions::confirm()` — wherever `assigned_to` changes to a non-null id different from the old one:

```php
if ($newId !== null && $newId !== $oldId && ($assignee = User::find($newId)) !== null) {
    Notifications::later($assignee, StaffNotificationKind::VisitAssigned, "{$by->name} assigned visit {$visit->reference} to you.", "/admin/visits/{$visit->reference}", $visit, $by);
}
```

`MeetingActions::book()` — after the transaction, beside `MeetingNotices::booked($meeting)`:

```php
if ($meeting->host_id !== null && ($host = User::find($meeting->host_id)) !== null) {
    Notifications::send($host, StaffNotificationKind::MeetingBooked, "Meeting {$meeting->reference} was booked with you for {$when}.", "/admin/my-meetings/{$meeting->reference}", $meeting, $by);
}
```

(`$when` = the meeting's date and time labels joined with " at "; reuse whatever `MeetingNotices` uses for the host email.)

Portal `TicketController::storeMessage()` and `TicketPiper::reply()` — beside the `Notifier::route('support_email', ...)` call:

```php
if ($ticket->assigned_to !== null && ($assignee = User::find($ticket->assigned_to)) !== null) {
    Notifications::later($assignee, StaffNotificationKind::TicketCustomerReply, "The customer replied on {$ticket->reference}.", "/admin/tickets/{$ticket->reference}", $ticket);
}
```

`api/app/Support/Notifications/JobFinished.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\NewsletterImport;
use App\Models\SiteImport;
use App\Models\User;
use App\Models\WordPressImport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tells whoever started a long job that it is done (C2). `ready` counts for the
 * imports with a review step — that is when the starter has to act. The bell
 * only: a long import does not email its starter.
 */
final class JobFinished
{
    /** @var array<class-string<Model>, array{0: string, 1: string, 2: list<string>}> starter column, path, statuses */
    private const JOBS = [
        WordPressImport::class => ['uploaded_by', '/admin/imports/wordpress', ['ready', 'completed', 'failed']],
        SiteImport::class => ['uploaded_by', '/admin/imports/site', ['ready', 'completed', 'failed']],
        NewsletterImport::class => ['uploaded_by', '/admin/newsletter/subscribers/import', ['ready', 'failed']],
        Backup::class => ['created_by', '/admin/backups', ['completed', 'completed_with_errors', 'failed']],
        BackupRestore::class => ['created_by', '/admin/backups', ['completed', 'failed']],
    ];

    public static function watch(string $class): void
    {
        $class::updated(function (Model $job) {
            if ($job->wasChanged('status')) {
                self::tell($job);
            }
        });
    }

    public static function tell(Model $job): void
    {
        try {
            [$column, $path, $statuses] = self::JOBS[$job::class];
            $status = (string) $job->getAttribute('status');
            if (! in_array($status, $statuses, true)) {
                return;
            }
            if ($job instanceof NewsletterImport && ! $job->isScan()) {
                return;
            }
            $starter = User::find($job->getAttribute($column));
            if ($starter === null) {
                return;
            }

            $label = self::label($job);
            $line = match ($status) {
                'failed' => "{$label} failed.",
                'ready' => "{$label} is ready to review.",
                default => "{$label} has finished.",
            };
            Notifications::send($starter, StaffNotificationKind::JobFinished, $line, $path, $job);
        } catch (Throwable $e) {
            Log::warning('Job-finished notification failed', ['job' => $job::class, 'error' => $e->getMessage()]);
        }
    }

    private static function label(Model $job): string
    {
        return match (true) {
            $job instanceof WordPressImport => 'The WordPress import',
            $job instanceof SiteImport => 'The site import',
            $job instanceof NewsletterImport => $job->getAttribute('source') === 'crawl' ? 'The website crawl' : 'The mailbox scan',
            $job instanceof BackupRestore => 'The restore',
            default => 'The backup',
        };
    }
}
```

(Confirm `NewsletterImport::isScan()` exists — the doc says scans are `isScan()`; if the name differs, use it.) Register in each of the five models' `booted()`: `JobFinished::watch(static::class);` — or once in `AppServiceProvider::boot()` with a loop over the five classes, beside the health listeners. Then **verify each status transition goes through the model**: open `RunWordPressImport::analyse()/commit()/handle()/failed()`, `RunSiteImport`, `CrawlWebsiteForSubscribers`, `ScanMailboxForSubscribers`, `BackupRunner::upload()/fail()`, `RestoreRunner::finish()/fail()` and `PruneWordPressImports`/`PruneSiteImports`/`PruneNewsletterScans`; wherever a status is written with `Model::query()->...->update([...])` or `DB::table`, add `JobFinished::tell($job->fresh())` after that write. A prune that expires an import is **not** told (`expired` is not in the list).

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="StaffNotificationsTest|TicketTest|LeadsTest|VisitsTest|MeetingsTest|BackupTest|WordPressImportTest|SiteImportTest|InboundMailTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Notifications/JobFinished.php api/app/Http/Controllers api/app/Support/Visits/VisitActions.php api/app/Support/Meetings/MeetingActions.php api/app/Support/InboundMail/TicketPiper.php api/app/Models api/app/Providers/AppServiceProvider.php api/app/Jobs api/app/Support/Backups api/tests/Feature/StaffNotificationsTest.php
git commit -m "Notifications: assignments, customer replies, meetings and finished jobs"
```

---

### Task 4: Mentions — the picker's list, who is told, the three desk threads

**Files:**
- Create: `api/app/Support/Notifications/Mentions.php`, `api/app/Support/Notifications/NoteKinds.php`, `api/app/Http/Controllers/Api/V1/Admin/MentionableController.php`
- Modify: `api/routes/api/admin-auth.php`, `api/app/Http/Controllers/Api/V1/Admin/TicketController.php` (`reply()`), `LeadController.php` (`note()`), `Store/OrderController.php` (`note()`)
- Test: `api/tests/Feature/MentionsTest.php`

**Interfaces:**
- Consumes: `ScreenAccess::can`, `Notifications::later` (Task 1).
- Produces:
  - `Mentions::resolve(string $body, array $ids, string $path, User $author): Collection<int, User>` — at most 10.
  - `Mentions::notify(Collection $people, StaffNotificationKind $kind, string $line, string $path, ?Model $subject, User $author): void`
  - `Mentions::candidates(string $q, string $path): list<array{id:int,name:string}>`
  - `NoteKinds::aliases(): list<string>` (= `Revisions::aliases()`), `NoteKinds::find(string $alias, int $id): ?Model`, `NoteKinds::title(Model $m): string`, `NoteKinds::adminPath(string $alias, Model $m): string`, `NoteKinds::indexPath(string $alias): string`
  - `GET /admin/mentionable?scope=&q=` → `{data: [{id, name}]}`

- [ ] **Step 1: Write the failing tests**

`api/tests/Feature/MentionsTest.php` (helpers as before, plus the ticket/lead/order fixtures from Task 3's tests; `Notification::fake()` in `setUp()`):

```php
public function test_the_picker_lists_only_people_who_can_open_the_scope(): void
{
    $this->staff(RoleEnum::SupportEngineer, 'Asha');
    $this->staff(RoleEnum::ContentManager, 'Ashok');
    $this->staff(RoleEnum::Admin, 'Ashwin');

    $names = $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/mentionable?scope=ticket&q=Ash')
        ->assertOk()->json('data.*.name');

    $this->assertContains('Support_engineer Asha', $names);   // staff() names users "<Role> <tag>" — match that
    $this->assertContains('Admin Ashwin', $names);
    $this->assertNotContains('Content_manager Ashok', $names);
}

public function test_an_unknown_scope_is_a_422(): void
{
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/mentionable?scope=planet&q=a')->assertStatus(422);
}

public function test_an_internal_ticket_note_notifies_and_a_customer_reply_never_does(): void
{
    $priya = $this->staff(RoleEnum::SupportEngineer, 'priya');
    $ticket = $this->ticket();
    $body = 'Can you take this, @'.$priya->name.'?';

    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => false, 'mentions' => [$priya->id]])->assertCreated();
    $this->assertSame(0, StaffNotification::count());

    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => true, 'mentions' => [$priya->id]])->assertCreated();
    $row = StaffNotification::sole();
    $this->assertSame('mention_ticket', $row->kind->value);
    $this->assertStringNotContainsString('Can you take this', $row->line);
    $this->assertSame("/admin/tickets/{$ticket->reference}", $row->path);
}

public function test_a_name_removed_from_the_text_the_author_and_bad_ids_are_dropped_not_refused(): void
{
    $priya = $this->staff(RoleEnum::SupportEngineer, 'priya');
    $ravi = $this->staff(RoleEnum::SupportEngineer, 'ravi');
    $me = $this->staff(RoleEnum::SupportEngineer, 'me');
    $ticket = $this->ticket();

    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", [
        'body' => "Over to @{$ravi->name} and @{$me->name}",
        'is_internal' => true,
        'mentions' => [$priya->id, $ravi->id, $ravi->id, $me->id, 999999, 'x', -3],
    ])->assertCreated();

    $this->assertSame([$ravi->id], StaffNotification::pluck('user_id')->all());
}

public function test_a_person_who_cannot_open_the_screen_is_not_mentioned(): void
{
    $sales = $this->staff(RoleEnum::SalesManager, 'sam');
    $ticket = $this->ticket();
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => "@{$sales->name} fyi", 'is_internal' => true, 'mentions' => [$sales->id]])->assertCreated();
    $this->assertSame(0, StaffNotification::count());
    Notification::assertNothingSent();
}

public function test_at_most_ten_people_are_told(): void
{
    $ids = [];
    $body = 'All of you:';
    foreach (range(1, 12) as $i) {
        $u = $this->staff(RoleEnum::SupportEngineer, "p{$i}");
        $ids[] = $u->id;
        $body .= " @{$u->name}";
    }
    $ticket = $this->ticket();
    $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => true, 'mentions' => $ids])->assertCreated();
    $this->assertSame(10, StaffNotification::count());
}

public function test_lead_and_order_notes_notify(): void
{
    $sales = $this->staff(RoleEnum::SalesManager, 'sam');
    $lead = $this->lead();
    $this->asStaff(RoleEnum::SalesManager, 'me')->postJson("/api/v1/admin/leads/{$lead->id}/notes", ['body' => "@{$sales->name} call them", 'mentions' => [$sales->id]])->assertCreated();
    $this->assertDatabaseHas('staff_notifications', ['user_id' => $sales->id, 'kind' => 'mention_lead', 'path' => "/admin/leads/{$lead->id}"]);

    $store = $this->staff(RoleEnum::StoreManager, 'sto');
    $order = $this->order(); // copy the minimal Order::create from tests/Feature/StoreOrderAdminTest.php
    $this->asStaff(RoleEnum::StoreManager, 'me')->postJson("/api/v1/admin/store/orders/{$order->order_number}/notes", ['body' => "@{$store->name} check stock", 'mentions' => [$store->id]])->assertSuccessful();
    $this->assertDatabaseHas('staff_notifications', ['user_id' => $store->id, 'kind' => 'mention_order', 'path' => "/admin/store/orders/{$order->order_number}"]);
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=MentionsTest`
Expected: FAIL (404 on `mentionable`, no rows on notes).

- [ ] **Step 3: Write `NoteKinds`, `Mentions` and the controller**

`api/app/Support/Notifications/NoteKinds.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Models\Entry;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * The records a team note can hang off — the 14 kinds page history knows,
 * read from `Revisions`, never a second list. Their console addresses live
 * here because no other class names them.
 */
final class NoteKinds
{
    private const PATHS = [
        'page' => '/admin/pages',
        'saved_section' => '/admin/pages/library',
        'blog_post' => '/admin/blog',
        'knowledge_article' => '/admin/knowledge-base',
        'case_study' => '/admin/case-studies',
        'solution' => '/admin/solutions',
        'service' => '/admin/services',
        'product' => '/admin/products',
        'store_product' => '/admin/store/products',
        'event' => '/admin/events',
        'tender' => '/admin/tenders',
        'job_opening' => '/admin/jobs',
        'entry' => '/admin/content',
        'landing_page' => '/admin/landing-pages',
    ];

    /** @return list<string> */
    public static function aliases(): array
    {
        return Revisions::aliases();
    }

    public static function find(string $alias, int $id): ?Model
    {
        $class = in_array($alias, self::aliases(), true) ? Relation::getMorphedModel($alias) : null;

        return $class === null ? null : $class::query()->find($id);
    }

    public static function title(Model $m): string
    {
        return (string) ($m->getAttribute('title') ?? $m->getAttribute('name') ?? '#'.$m->getKey());
    }

    public static function adminPath(string $alias, Model $m): string
    {
        return $m instanceof Entry ? $m->adminPath() : self::PATHS[$alias].'/'.$m->getKey();
    }

    public static function indexPath(string $alias): string
    {
        return self::PATHS[$alias];
    }
}
```

Add a unit assertion in `MentionsTest`: `$this->assertEqualsCanonicalizing(Revisions::aliases(), array_keys((new \ReflectionClassConstant(NoteKinds::class, 'PATHS'))->getValue()));` — a kind added to `Revisions` without a path fails by name.

`api/app/Support/Notifications/Mentions.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Who a note mentions (C2). The server decides: an id is honoured only while
 * "@Their Name" is still in the saved text, the person is active, can open the
 * screen and is not the author. At most ten. Nothing here ever refuses a note.
 */
final class Mentions
{
    public const MAX = 10;

    /** @return Collection<int, User> */
    public static function resolve(string $body, mixed $ids, string $path, User $author): Collection
    {
        try {
            $ids = collect(is_array($ids) ? array_slice($ids, 0, 50) : [])
                ->filter(fn ($id) => is_int($id) || (is_string($id) && ctype_digit($id)))
                ->map(fn ($id) => (int) $id)->filter(fn (int $id) => $id > 0 && $id !== $author->id)
                ->unique()->values();
            if ($ids->isEmpty()) {
                return collect();
            }

            return User::query()->whereIn('id', $ids->all())->where('is_active', true)->with('roles')->get()
                ->filter(fn (User $u) => mb_stripos($body, '@'.$u->name) !== false && ScreenAccess::can($u, $path))
                ->take(self::MAX)->values();
        } catch (Throwable $e) {
            Log::warning('Mentions could not be read', ['error' => $e->getMessage()]);

            return collect();
        }
    }

    /** @param Collection<int, User> $people */
    public static function notify(Collection $people, StaffNotificationKind $kind, string $line, string $path, ?Model $subject, User $author): void
    {
        foreach ($people as $person) {
            Notifications::later($person, $kind, $line, $path, $subject, $author);
        }
    }

    /** @return list<array{id: int, name: string}> */
    public static function candidates(string $q, string $path): array
    {
        $like = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)).'%';

        return User::query()->where('is_active', true)
            ->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('name', 'like', '% '.$like)->orWhere('email', 'like', $like))
            ->with('roles')->orderBy('name')->limit(50)->get()
            ->filter(fn (User $u) => ScreenAccess::can($u, $path))
            ->take(8)->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values()->all();
    }
}
```

(The `orderBy('name')` and `limit(50)` keep the scan bounded; `DB` import only if used.)

`api/app/Http/Controllers/Api/V1/Admin/MentionableController.php`:

```php
public function __invoke(Request $request): JsonResponse
{
    $data = $request->validate(['scope' => ['required', 'string', 'max:40'], 'q' => ['nullable', 'string', 'max:60']]);
    $path = match ($data['scope']) {
        'ticket' => '/admin/tickets',
        'lead' => '/admin/leads',
        'order' => '/admin/store/orders',
        default => in_array($data['scope'], NoteKinds::aliases(), true) ? NoteKinds::indexPath($data['scope']) : null,
    };
    if ($path === null) {
        return response()->json(['message' => 'Unknown scope.', 'errors' => ['scope' => ['Unknown scope.']]], 422);
    }

    return response()->json(['data' => Mentions::candidates((string) ($data['q'] ?? ''), $path)]);
}
```

Route in `admin-auth.php`: `Route::get('mentionable', MentionableController::class)->middleware('throttle:60,1')->name('mentionable');`

Wire the three threads (raw input, never validated):

`TicketController::reply()` — after the message is created, inside `if ($isInternal)`:

```php
$actor = $request->user();
$people = Mentions::resolve((string) $request->input('body'), $request->input('mentions'), "/admin/tickets/{$ticket->reference}", $actor);
Mentions::notify($people, StaffNotificationKind::MentionTicket, "{$actor->name} mentioned you on ticket {$ticket->reference}.", "/admin/tickets/{$ticket->reference}", $ticket, $actor);
```

`LeadController::note()` — after `trail()`:

```php
$people = Mentions::resolve($data['body'], $request->input('mentions'), "/admin/leads/{$lead->id}", $actor);
Mentions::notify($people, StaffNotificationKind::MentionLead, "{$actor->name} mentioned you on lead #{$lead->id}.", "/admin/leads/{$lead->id}", $lead, $actor);
```

`OrderController::note()` — after the note is created:

```php
$people = Mentions::resolve($data['body'], $request->input('mentions'), "/admin/store/orders/{$order->order_number}", $actor);
Mentions::notify($people, StaffNotificationKind::MentionOrder, "{$actor->name} mentioned you on order {$order->order_number}.", "/admin/store/orders/{$order->order_number}", $order, $actor);
```

(Use the variable names those methods already have for the validated body and the actor; check `Order`'s number attribute name.)

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="MentionsTest|AdminTicketTest|LeadsTest|StoreOrder"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Notifications/Mentions.php api/app/Support/Notifications/NoteKinds.php api/app/Http/Controllers/Api/V1/Admin/MentionableController.php api/routes/api/admin-auth.php api/app/Http/Controllers/Api/V1/Admin/TicketController.php api/app/Http/Controllers/Api/V1/Admin/LeadController.php api/app/Http/Controllers/Api/V1/Admin/Store/OrderController.php api/tests/Feature/MentionsTest.php
git commit -m "Mentions: the picker's list and mentions in ticket, lead and order notes"
```

---

### Task 5: Team notes on records

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/RecordNoteController.php`
- Modify: `api/routes/api/admin-revisions.php`, `api/app/Providers/AppServiceProvider.php`
- Test: `api/tests/Feature/RecordNotesTest.php`

**Interfaces:**
- Consumes: `NoteKinds`, `Mentions` (Task 4), `RecordNote` (Task 1), `Revisions::allows(User, string)`.
- Produces: `GET /admin/record-notes?type=&id=` → `{data: [{id, author_name, body, mentioned: [{id,name}], created_at, can_delete}]}`; `POST /admin/record-notes` `{type, id, body, mentions[]}` → 201 `{data: note}`; `DELETE /admin/record-notes/{id}` → 204.

- [ ] **Step 1: Write the failing tests**

```php
public function test_the_owning_role_writes_and_reads_a_note_and_a_mention_is_told(): void
{
    $page = Page::create(['title' => 'Notes page', 'slug' => 'notes-page', 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    $ravi = $this->staff(RoleEnum::ContentManager, 'ravi');

    $note = $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => "@{$ravi->name} can you check the hero?", 'mentions' => [$ravi->id]])
        ->assertCreated()->assertJsonPath('data.mentioned.0.id', $ravi->id)->assertJsonPath('data.can_delete', true)->json('data');

    $this->asStaff(RoleEnum::ContentManager, 'ravi')->getJson("/api/v1/admin/record-notes?type=page&id={$page->id}")
        ->assertOk()->assertJsonPath('data.0.id', $note['id'])->assertJsonPath('data.0.can_delete', false);

    $this->assertDatabaseHas('staff_notifications', ['user_id' => $ravi->id, 'kind' => 'mention_note', 'path' => "/admin/pages/{$page->id}", 'line' => 'Content_manager me mentioned you in a note on Notes page.']);
}

public function test_a_role_that_does_not_own_the_kind_is_refused(): void
{
    $product = StoreProduct::create([/* minimum columns from StoreCatalogueTest */]);
    $this->asStaff(RoleEnum::ContentManager, 'me')->getJson("/api/v1/admin/record-notes?type=store_product&id={$product->id}")->assertForbidden();
    $this->asStaff(RoleEnum::StoreManager, 'sm')->getJson("/api/v1/admin/record-notes?type=store_product&id={$product->id}")->assertOk();

    $landing = LandingPage::create([/* minimum columns from LandingPageTest */]);
    $this->asStaff(RoleEnum::StoreManager, 'sm')->postJson('/api/v1/admin/record-notes', ['type' => 'landing_page', 'id' => $landing->id, 'body' => 'x'])->assertForbidden();
    $this->asStaff(RoleEnum::SeoManager, 'seo')->postJson('/api/v1/admin/record-notes', ['type' => 'landing_page', 'id' => $landing->id, 'body' => 'x'])->assertCreated();
}

public function test_a_note_on_a_record_that_has_gone_is_a_404_and_a_bad_body_is_a_422(): void
{
    $this->asStaff(RoleEnum::ContentManager, 'me')->getJson('/api/v1/admin/record-notes?type=page&id=999999')->assertNotFound();
    $page = Page::create(['title' => 'P', 'slug' => 'p-422', 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => str_repeat('a', 2001)])->assertJsonValidationErrors('body');
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'planet', 'id' => 1, 'body' => 'x'])->assertJsonValidationErrors('type');
}

public function test_only_the_author_or_an_administrator_deletes(): void
{
    $page = Page::create(['title' => 'P', 'slug' => 'p-del', 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    $id = $this->asStaff(RoleEnum::ContentManager, 'author')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => 'mine'])->json('data.id');

    $this->asStaff(RoleEnum::ContentManager, 'other')->deleteJson("/api/v1/admin/record-notes/{$id}")->assertForbidden();
    $this->asStaff(RoleEnum::Admin, 'adm')->deleteJson("/api/v1/admin/record-notes/{$id}")->assertNoContent();
}

public function test_notes_go_with_their_record(): void
{
    $page = Page::create(['title' => 'P', 'slug' => 'p-gone', 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => 'bye'])->assertCreated();
    $page->delete();
    $this->assertSame(0, RecordNote::count());
}

public function test_the_body_is_stored_as_typed(): void
{
    $page = Page::create(['title' => 'P', 'slug' => 'p-raw', 'body' => '<p>x</p>', 'template' => 'default', 'status' => 'draft']);
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/record-notes', ['type' => 'page', 'id' => $page->id, 'body' => '<b>hi</b> & bye'])
        ->assertJsonPath('data.body', '<b>hi</b> & bye');
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=RecordNotesTest`
Expected: FAIL (404 routes).

- [ ] **Step 3: Write the controller, routes and listeners**

`api/app/Http/Controllers/Api/V1/Admin/RecordNoteController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\StaffNotificationKind;
use App\Http\Controllers\Controller;
use App\Models\RecordNote;
use App\Models\User;
use App\Support\Notifications\Mentions;
use App\Support\Notifications\NoteKinds;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** Team notes on the 14 content kinds (C2). Narrowed per kind to its owning role, the `/admin/revisions` rule. */
class RecordNoteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        [$alias, $record] = $this->subject($request, $request->query());

        $notes = RecordNote::query()->where('subject_type', $alias)->where('subject_id', $record->getKey())->orderBy('id')->get();

        return response()->json(['data' => $this->rows($notes, $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(NoteKinds::aliases())],
            'id' => ['required', 'integer'],
            'body' => ['required', 'string', 'max:2000'],
        ]);
        [$alias, $record] = $this->subject($request, $data);
        /** @var User $author */
        $author = $request->user();
        $path = NoteKinds::adminPath($alias, $record);
        $people = Mentions::resolve($data['body'], $request->input('mentions'), $path, $author);

        $note = RecordNote::create([
            'subject_type' => $alias,
            'subject_id' => $record->getKey(),
            'user_id' => $author->id,
            'author_name' => $author->name,
            'body' => $data['body'],
            'mentions' => $people->pluck('id')->all(),
        ]);
        Mentions::notify($people, StaffNotificationKind::MentionNote, "{$author->name} mentioned you in a note on ".NoteKinds::title($record).'.', $path, $record, $author);

        return response()->json(['data' => $this->rows(collect([$note]), $author)[0]], 201);
    }

    public function destroy(Request $request, int $id): Response
    {
        $note = RecordNote::query()->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $note->subject_type), 403, 'You do not have permission to perform this action.');
        abort_unless($user->isAdmin() || $note->user_id === $user->id, 403, 'Only the person who wrote a note, or an administrator, can delete it.');
        $note->delete();

        return response()->noContent();
    }

    /** @param array<string, mixed> $input @return array{0: string, 1: Model} */
    private function subject(Request $request, array $input): array
    {
        $alias = (string) ($input['type'] ?? '');
        if (! in_array($alias, NoteKinds::aliases(), true)) {
            abort(response()->json(['message' => 'Unknown type.', 'errors' => ['type' => ['Unknown type.']]], 422));
        }
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $alias), 403, 'You do not have permission to perform this action.');
        $record = NoteKinds::find($alias, (int) ($input['id'] ?? 0));
        abort_if($record === null, 404);

        return [$alias, $record];
    }

    /** @param iterable<RecordNote> $notes @return list<array<string, mixed>> */
    private function rows(iterable $notes, User $viewer): array
    {
        $notes = collect($notes);
        $names = User::query()->whereIn('id', $notes->pluck('mentions')->flatten()->unique()->all())->pluck('name', 'id');

        return $notes->map(fn (RecordNote $n) => [
            'id' => $n->id,
            'author_name' => $n->author_name,
            'body' => $n->body,
            'mentioned' => collect($n->mentions ?? [])->filter(fn ($id) => $names->has($id))->map(fn ($id) => ['id' => (int) $id, 'name' => $names[$id]])->values()->all(),
            'created_at' => $n->created_at?->toIso8601String(),
            'can_delete' => $viewer->isAdmin() || $n->user_id === $viewer->id,
        ])->values()->all();
    }
}
```

In `routes/api/admin-revisions.php`, inside the existing `role:content_manager,store_manager,seo_manager` group:

```php
Route::get('record-notes', [RecordNoteController::class, 'index'])->name('record-notes.index');
Route::post('record-notes', [RecordNoteController::class, 'store'])->middleware('throttle:20,1')->name('record-notes.store');
Route::delete('record-notes/{id}', [RecordNoteController::class, 'destroy'])->whereNumber('id')->name('record-notes.destroy');
```

In `AppServiceProvider`: add `'record_note' => RecordNote::class` to the morph map, and beside the health listeners:

```php
foreach (NoteKinds::aliases() as $alias) {
    $class = Relation::getMorphedModel($alias);
    $class::deleted(function ($model) use ($alias) {
        try {
            RecordNote::query()->where('subject_type', $alias)->where('subject_id', $model->getKey())->delete();
            EditPresence::query()->where('subject_type', $alias)->where('subject_id', $model->getKey())->delete();
        } catch (\Throwable $e) {
            Log::warning('Team notes: could not delete with the record', ['type' => $alias, 'error' => $e->getMessage()]);
        }
    });
}
```

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="RecordNotesTest|ContentRevisionTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/RecordNoteController.php api/routes/api/admin-revisions.php api/app/Providers/AppServiceProvider.php api/tests/Feature/RecordNotesTest.php
git commit -m "Team notes: a thread on every record with page history"
```

---

### Task 6: Presence, the stale-save guard, and nothing else moving `updated_at`

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/PresenceController.php`, `api/app/Support/Notifications/StaleGuard.php`
- Modify: `api/routes/api/admin-revisions.php`, `api/app/Support/ActivityLogger.php`, `api/app/Http/Controllers/Api/V1/ContentController.php` (`knowledgeArticleHelpful`), `api/app/Http/Resources/Admin/AdminJobOpeningResource.php`, and the 14 update methods:

| alias | controller::update |
|---|---|
| page | `Admin\PageController::update` (line ~300) |
| saved_section | `Admin\SavedSectionController::update` (~66) |
| blog_post | `Admin\BlogPostController::update` (~97) |
| knowledge_article | `Admin\KnowledgeArticleController::update` (~97) |
| case_study | `Admin\CaseStudyController::update` (~81) |
| solution | `Admin\SolutionController::update` (~88) |
| service | `Admin\ServiceController::update` (~111) |
| product | `Admin\ProductController::update` (~101) |
| store_product | `Admin\Store\ProductController::update` (~175) |
| event | `Admin\EventController::update` (~109) |
| tender | `Admin\TenderController::update` (~114) |
| job_opening | `Admin\JobOpeningController::update` (~51) |
| entry | `Admin\EntryController::update` (~108) |
| landing_page | `Admin\LandingPageController::update` (~118) |

- Test: `api/tests/Feature/EditPresenceTest.php`, `api/tests/Feature/StaleSaveTest.php`

**Interfaces:**
- Consumes: `NoteKinds::find`, `EditPresence`, `Revisions::allows`, `ContentRevision`.
- Produces:
  - `POST /admin/presence {type, id, dirty}` → `{data: {others: [{name, dirty, since}], saved: {at, by}}}`; `POST /admin/presence/leave {type, id}` → 204.
  - `StaleGuard::check(Request $request, Model $model): void` — throws a 422 `HttpResponseException` with `{message, errors: {stale: [msg]}, meta: {stale: {at, by}}}`.
  - `StaleGuard::lastSavedBy(Model $model): ?array{id: ?int, name: ?string}`.
  - `ActivityLogger::overwrote(User $user, Model $subject, string $replacedAt, Request $request): void`.

- [ ] **Step 1: Write the failing presence tests**

`api/tests/Feature/EditPresenceTest.php`:

```php
public function test_others_are_listed_never_yourself_and_stale_rows_are_ignored(): void
{
    $page = $this->page();
    $this->asStaff(RoleEnum::ContentManager, 'ravi')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => true])->assertOk();
    $this->asStaff(RoleEnum::ContentManager, 'old')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])->assertOk();
    EditPresence::query()->whereHas('user', fn ($q) => $q->where('name', 'like', '%old'))->update(['last_seen_at' => now()->subSeconds(61)]);

    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])
        ->assertOk()
        ->assertJsonCount(1, 'data.others')
        ->assertJsonPath('data.others.0.name', 'Content_manager ravi')
        ->assertJsonPath('data.others.0.dirty', true);
}

public function test_saved_names_the_newest_versions_author(): void
{
    $page = $this->page();
    $this->asStaff(RoleEnum::ContentManager, 'asha')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Edited by Asha'])->assertOk();

    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])
        ->assertJsonPath('data.saved.by', 'Content_manager asha')
        ->assertJsonPath('data.saved.at', $page->fresh()->updated_at->toIso8601String());
}

public function test_presence_is_narrowed_by_role_and_leave_removes_the_row(): void
{
    $page = $this->page();
    $this->asStaff(RoleEnum::StoreManager, 'sm')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false])->assertForbidden();
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence', ['type' => 'page', 'id' => $page->id, 'dirty' => false]);
    $this->asStaff(RoleEnum::ContentManager, 'me')->postJson('/api/v1/admin/presence/leave', ['type' => 'page', 'id' => $page->id])->assertNoContent();
    $this->assertSame(0, EditPresence::count());
}
```

(`page()` helper as in `ContentRevisionTest`.)

- [ ] **Step 2: Write the failing stale tests**

`api/tests/Feature/StaleSaveTest.php`:

```php
#[DataProvider('kinds')]
public function test_a_save_over_a_newer_one_is_refused_allowed_with_overwrite_and_unchecked_without_a_base(string $kind): void
{
    [$record, $url, $field, $role] = $this->make($kind); // page: PATCH /admin/pages/{id}, 'title', ContentManager;
                                                        // product: /admin/products/{id}, 'name', ContentManager;
                                                        // store_product: /admin/store/products/{id}, 'name', StoreManager
    $base = $record->updated_at->toIso8601String();
    $this->travel(5)->seconds();
    $this->asStaff($role, 'ravi')->patchJson($url, [$field => 'Ravi was here'])->assertOk();

    $this->travel(5)->seconds();
    $this->asStaff($role, 'me')->patchJson($url, [$field => 'Mine', 'base_updated_at' => $base])
        ->assertStatus(422)
        ->assertJsonPath('errors.stale.0', fn (string $m) => str_starts_with($m, ucfirst($role->value).' ravi saved this at '))
        ->assertJsonPath('meta.stale.by', ucfirst($role->value).' ravi');
    $this->assertSame('Ravi was here', $record->fresh()->getAttribute($field));

    $this->asStaff($role, 'me')->patchJson($url, [$field => 'Mine', 'base_updated_at' => $base, 'overwrite' => true])->assertOk();
    $this->assertSame('Mine', $record->fresh()->getAttribute($field));
    $this->assertDatabaseHas('activity_logs', ['action' => 'overwrote']); // check the table name ActivityLogger writes

    $this->asStaff($role, 'me')->patchJson($url, [$field => 'Script'])->assertOk();
}

public static function kinds(): array
{
    return [['page'], ['product'], ['store_product']];
}

public function test_the_callers_own_save_in_another_tab_says_so(): void
{
    $page = $this->page();
    $base = $page->updated_at->toIso8601String();
    $this->travel(5)->seconds();
    $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Tab one'])->assertOk();
    $this->travel(5)->seconds();
    $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'Tab two', 'base_updated_at' => $base])
        ->assertStatus(422)
        ->assertJsonPath('errors.stale.0', fn (string $m) => str_starts_with($m, 'You saved this at ') && str_contains($m, 'in another tab'));
}

public function test_an_unreadable_base_is_not_checked(): void
{
    $page = $this->page();
    $this->asStaff(RoleEnum::ContentManager, 'me')->patchJson("/api/v1/admin/pages/{$page->id}", ['title' => 'x', 'base_updated_at' => 'yesterday-ish'])->assertOk();
}

public function test_system_writes_do_not_move_updated_at(): void
{
    $article = KnowledgeArticle::create([/* minimum published columns from KnowledgeBaseTest */]);
    $before = $article->fresh()->updated_at;
    $this->travel(10)->seconds();

    $this->postJson("/api/v1/knowledge-base/{$article->slug}/helpful")->assertNoContent();
    \App\Jobs\CheckRecordHealth::dispatchSync('knowledge_article', $article->id);
    // add one line per other system writer found in Step 5 below (search indexer, IndexNow, revision recording, …)

    $this->assertEquals($before, $article->fresh()->updated_at);
}
```

- [ ] **Step 3: Run them — they fail**

Run: `php artisan test --filter="EditPresenceTest|StaleSaveTest"`
Expected: FAIL (404 presence; stale saves accepted; helpful vote moves `updated_at`).

- [ ] **Step 4: Write `StaleGuard`, presence and the logger line**

`api/app/Support/Notifications/StaleGuard.php`:

```php
<?php

namespace App\Support\Notifications;

use App\Models\ContentRevision;
use App\Models\User;
use App\Support\ActivityLogger;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Refuses a save that would overwrite somebody's newer one (C2). Only a form
 * that sends `base_updated_at` is checked, so scripts, imports, bulk actions
 * and the AI drafts are untouched. Compared to the second: two saves inside
 * one second are a known gap.
 */
final class StaleGuard
{
    public static function check(Request $request, Model $model): void
    {
        $raw = $request->input('base_updated_at');
        $stored = $model->getAttribute('updated_at');
        if (! is_string($raw) || $raw === '' || ! $stored instanceof Carbon) {
            return;
        }
        try {
            $base = Carbon::parse($raw);
        } catch (Throwable) {
            return;
        }
        if ($stored->getTimestamp() <= $base->getTimestamp()) {
            return;
        }

        /** @var User|null $caller */
        $caller = $request->user();
        if ($request->boolean('overwrite')) {
            if ($caller instanceof User) {
                ActivityLogger::overwrote($caller, $model, $stored->toIso8601String(), $request);
            }

            return;
        }

        $by = self::lastSavedBy($model);
        $at = $stored->copy()->timezone((string) config('app.timezone'));
        $when = $at->isToday() ? $at->format('H:i') : $at->format('j F').' at '.$at->format('H:i');
        $message = $by !== null && $caller !== null && $by['id'] === $caller->id
            ? "You saved this at {$when} in another tab, after you opened it."
            : (($by['name'] ?? null) ?: 'Somebody')." saved this at {$when}, after you opened it.";

        throw new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => ['stale' => [$message]],
            'meta' => ['stale' => ['at' => $stored->toIso8601String(), 'by' => $by['name'] ?? null]],
        ], 422));
    }

    /** @return array{id: ?int, name: ?string}|null */
    public static function lastSavedBy(Model $model): ?array
    {
        $alias = Revisions::aliasFor($model);
        $row = $alias === null ? null : ContentRevision::query()->where('subject_type', $alias)->where('subject_id', $model->getKey())->orderByDesc('id')->first(['user_id', 'actor_name']);

        return $row === null ? null : ['id' => $row->user_id, 'name' => $row->actor_name];
    }
}
```

**Note on folding:** page history folds a save by the same person within five minutes into the previous version, but updates its `actor_name` only for the same person — so "the newest version's author" is correct for the newest save.

`ActivityLogger::overwrote()` — model it on `signIn()`, using the columns `self::write()` already accepts for a subject (read `write()` and `record()` to see the subject columns and the `context` key — copy them, don't guess):

```php
/** A save that knowingly replaced a newer version (C2's stale guard). */
public static function overwrote(User $user, Model $subject, string $replacedAt, Request $request): void
{
    self::write([
        'user_id' => $user->id,
        'actor_name' => $user->name,
        'actor_email' => $user->email,
        'action' => 'overwrote',
        'subject_type' => $subject->getMorphClass(),
        'subject_id' => $subject->getKey(),
        'context' => ['replaced_version_at' => $replacedAt],
    ], $request);
}
```

`api/app/Http/Controllers/Api/V1/Admin/PresenceController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EditPresence;
use App\Models\User;
use App\Support\Notifications\NoteKinds;
use App\Support\Notifications\StaleGuard;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** Who else has an edit screen open (C2). A 20-second beat; a row unseen for 60 seconds does not count. */
class PresenceController extends Controller
{
    private const FRESH_SECONDS = 60;

    public function beat(Request $request): JsonResponse
    {
        [$alias, $record, $user] = $this->subject($request);

        $row = EditPresence::query()->firstOrNew(['user_id' => $user->id, 'subject_type' => $alias, 'subject_id' => $record->getKey()]);
        if ($row->last_seen_at === null || $row->last_seen_at->lt(now()->subSeconds(self::FRESH_SECONDS))) {
            $row->opened_at = now();
        }
        $row->dirty = $request->boolean('dirty');
        $row->last_seen_at = now();
        $row->save();

        $others = EditPresence::query()->with('user:id,name')
            ->where('subject_type', $alias)->where('subject_id', $record->getKey())
            ->where('user_id', '!=', $user->id)->where('last_seen_at', '>=', now()->subSeconds(self::FRESH_SECONDS))
            ->orderBy('opened_at')->get()
            ->map(fn (EditPresence $p) => ['name' => $p->user?->name, 'dirty' => $p->dirty, 'since' => $p->opened_at?->toIso8601String()])
            ->filter(fn (array $p) => $p['name'] !== null)->values();

        $saved = $record->getAttribute('updated_at');

        return response()->json(['data' => [
            'others' => $others,
            'saved' => ['at' => $saved?->toIso8601String(), 'by' => StaleGuard::lastSavedBy($record)['name'] ?? null],
        ]]);
    }

    public function leave(Request $request): Response
    {
        [$alias, $record, $user] = $this->subject($request);
        EditPresence::query()->where('user_id', $user->id)->where('subject_type', $alias)->where('subject_id', $record->getKey())->delete();

        return response()->noContent();
    }

    /** @return array{0: string, 1: Model, 2: User} */
    private function subject(Request $request): array
    {
        $data = $request->validate(['type' => ['required', 'string', Rule::in(NoteKinds::aliases())], 'id' => ['required', 'integer']]);
        /** @var User $user */
        $user = $request->user();
        abort_unless(Revisions::allows($user, $data['type']), 403, 'You do not have permission to perform this action.');
        $record = NoteKinds::find($data['type'], (int) $data['id']);
        abort_if($record === null, 404);

        return [$data['type'], $record, $user];
    }
}
```

Routes, in the `admin-revisions.php` role group:

```php
Route::post('presence', [PresenceController::class, 'beat'])->middleware('throttle:12,1')->name('presence.beat');
Route::post('presence/leave', [PresenceController::class, 'leave'])->middleware('throttle:30,1')->name('presence.leave');
```

Add `StaleGuard::check($request, $<model>);` as the **first line** of each of the 14 update methods in the table above (before any `DB::transaction`). `AdminJobOpeningResource`: add `'updated_at' => $this->updated_at?->toIso8601String(),`.

- [ ] **Step 5: Take system writes off `updated_at`**

`ContentController::knowledgeArticleHelpful()` becomes:

```php
$id = KnowledgeArticle::published()->where('slug', $article)->value('id');
if ($id !== null) {
    // Off the timestamp: a vote is not an edit, and the stale-save guard reads updated_at (C2).
    DB::table('knowledge_articles')->where('id', $id)->increment('helpful_count');
}

return response()->noContent();
```

Then audit every other system writer named by the spec. For each, open it and answer "does it call `save()`/`update()`/`touch()`/`increment()` on a model of one of the 14 kinds?":

```bash
cd api
grep -rn "->touch()\|->increment(\|->decrement(\|saveQuietly\|->save()\|->update(\[" app/Support/Health app/Jobs/CheckRecordHealth.php app/Support/Search app/Jobs/IndexSearch*.php app/Support/Store/ReviewSummary.php app/Support/Store/SpecIndex.php app/Support/Store/StockLedger.php app/Support/Store/Tags.php app/Support/IndexNow.php app/Jobs/PingIndexNow.php app/Support/Revisions.php
```

For each hit on a watched model (store products are the likeliest: review summary, stock, tags stamping `tags_set_at`, spec index), change it to a query-builder write (`DB::table(...)->where('id', ...)->update([...])` or `$model->newQuery()->whereKey($id)->update([...])` *only if* the model has no `updated_at` side effect — the query builder on the Eloquent builder **does** set `updated_at`; use `DB::table` or `->toBase()->update(...)`), keeping the same columns. For a writer that runs **inside the person's own save** (e.g. `tags_set_at` stamped by the save request), leave it — it is part of that save. Add one line per changed writer to `test_system_writes_do_not_move_updated_at` (a store product for the store-side writers). Record each finding (changed / left, and why) in the commit message body.

- [ ] **Step 6: Run the tests — they pass**

Run: `php artisan test --filter="EditPresenceTest|StaleSaveTest|ContentRevisionTest|KnowledgeBase|StoreCatalogueTest|ReviewsTest|StockLedgerTest|ShopTagsTest"` (use the real test class names `ls api/tests/Feature` shows)
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/PresenceController.php api/app/Support/Notifications/StaleGuard.php api/app/Support/ActivityLogger.php api/routes/api/admin-revisions.php api/app/Http/Controllers api/app/Http/Resources/Admin/AdminJobOpeningResource.php api/app/Support api/app/Jobs api/tests/Feature/EditPresenceTest.php api/tests/Feature/StaleSaveTest.php
git commit -m "Edit awareness: presence, the stale-save guard, and system writes off updated_at"
```

---

### Task 7: The bell in the console

**Files:**
- Create: `web/src/components/admin/notification-bell.tsx`, `web/src/app/api/admin/notifications/route.ts`
- Modify: `web/src/types/notifications.ts`, `web/src/lib/admin/notifications.ts`, `web/src/app/admin/(app)/new-since.tsx`, `web/src/app/api/admin/new-since/route.ts` (type only if typed), `web/src/app/admin/(app)/layout.tsx`, `web/src/components/admin/notifications-panel.tsx`, `web/src/app/admin/(app)/profile/notifications-actions.ts`

**Interfaces:**
- Consumes: the Task 2 API.
- Produces:
  - Types `StaffNotificationRow = { id: number; kind: string; group: "mention" | "assigned" | "alert"; line: string; path: string | null; actor_name: string | null; read_at: string | null; created_at: string | null }`, `StaffNotificationsPage = { data: StaffNotificationRow[]; meta: { current_page: number; last_page: number; per_page: number; total: number; unread: number; kinds: { value: string; label: string; group: string }[] } }`.
  - `useUnreadNotifications(): number | null` from `new-since.tsx`.
  - `<NotificationBell />` (client) and the window event `tw:notifications` that opens it.

- [ ] **Step 1: Extend the poll's store**

In `new-since.tsx`, the store already holds the last `Counts`. Widen `Counts` with `notifications_unread: number | null` (absent → null) and export:

```ts
/** The bell's unread count from the minute poll; null when it could not be read (no number is drawn). */
export function useUnreadNotifications(): number | null {
  const counts = useSyncExternalStore(subscribe, getCounts, getServerCounts); // the store's own getters
  return typeof counts?.notifications_unread === "number" ? counts.notifications_unread : null;
}
```

(Use the store's existing subscribe/snapshot functions; the server snapshot returns null. If the store keeps only unseen differences rather than the raw response, add the raw response beside it.) Also export a `refreshNewSince()` that runs the poll once now, used after "Mark all read".

- [ ] **Step 2: The route handler**

`web/src/app/api/admin/notifications/route.ts` — copy the token and `apiFetch` pattern from `web/src/app/api/admin/new-since/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/admin/_shared"; // the import new-since/route.ts uses
import { isSameOrigin } from "@/lib/same-origin";
import type { StaffNotificationsPage } from "@/types/notifications";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ data: null }, { status: 401 });
  const filter = req.nextUrl.searchParams.get("filter") === "all" ? "all" : "unread";
  try {
    const page = await apiFetch<StaffNotificationsPage>(`/admin/notifications?filter=${filter}`, { token, cache: "no-store" });
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ data: null }, { status: 502 });
  }
}

/** `{id}` marks one read; `{all: true}` marks every one. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: number; all?: boolean };
  try {
    const path = body.all ? "/admin/notifications/read-all" : `/admin/notifications/${Number(body.id)}/read`;
    const out = await apiFetch<unknown>(path, { token, method: "POST", cache: "no-store" });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Could not update." }, { status: 502 });
  }
}
```

(Match `apiFetch`'s real option names and `isSameOrigin`'s real signature — read both files.)

- [ ] **Step 3: The bell and drawer**

`web/src/components/admin/notification-bell.tsx` (client): a button `hidden size-8 … sm:grid` styled exactly like `HelpDrawer`'s "?" button, `aria-label={count ? \`Notifications, ${count} unread\` : "Notifications"}`, the bell glyph from `icons-ui.tsx` (add an `IconBell` there if none, drawn on the `base` stroke 1.7 and measured at 20px), a count badge reusing the sidebar's `NewBadge` look (`9+` cap) drawn **only when `count` is a number > 0**; `window` listener for `tw:notifications` opens it. The drawer is `<Modal open size="side" title="Notifications">` containing:
- two tab buttons, Unread / All (a `role="tablist"` pair; not `components/admin/tabs.tsx`, which is for forms);
- on open and on tab change, `fetch("/api/admin/notifications?filter=…")`; three states — loading (a short skeleton list), error ("We could not load your notifications. Try again." with a Retry button — **never** the empty state), loaded;
- each row a `<button>` with the group's glyph (`mention` → `IconAt`/chat glyph, `assigned` → person glyph, `alert` → warning glyph, all from `icons-ui.tsx`), the `line`, `timeAgo(created_at)` from `lib/dates.ts` (add a `timeAgo` there if absent, en-IN), and an unread dot (`bg-brand-600`, `aria-hidden`, with `sr-only` "Unread"); pressing it POSTs `{id}` then `router.push(path)` and closes; a row with `path === null` only marks read;
- "Mark all read" (Button, `pending` while running) POSTs `{all: true}`, then refetches and calls `refreshNewSince()`;
- an empty loaded list is `<EmptyState compact title={filter === "unread" ? "Nothing unread" : "Nothing yet"} />` with no CTA.

Every sentence on a row is the API's `line`; the drawer's own chrome words are the only literals.

- [ ] **Step 4: Mount it**

In `web/src/app/admin/(app)/layout.tsx`, inside `<TopBar>` between `<Suspense><HelpDrawer/></Suspense>` and `<CopilotDrawer/>`, add `<NotificationBell />`; in the account-menu items add, after "Help for this screen":

```tsx
{ label: "Notifications", href: "#notifications", event: "tw:notifications", phoneOnly: true, icon: <IconBell /> },
```

(The layout imports `IconBell` from `@/components/icons` or `icons-ui` the way it imports the others — it is a server component, so either is fine.)

- [ ] **Step 5: The preference switch**

In `notifications-panel.tsx`, add a `SettingSwitch`-style switch named `notify_mentions` labelled "Mentions and assignments", hint "When a colleague mentions you, or assigns you a ticket, lead or visit, or books a meeting with you.", beside the email/push switches, defaulting from `prefs.notify_mentions ?? true`; in `saveNotificationsAction` read `notify_mentions` the way it reads `alert_email` and send it. Add `notify_mentions: boolean` to the preferences type.

- [ ] **Step 6: Verify**

Run (from `web/`): `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0. With the API and `npm run dev` running and a staff account, open `/admin`: the bell shows no number when the API is stopped (`php artisan serve` killed) and the drawer shows the error state, not "Nothing unread"; with it running, a row created by `php artisan tinker --execute="App\Support\Notifications\Notifications::send(App\Models\User::first(), App\Enums\StaffNotificationKind::TicketAssigned, 'Test row.', '/admin/tickets')"` appears within a minute with a count of 1, opens the tickets list, and the count drops. Check at 360px that the account menu carries "Notifications".

- [ ] **Step 7: Commit**

```bash
git add web/src/components/admin/notification-bell.tsx web/src/app/api/admin/notifications web/src/types/notifications.ts web/src/lib/admin/notifications.ts "web/src/app/admin/(app)/new-since.tsx" "web/src/app/admin/(app)/layout.tsx" web/src/components/admin/notifications-panel.tsx "web/src/app/admin/(app)/profile/notifications-actions.ts" web/src/components/icons-ui.tsx web/src/lib/dates.ts
git commit -m "Console: the notification bell and the mentions switch"
```

---

### Task 8: Mention picker, the three desk threads, team notes in the console

**Files:**
- Create: `web/src/lib/mentions.ts`, `web/scripts/mentions.check.mjs`, `web/src/app/api/admin/mentionable/route.ts`, `web/src/components/admin/mention-field.tsx`, `web/src/lib/admin/record-notes.ts`, `web/src/components/admin/record-notes-panel.tsx`, `web/src/components/admin/record-notes-dialog.tsx`, `web/src/components/admin/record-notes-actions.ts`
- Modify: the ticket reply form, the lead note form, the order note form (find them: `grep -rln "notes\"\|/notes\|is_internal" "web/src/app/admin/(app)/tickets" "web/src/app/admin/(app)/leads" "web/src/app/admin/(app)/store/orders"`), and their actions to forward `mentions`; the 14 `[id]/page.tsx` (Task 9 table) for the Team notes button; `web/src/lib/admin/index.ts` re-export.

**Interfaces:**
- Consumes: `GET /admin/mentionable`, `/admin/record-notes` (Tasks 4–5).
- Produces:
  - `findMentionQuery(text: string, caret: number): { start: number; query: string } | null`, `insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number }`, `mentionSegments(text: string, names: string[]): { text: string; mention: boolean }[]` in `lib/mentions.ts`.
  - `<MentionField name scope rows? label … />` — a textarea plus a hidden `mentions` input holding a JSON list of ids; actions read it with `mentionIds(formData)` (added to `lib/mentions.ts`: parses the JSON, keeps positive integers).
  - `<RecordNotesPanel type id />` (server component).

- [ ] **Step 1: Write the failing check for the pure helpers**

`web/scripts/mentions.check.mjs`:

```js
// node --experimental-strip-types scripts/mentions.check.mjs
// Pins the @-mention text helpers (C2, docs/notifications.md).
import { findMentionQuery, insertMention, mentionSegments, mentionIdsFrom } from "../src/lib/mentions.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };

ok(findMentionQuery("Hi @as", 6)?.query === "as", "an @ at a word start opens the query");
ok(findMentionQuery("mail me@example", 15) === null, "an @ inside a word is an address, not a mention");
ok(findMentionQuery("@", 1)?.query === "", "a bare @ opens an empty query");
ok(findMentionQuery("Hi @as fine", 11) === null, "a space after the query closes it");
const ins = insertMention("Hi @as", 3, 6, "Asha Rao");
ok(ins.text === "Hi @Asha Rao " && ins.caret === 13, "choosing inserts the full name and a space");
const segs = mentionSegments("Ask @Asha Rao and @Nobody", ["Asha Rao"]);
ok(segs.length === 3 && segs[1].mention && segs[1].text === "@Asha Rao" && !segs[2].mention, "only a mentioned person's name is highlighted");
ok(mentionSegments("<b>@Asha Rao</b>", ["Asha Rao"]).map((s) => s.text).join("") === "<b>@Asha Rao</b>", "text is kept as typed");
ok(JSON.stringify(mentionIdsFrom('[3,"4",-1,"x",3]')) === "[3,4]", "ids are positive integers, once");
ok(JSON.stringify(mentionIdsFrom("not json")) === "[]", "a broken value is no ids");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
```

Run: `node --experimental-strip-types scripts/mentions.check.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `src/lib/mentions.ts`.

- [ ] **Step 2: Write `lib/mentions.ts`**

```ts
/*
 * @-mentions in a plain-text note (C2, docs/notifications.md). The note stays
 * text; the server decides who is told. These helpers only find, insert and
 * highlight — and never parse HTML, because nothing here is HTML.
 */

/** The @-query being typed at the caret, or null. An @ must start a word, so an address is not a mention. */
export function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s|[(\[]/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const token = `@${name} `;
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}

/** Splits text into runs, marking `@Name` for the names given (longest first, case-insensitive). */
export function mentionSegments(text: string, names: string[]): { text: string; mention: boolean }[] {
  const wanted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [{ text, mention: false }];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(?:${wanted.map(escape).join("|")})`, "gi");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}

/** The hidden `mentions` value: a JSON list of ids, kept to positive integers, once each. */
export function mentionIdsFrom(raw: unknown): number[] {
  try {
    const list = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  } catch {
    return [];
  }
}
```

Run: `node --experimental-strip-types scripts/mentions.check.mjs`
Expected: `all passed`.

- [ ] **Step 3: The picker**

`web/src/app/api/admin/mentionable/route.ts`: `GET` forwarding `scope` and `q` to `/admin/mentionable` with the token, `no-store`; `{data: []}` on any failure (the picker then simply shows nothing).

`web/src/components/admin/mention-field.tsx` (client): wraps the existing `Textarea` inside a `Field` (same props pass-through: `name`, `label`, `rows`, `required`, `maxLength`, `defaultValue`), and renders `<input type="hidden" name="mentions" value={JSON.stringify(ids)} />`. On `input`/`keyup`/`click`, `findMentionQuery(value, selectionStart)`; when non-null, debounce 150ms and fetch `/api/admin/mentionable?scope=…&q=…`, showing up to 8 results in a listbox under the textarea (reuse the shop search's listbox pattern: `role="listbox"`, `aria-activedescendant`, Arrow keys, Enter/Tab to choose, Escape to close, `popover-motion` class). Choosing calls `insertMention`, sets the textarea's value through the native setter + an `input` event (so `<Form>`, `FormDraft` and React all see it), moves the caret, and adds the id. Ids are cleared when the form fires `reset` (React's reset after a successful submit). The textarea keeps `aria-autocomplete="list"` and `aria-controls` pointing at the listbox.

- [ ] **Step 4: The three desk threads**

Replace the note `Textarea` in the ticket reply form, the lead note form and the order note form with `<MentionField scope="ticket"|"lead"|"order" … />` keeping the field's existing `name` (`body`). In each Server Action that posts the note, add `mentions: mentionIdsFrom(formData.get("mentions"))` to the request body. For the ticket reply, send it always — the API reads it only for an internal note. Their thread display is unchanged (decision 5).

- [ ] **Step 5: Team notes**

`web/src/lib/admin/record-notes.ts` (`server-only`, re-exported from `lib/admin/index.ts`):

```ts
import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { RevisionType } from "@/types/revisions";

export type RecordNote = { id: number; author_name: string | null; body: string; mentioned: { id: number; name: string }[]; created_at: string | null; can_delete: boolean };

export async function getRecordNotes(type: RevisionType, id: number): Promise<RecordNote[] | null> {
  try {
    const out = await apiFetch<{ data: RecordNote[] }>(`/admin/record-notes?type=${type}&id=${id}`, { token: await token(), cache: "no-store" });
    return out.data;
  } catch {
    return null; // 403 for a role that does not own the kind: the button is not drawn
  }
}

export async function postRecordNote(type: RevisionType, id: number, body: string, mentions: number[]): Promise<RecordNote> {
  const out = await apiFetch<{ data: RecordNote }>("/admin/record-notes", { token: await token(), method: "POST", body: { type, id, body, mentions } });
  return out.data;
}

export async function deleteRecordNote(noteId: number): Promise<void> {
  await apiFetch(`/admin/record-notes/${noteId}`, { token: await token(), method: "DELETE" });
}
```

(Match `_shared.ts`'s real token helper name and `apiFetch`'s options.)

`web/src/components/admin/record-notes-actions.ts` (`"use server"`): `postRecordNoteAction(type, id, _prev, formData)` → reads `body` and `mentionIdsFrom(formData.get("mentions"))`, calls `postRecordNote`, returns `{ notes: await getRecordNotes(type, id) ?? [] }` or `{ error, fieldErrors }` on an `ApiError` (422 → field errors, 429 → "You are writing notes too quickly. Wait a minute.", else "We could not save the note. Try again."); `redirect("/admin/login")` outside the `try` on 401. `deleteRecordNoteAction(type, id, noteId)` → returns the new list. No `revalidatePath`: the dialog holds its own list.

`web/src/components/admin/record-notes-panel.tsx` (async server component, `{ type, id, className }`): `const notes = await getRecordNotes(type, id); if (notes === null) return null;` then `<RecordNotesDialog type id initial={notes} />`.

`web/src/components/admin/record-notes-dialog.tsx` (client): a button styled like the History button, reading "Team notes" with the count in parentheses when non-zero (`aria-label="Team notes, 3"`); a `<Modal size="side" title="Team notes">` with the thread oldest first — each note: author, `formatDateTime` from `lib/dates.ts`, the body rendered through `mentionSegments(body, note.mentioned.map((m) => m.name))` as plain text spans with mention runs in `font-semibold text-brand-ink` (escaped by React; `whitespace-pre-wrap [overflow-wrap:anywhere]`), and a Delete text button where `can_delete` (confirm via `window.confirm("Delete this note?")`) — and below it a `<Form action={…} state={state}>` with a `MentionField scope={type} name="body" maxLength={2000} required` and a "Post note" `Button pending`. After a successful post the list updates from the returned notes and the form resets. An empty thread shows `EmptyState compact title="No notes yet" description="Notes are for the team: ask a colleague about this record, or leave context for whoever edits it next."`. Escape closes; nothing here submits the record's form (the dialog renders in the top layer and the panel sits outside `<Form>`).

Place `<RecordNotesPanel type="…" id={…} />` in each of the 14 `[id]/page.tsx`, in the `PageHeader` row's `ml-auto` span **before** `<RevisionPanel …/>` (the table in Task 9 lists the files and `type` values). Never inside the record's `<Form>` or `<Tabs>`.

- [ ] **Step 6: Verify**

Run: `node --experimental-strip-types scripts/mentions.check.mjs` → all passed; `npx tsc --noEmit` → 0; `npm run lint` → 0. In the browser (API + dev server, two staff accounts, both content managers): on `/admin/pages/{id}` the Team notes button opens the drawer; typing `@` and two letters of the colleague's name lists them; choosing inserts the name; posting shows the note with the name highlighted; the colleague's bell shows "… mentioned you in a note on …" within a minute. On a ticket, an internal note with a mention notifies; a public reply with the same text does not.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/mentions.ts web/scripts/mentions.check.mjs web/src/app/api/admin/mentionable web/src/components/admin/mention-field.tsx web/src/lib/admin web/src/components/admin/record-notes-panel.tsx web/src/components/admin/record-notes-dialog.tsx web/src/components/admin/record-notes-actions.ts "web/src/app/admin/(app)"
git commit -m "Console: the mention picker, mentions in desk notes, and team notes on records"
```

---

### Task 9: The presence strip and the stale-save screen

**Files:**
- Create: `web/src/app/api/admin/presence/route.ts`, `web/src/components/admin/edit-presence.tsx`, `web/src/components/admin/stale-alert.tsx`, `web/src/lib/admin/stale.ts`
- Modify: `web/src/components/admin/form-draft.tsx`; the 14 kinds' `[id]/page.tsx`, form and update action:

| type | page | form | update action |
|---|---|---|---|
| page | `pages/[id]/page.tsx` | `pages/page-form.tsx` | `pages/actions.ts` `updatePageAction` |
| saved_section | `pages/library/[id]/page.tsx` | `pages/library/[id]/library-editor.tsx` | `pages/library-actions.ts` `updateLibraryAction` |
| blog_post | `blog/[id]/page.tsx` | `blog/post-form.tsx` | `blog/actions.ts` `updatePostAction` |
| knowledge_article | `knowledge-base/[id]/page.tsx` | `knowledge-base/article-form.tsx` | `knowledge-base/actions.ts` `updateArticleAction` |
| case_study | `case-studies/[id]/page.tsx` | `case-studies/case-study-form.tsx` | `case-studies/actions.ts` `updateCaseStudyAction` |
| solution | `solutions/[id]/page.tsx` | `solutions/solution-form.tsx` | `solutions/actions.ts` `updateSolutionAction` |
| service | `services/[id]/page.tsx` | `services/service-form.tsx` | `services/actions.ts` `updateServiceAction` |
| product | `products/[id]/page.tsx` | `products/product-form.tsx` | `products/actions.ts` `updateProductAction` |
| store_product | `store/products/[id]/page.tsx` | `store/products/store-product-form.tsx` | `store/actions.ts` `updateStoreProductAction` |
| event | `events/[id]/page.tsx` | `events/event-form.tsx` | `events/actions.ts` `updateEventAction` |
| tender | `tenders/[id]/page.tsx` | `tenders/tender-form.tsx` | `tenders/actions.ts` `updateTenderAction` |
| job_opening | `jobs/[id]/page.tsx` | `jobs/job-form.tsx` | `jobs/actions.ts` `updateJobAction` |
| entry | `content/[type]/[id]/page.tsx` | `content/[type]/entry-form.tsx` | `content/[type]/actions.ts` `updateEntryAction` |
| landing_page | `landing-pages/[id]/page.tsx` | `landing-pages/landing-page-form.tsx` | `landing-pages/actions.ts` `updateLandingPageAction` |

(All under `web/src/app/admin/(app)/`.)

**Interfaces:**
- Consumes: `POST /admin/presence`, `/presence/leave`, the 422 `stale` refusal (Task 6); `isAnyFormDirty()` from `form-actions.tsx`.
- Produces: `staleFields(formData: FormData): { base_updated_at?: string; overwrite?: boolean }` and `staleState(error: unknown): { fieldErrors: Record<string, string[]> } | null` in `lib/admin/stale.ts`; `<EditPresence type id base />`; `<StaleAlert message onOverwrite? onLoadNewer? />`; FormDraft listens for `tw:draft-save-now` on its form.

- [ ] **Step 1: FormDraft — save on demand, never keep the base**

In `form-draft.tsx`'s `storable()`, after the `switchOff` line:

```ts
  // The stale-save guard's fields (C2): a restored draft must carry the base the
  // person has now seen, not the one they first loaded, or the save is refused again.
  if (el.name === "base_updated_at" || el.name === "overwrite") return false;
```

In the effect that wires the ten-second timer and `pagehide`, add a listener on the form element for `tw:draft-save-now` that calls the snapshot writer **unconditionally** (even when the internal "typed since last save" flag is false — a refused submit may have cleared it), and remove it in the cleanup.

- [ ] **Step 2: The helpers**

`web/src/lib/admin/stale.ts` (no `server-only`; pure):

```ts
import { ApiError } from "@/lib/api";

/** The stale-save guard's two fields, forwarded by every update action (C2, docs/notifications.md). */
export function staleFields(formData: FormData): { base_updated_at?: string; overwrite?: boolean } {
  const base = formData.get("base_updated_at");
  return {
    ...(typeof base === "string" && base !== "" ? { base_updated_at: base } : {}),
    ...(formData.get("overwrite") === "1" ? { overwrite: true } : {}),
  };
}

/** A 422 that is the stale refusal, as a form state — without the generic "check the fields" alert. */
export function staleState(error: unknown): { fieldErrors: Record<string, string[]> } | null {
  return error instanceof ApiError && error.status === 422 && error.errors?.stale?.length
    ? { fieldErrors: { stale: error.errors.stale } }
    : null;
}
```

(If importing `ApiError` from `@/lib/api` drags server code into a client import graph, keep `stale.ts` imported only by the `"use server"` action files, which it is.)

- [ ] **Step 3: The route handler and the strip**

`web/src/app/api/admin/presence/route.ts`: `POST` only, `isSameOrigin` checked, body `{type, id, dirty, leave?}`; `leave` → `POST /admin/presence/leave` (answers 204), else `POST /admin/presence` → passes the JSON through; any failure → 502 with `{data: null}`. Accept both `application/json` and the `text/plain` body `sendBeacon` sends (parse `await req.text()`).

`web/src/components/admin/edit-presence.tsx` (client, `{ type: RevisionType; id: number; base: string | null }`): on mount and every 20s while `document.visibilityState === "visible"`, POST `{type, id, dirty: isAnyFormDirty()}`; on `visibilitychange` to visible beat at once; on `pagehide` `navigator.sendBeacon("/api/admin/presence", JSON.stringify({type, id, leave: true}))`. Keep the last good answer in state; a failed beat keeps it (never shows "alone" because of a failure). Render nothing when there are no others and no newer save; otherwise a `role="status"` wrapper (mounted always, empty when there is nothing) holding `<Alert tone="info" dismissible={false}>` with:
- others with `dirty`: `"{names} {is|are} also editing this — unsaved changes."` (names joined "Ravi and Asha" / "Ravi, Asha and Sam");
- others without: `"{names} {has|have} this open."` (when mixed, the dirty sentence lists the dirty ones and a second sentence the rest);
- `saved.at` later than `base` (compare `Date.parse`, to the second) and `saved.by` not null: `"{by} saved a newer version at {formatTime(saved.at)}. Reload to see it — your save will ask before overwriting."` (`by` null → "Somebody"); this sentence goes first when present.

Use `lib/dates.ts` for the time (en-IN, `HH:mm`). Mount `<EditPresence type="…" id={record.id} base={record.updated_at ?? null} />` at the top of each of the 14 forms, beside `<FormDraft />` (decision 4) — and only on the edit form (each form knows `editing`/has the record).

- [ ] **Step 4: The stale refusal on the screen**

`web/src/components/admin/stale-alert.tsx` (client):

```tsx
"use client";

import { useRef } from "react";
import { Alert } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * The stale-save refusal (C2). The typing is already back (React's reset is
 * undone by <Form>). "Load" keeps it as a draft first; "Save mine" sends the
 * same form again with overwrite=1.
 */
export function StaleAlert({ message, onOverwrite, onLoadNewer }: { message: string; onOverwrite?: () => void; onLoadNewer?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const form = () => ref.current?.closest("form") ?? null;

  const loadNewer = () => {
    if (onLoadNewer) return onLoadNewer();
    form()?.dispatchEvent(new Event("tw:draft-save-now"));
    window.location.reload();
  };
  const saveMine = () => {
    if (onOverwrite) return onOverwrite();
    const f = form();
    if (!f) return;
    let input = f.querySelector<HTMLInputElement>('input[name="overwrite"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "overwrite";
      f.appendChild(input);
    }
    input.value = "1";
    f.requestSubmit();
  };

  return (
    <div ref={ref}>
      <Alert tone="warn" title="Somebody saved this after you opened it" dismissible={false}>
        <p>{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={loadNewer}>Load the newer version</Button>
          <Button type="button" variant="ghost" size="sm" onClick={saveMine}>Save mine anyway</Button>
        </div>
      </Alert>
    </div>
  );
}
```

(Match `Alert`'s and `Button`'s real import paths and variant/size names.) The leave guard must not fire on the reload: before `window.location.reload()`, the draft is written, and `confirmLeave`/`beforeunload` still asks — accept that one confirmation (the person chose to reload) or, if `form-actions.tsx` exposes a way to mark the form clean, call it first.

For each of the 14 kinds:
1. **The form:** add `<input type="hidden" name="base_updated_at" value={record.updated_at ?? ""} />` next to the `id` hidden input (edit mode only), mount `<EditPresence …/>` (Step 3), and render `{state.fieldErrors?.stale && <StaleAlert message={state.fieldErrors.stale[0]} />}` directly above `<FormActions>`. Check the form's state type has `fieldErrors?: Record<string, string[]>`; where it does not (`tenders`, `jobs` — read them), widen it.
2. **The update action:** spread `...staleFields(formData)` into the payload passed to the `update…` call, and as the first line of its `toState`/error mapper (or the `catch`): `const stale = staleState(error); if (stale) return stale;`.
3. **The page:** `RecordNotesPanel` was added in Task 8; nothing else.

The section library editor (decision 7): it saves through `updateLibraryAction(id, payload)`. Add `base_updated_at` to the payload from the loaded item, forward `overwrite` when asked, map a stale 422 in `updateLibraryAction` to `{ ok: false, stale: message }` (extend `LibraryResult`), and render `<StaleAlert message={stale} onOverwrite={() => save({ overwrite: true })} onLoadNewer={() => window.location.reload()} />` above its `FormActions`. Make sure the `SavedSectionRequest`/controller path ignores `base_updated_at`/`overwrite` as payload fields (they are read only by `StaleGuard`).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → 0; `npm run lint` → 0. Browser, two staff (content managers) in two browsers on one page: each sees "… has this open."; typing in one shows "… is also editing this — unsaved changes." in the other within 20s; saving in A shows "A saved a newer version at …" in B; saving in B shows the warn alert with B's typing intact; "Load the newer version" reloads and the draft banner offers Restore, and after Restore a save **succeeds** (Review Focus 3); "Save mine anyway" saves. Check at 360px that the strip and the alert's buttons wrap without overflow.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/admin/presence web/src/components/admin/edit-presence.tsx web/src/components/admin/stale-alert.tsx web/src/lib/admin/stale.ts web/src/components/admin/form-draft.tsx "web/src/app/admin/(app)"
git commit -m "Console: who else is editing, and the stale-save refusal"
```

---

### Task 10: Mock, probes, audits, docs, manual and the release

**Files:**
- Modify: `web/mock-api.mjs`, `web/scripts/audit.mjs`, `web/scripts/mobile-audit.mjs`, `web/scripts/probes/notifications.mjs`, `web/src/lib/help-routes.ts`, `CLAUDE.md`, `API.md`, `manual/README.md`, `web/src/content/help.json` (regenerated), `VERSION.md`, `web/src/lib/version.ts`
- Create: `web/scripts/probes/edit-awareness.mjs`, `docs/notifications.md`, `manual/37-notifications.md`

**Interfaces:**
- Consumes: every endpoint above.

- [ ] **Step 1: The mock**

In the `/admin/` block of `web/mock-api.mjs`, beside the existing `/admin/notifications/preferences` handlers (declare the literals first):
- `GET /admin/notifications` → `{data: [two rows: one mention, one assigned], meta: {current_page:1,last_page:1,per_page:30,total:2,unread:1,kinds:[…the eleven kinds…]}}` (honour `filter=unread`);
- `POST /admin/notifications/read-all` → `{updated: 1}`; `POST /admin/notifications/{id}/read` → `{data: row}`;
- `GET /admin/new-since` → `{data: {since, tickets: 0, leads: 0, enquiries: 0, notifications_unread: 1}}` (it is not mocked today);
- `GET /admin/mentionable` → `{data: [{id: 1, name: "Asha Rao"}, {id: 2, name: "Ravi Menon"}]}`;
- `GET/POST /admin/record-notes`, `DELETE /admin/record-notes/{id}` → an in-memory list per `type:id`, 201 / 204;
- `POST /admin/presence` → `{data: {others: [], saved: {at: <record's updated_at or now>, by: null}}}`; `POST /admin/presence/leave` → 204;
- add `notify_mentions: true` to the preferences defaults; add `updated_at` to the mock's job opening if missing.

- [ ] **Step 2: The probes and audits**

`web/scripts/probes/edit-awareness.mjs` (docblock: what it measures and how to run; `BASE`; signs in only through `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`, then creates two throwaway content-manager staff through `POST /admin/staff` and deletes them at the end — no credential in the file): two browser contexts on one draft page's edit screen; asserts (1) each shows the "has this open" strip within 25s, (2) after context A saves, context B's save shows the stale alert with B's typed title still in the field, (3) "Load the newer version" reloads and the draft banner appears; after Restore, saving succeeds, (4) re-run with "Save mine anyway" succeeds. Exit non-zero on any failure.

Extend `web/scripts/probes/notifications.mjs`: with the same two throwaway staff, A posts a team note mentioning B on a page; B's bell shows a count within 70s; opening the drawer lists the line; pressing it lands on the page's edit screen and the count drops.

`audit.mjs` and `mobile-audit.mjs`: add, as `PREPARE`/interaction steps where those scripts already open dialogs, the bell drawer on `/admin` (press the bell, audit, Escape) and the team-notes drawer on the first page's edit screen (a `DISCOVER` row already finds a page id). If the audit has no interaction hook, add the two drawers through `?open=` handling only if one exists — otherwise record in the commit that both drawers were audited by hand at 1280 and 360 in light and dark (contrast, overflow, tap targets).

Run (with API + `npm run dev`, credentials set):
- `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin /admin/pages /admin/profile` → exit 0
- `MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin /admin/profile` → exit 0
- `node scripts/probes/edit-awareness.mjs` → exit 0
- `node scripts/probes/notifications.mjs` → exit 0
Expected: all exit 0. (Never pipe them to `tail` when the exit code matters.)

- [ ] **Step 3: Docs, manual, help, version**

- `docs/notifications.md`: the module note — the table and kinds; the writer's five rules; delivery and the two switches; every source and its line; mentions (server decides, at most ten, never a 422, never the note's text in a line); team notes; presence; the stale guard and the `updated_at` audit's findings (what was moved off the timestamp and what was left, and why); decisions 1–8 above; the known gap (one second).
- `CLAUDE.md`: a module block under "Modules" — `### Notifications, mentions and edit awareness — docs/notifications.md`, one line per rule (copy the rule lines from `docs/notifications.md`), and add the module to the Contents list.
- `API.md`: an "Admin — notifications, mentions and edit awareness" section: the bell routes, `new-since`'s new field, `notify_mentions` and `alerts_mentions_enabled`, `mentionable`, record notes, presence, `base_updated_at`/`overwrite` on the 14 update routes and the 422 `stale` shape with `meta.stale`, the `mentions[]` fields on the three note endpoints, the two email templates.
- `manual/37-notifications.md` (the customer's manual, plain words): the bell; mentioning a colleague; team notes; "also editing"; what to do when a save is refused; the Mentions and assignments switch. Add its row to `manual/README.md`. Run `npm run help` from `web/` and commit `src/content/help.json`; add help-routes entries mapping `/admin` (the bell) and each edit screen's team notes to the new section ids, then `node --experimental-strip-types scripts/help-routes.check.mjs` → passes and `node scripts/build-help.mjs --check` → passes.
- `VERSION.md`: a 0.187.0 entry (date 2026-10-21) summarising the release in the file's style; `web/src/lib/version.ts` → `0.187.0`.

- [ ] **Step 4: The whole-suite gate**

Run, from `api/`: `php artisan test > ../.superpowers/c2-suite.txt 2>&1; tail -5 ../.superpowers/c2-suite.txt` → 0 failed; `composer analyse` → "No errors"; `./vendor/bin/pint --test` on the files this release touched → clean.
From `web/`: `npx tsc --noEmit` → 0; `npm run lint` → 0; `node --experimental-strip-types scripts/mentions.check.mjs` and `scripts/entry-tags.check.mjs` → all passed.
Do **not** run `npm run build` while the dev server is running.

- [ ] **Step 5: Commit**

```bash
git add web/mock-api.mjs web/scripts docs/notifications.md manual CLAUDE.md API.md web/src/lib/help-routes.ts web/src/content/help.json VERSION.md web/src/lib/version.ts
git commit -m "0.187.0: the notification bell, mentions, team notes and edit awareness"
```

---

## Self-review notes

- Spec coverage: Part 1 table/kinds/writer/delivery → Task 1; API + new-since + alerts → Task 2; sources table → Task 3; Part 2 picker + resolve + three threads → Task 4; team notes → Task 5 (API) and Task 8 (console); Part 3 presence + guard + `updated_at` audit → Task 6 (API) and Task 9 (console); bell UI → Task 7; testing list → Tasks 1–6 tests, probes and audits → Task 10; release list → Task 10. Deviations are listed under "Decisions taken while planning".
- Types used across tasks: `Notifications::send/later`, `Mentions::resolve(string, mixed, string, User)`, `NoteKinds::find/adminPath/indexPath/title/aliases`, `StaleGuard::check/lastSavedBy`, `staleFields/staleState`, `mentionIdsFrom`, `useUnreadNotifications`, `tw:notifications`, `tw:draft-save-now` — each defined in its producing task with the same name.
