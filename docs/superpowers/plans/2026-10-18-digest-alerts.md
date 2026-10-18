# Digest and alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each staff member gets a scheduled digest of their own copilot figures and immediate alerts (email and browser push) when something they own goes wrong.

**Architecture:** The digest reads `App\Support\Copilot\Questions::for()` and compares with the last digest it sent. Alerts are eight fixed `AlertRule` classes, each naming the records in trouble now. An `alert_fires` table makes every alert fire once per thing and re-arm when it clears. Both run on the scheduler and deliver through the mail queue and the existing FCM provider.

**Tech Stack:** Laravel 13 / PHP 8.3, PHPUnit 12, MySQL 8; Next 16 App Router, TypeScript, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-18-digest-alerts-design.md`

## Global Constraints

- Release `0.185.0`. Work on `altis-cms`; never commit to `main`.
- Never run two `php artisan test` processes at once. Never use the seeded admin for audits or probes; make a throwaway one with inline `php artisan tinker --execute="…"` and delete it afterwards.
- `web/` files are CRLF; `api/` PHP is LF. Never edit with Python `write_text`. The Edit tool keeps line endings.
- **Nothing a model writes appears anywhere.** No AI in this release.
- An alert line names a record by its **reference or id only** — never a customer's name, email, phone or message text. The same goes for a push.
- Push goes only through `App\Support\Messaging\Providers\Fcm`; tests run under `Http::preventStrayRequests()`.
- Staff push is **separate** from `message_contacts`. Removing a browser on the console deletes the server row only and never calls `unsubscribe()` in the browser, because a customer push subscription in the same browser shares the same token.
- An administrator holds every rule. Use `$user->isAdmin() || $user->hasRole($role)`, because `hasRole()` does not pass an admin implicitly.
- Times are in `APP_TIMEZONE` (`Asia/Kolkata`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `./vendor/bin/pint` on changed PHP and `composer analyse` must say "No errors" before each API commit.
- If an API response shape changes, change `web/mock-api.mjs` too.

## Review Focus

1. **Quiet hours that cross midnight** (21:00–08:00): a person at 23:30 and at 07:59 is quiet; at 08:00 they are not. → `AlertSettingsTest::test_quiet_hours_cross_midnight` (Task 1).
2. **An alert that clears and returns**: a ticket unassigned, then assigned, then unassigned again alerts a second time; an alert that never clears never repeats. → `AlertCheckTest::test_a_cleared_alert_fires_again_when_it_returns` (Task 3).
3. **A rule switched off while fires are open**: the fires clear, so switching it back on alerts people about what is still wrong. → `AlertCheckTest::test_switching_a_rule_off_clears_its_open_fires` (Task 3).
4. **A digest sent twice in one hour**: the hourly command running twice in the same hour (a slow scheduler) sends one digest. → `StaffDigestTest::test_once_a_day_even_when_run_twice` (Task 4).
5. **A rule's role from someone who changes role**: a store manager who loses the role stops getting store alerts at the next check, and the open fires do not leak into a batch. → `AlertCheckTest::test_a_person_without_the_role_gets_nothing` (Task 3).

---

### Task 1: Tables, models, settings and preferences

**Files:**
- Create: `api/database/migrations/2026_10_24_100000_create_alert_tables.php`
- Create: `api/app/Models/StaffPreference.php`, `api/app/Models/AlertFire.php`, `api/app/Models/StaffPushSubscription.php`
- Create: `api/app/Support/Alerts/AlertSettings.php`, `api/app/Support/Alerts/StaffPreferences.php`
- Modify: `api/app/Models/User.php` (two relations)
- Modify: `api/database/seeders/SettingsSeeder.php` (the `alerts` group)
- Modify: `api/app/Http/Controllers/Api/V1/Admin/SettingController.php` (refusal chain at ~line 1329; `optionsFor` at ~line 271)
- Test: `api/tests/Feature/AlertSettingsTest.php`

**Interfaces:**
- Produces: `AlertSettings::THRESHOLDS`, `AlertSettings::threshold(string $key): int`, `AlertSettings::enabled(string $rule): bool`, `AlertSettings::defaultDigest(): string`, `AlertSettings::refusalFor(string $key, mixed $value): ?string`, `AlertSettings::DIGESTS`, `AlertSettings::DIGEST_OPTIONS`.
- Produces: `StaffPreferences::for(User $user): StaffPreference` (unsaved, filled from defaults, when none exists).
- Produces: `StaffPreference::wantsAlert(string $rule): bool`, `StaffPreference::quietAt(CarbonInterface $at): bool`.
- Produces: `User::staffPreference(): HasOne`, `User::pushSubscriptions(): HasMany`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\StaffPreference;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\StaffPreferences;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;
use App\Enums\Role as RoleEnum;

class AlertSettingsTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    public function test_thresholds_fall_back_to_their_defaults(): void
    {
        $this->assertSame(30, AlertSettings::threshold('alert_ticket_critical_minutes'));
        Setting::put('alert_ticket_critical_minutes', '45');
        Setting::flushCache();
        $this->assertSame(45, AlertSettings::threshold('alert_ticket_critical_minutes'));
        Setting::put('alert_ticket_critical_minutes', '99999');
        Setting::flushCache();
        $this->assertSame(30, AlertSettings::threshold('alert_ticket_critical_minutes'));
    }

    public function test_a_threshold_out_of_range_is_refused(): void
    {
        $this->assertNull(AlertSettings::refusalFor('alert_lead_hot_hours', '2'));
        $this->assertSame('A whole number from 1 to 168.', AlertSettings::refusalFor('alert_lead_hot_hours', '0'));
        $this->assertSame('A whole number from 1 to 168.', AlertSettings::refusalFor('alert_lead_hot_hours', 'two'));
        $this->assertSame('Choose off, daily or weekly.', AlertSettings::refusalFor('alerts_default_digest', 'hourly'));
        $this->assertNull(AlertSettings::refusalFor('seo_ai_enabled', 'x'));
    }

    public function test_every_rule_is_on_until_switched_off(): void
    {
        $this->assertTrue(AlertSettings::enabled('ticket_overdue'));
        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        $this->assertFalse(AlertSettings::enabled('ticket_overdue'));
    }

    public function test_preferences_start_from_the_defaults_and_are_not_saved(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $prefs = StaffPreferences::for($user);

        $this->assertFalse($prefs->exists);
        $this->assertSame('weekly', $prefs->digest);
        $this->assertSame(8, $prefs->digest_hour);
        $this->assertTrue($prefs->wantsAlert('ticket_overdue'));
        $this->assertSame(0, StaffPreference::count());

        Setting::put('alerts_default_digest', 'daily');
        Setting::flushCache();
        $this->assertSame('daily', StaffPreferences::for($user->fresh())->digest);
    }

    public function test_quiet_hours_cross_midnight(): void
    {
        $prefs = new StaffPreference(['quiet_start' => '21:00', 'quiet_end' => '08:00']);
        $at = fn (string $t) => CarbonImmutable::parse('2026-10-24 '.$t, 'Asia/Kolkata');

        $this->assertTrue($prefs->quietAt($at('23:30')));
        $this->assertTrue($prefs->quietAt($at('07:59')));
        $this->assertFalse($prefs->quietAt($at('08:00')));
        $this->assertFalse($prefs->quietAt($at('20:59')));

        $day = new StaffPreference(['quiet_start' => '13:00', 'quiet_end' => '14:00']);
        $this->assertTrue($day->quietAt($at('13:30')));
        $this->assertFalse($day->quietAt($at('14:00')));

        $none = new StaffPreference(['quiet_start' => '09:00', 'quiet_end' => '09:00']);
        $this->assertFalse($none->quietAt($at('09:00')));
    }

    public function test_a_switched_off_alert_is_not_wanted(): void
    {
        $prefs = new StaffPreference(['alerts' => ['ticket_overdue' => false]]);
        $this->assertFalse($prefs->wantsAlert('ticket_overdue'));
        $this->assertTrue($prefs->wantsAlert('return_waiting'));
    }

    public function test_the_settings_screen_refuses_a_bad_threshold(): void
    {
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'alert_mail_minutes', 'value' => '2']]])
            ->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=AlertSettingsTest`
Expected: FAIL — `Class "App\Support\Alerts\AlertSettings" not found`.

- [ ] **Step 3: The migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Digest and alerts (0.185.0, docs/digest-alerts.md).
 *
 * `alert_fires` keeps one row per (rule, subject, person) for good: firing
 * stamps `fired_at` and clears `cleared_at`, clearing stamps `cleared_at`.
 * MySQL has no partial unique index, so "one open fire" is one row that is
 * re-armed rather than a new row each time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('digest', 10)->default('weekly');
            $table->unsignedTinyInteger('digest_hour')->default(8);
            $table->unsignedTinyInteger('digest_weekday')->default(1);
            $table->boolean('digest_skip_quiet')->default(false);
            $table->json('alerts')->nullable();
            $table->boolean('alert_email')->default(true);
            $table->boolean('alert_push')->default(true);
            $table->string('quiet_start', 5)->default('21:00');
            $table->string('quiet_end', 5)->default('08:00');
            $table->timestamp('last_digest_at')->nullable();
            $table->json('last_digest_figures')->nullable();
            $table->timestamps();
        });

        Schema::create('alert_fires', function (Blueprint $table) {
            $table->id();
            $table->string('rule', 40);
            $table->string('subject', 80);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('fired_at');
            $table->timestamp('cleared_at')->nullable();
            $table->unique(['rule', 'subject', 'user_id']);
            $table->index(['rule', 'cleared_at']);
        });

        Schema::create('staff_push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token', 512)->unique();
            $table->string('label', 80)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_push_subscriptions');
        Schema::dropIfExists('alert_fires');
        Schema::dropIfExists('staff_preferences');
    }
};
```

- [ ] **Step 4: The models**

`api/app/Models/StaffPreference.php`:

```php
<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A staff member's digest and alert choices (0.185.0, docs/digest-alerts.md). */
class StaffPreference extends Model
{
    protected $fillable = [
        'user_id', 'digest', 'digest_hour', 'digest_weekday', 'digest_skip_quiet', 'alerts',
        'alert_email', 'alert_push', 'quiet_start', 'quiet_end', 'last_digest_at', 'last_digest_figures',
    ];

    /** In step with the migration's defaults: an unsaved row reads the same as a saved one. */
    protected $attributes = [
        'digest' => 'weekly', 'digest_hour' => 8, 'digest_weekday' => 1, 'digest_skip_quiet' => false,
        'alert_email' => true, 'alert_push' => true, 'quiet_start' => '21:00', 'quiet_end' => '08:00',
    ];

    protected function casts(): array
    {
        return [
            'digest_hour' => 'integer', 'digest_weekday' => 'integer', 'digest_skip_quiet' => 'boolean',
            'alerts' => 'array', 'alert_email' => 'boolean', 'alert_push' => 'boolean',
            'last_digest_at' => 'datetime', 'last_digest_figures' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** An absent key is on: a rule added later reaches people who never opened the panel. */
    public function wantsAlert(string $rule): bool
    {
        return ($this->alerts[$rule] ?? true) !== false;
    }

    /** Push only. A window may cross midnight; equal ends mean no quiet hours. */
    public function quietAt(CarbonInterface $at): bool
    {
        $start = (string) $this->quiet_start;
        $end = (string) $this->quiet_end;
        if ($start === $end) {
            return false;
        }
        $now = $at->setTimezone(config('app.timezone'))->format('H:i');

        return $start < $end ? ($now >= $start && $now < $end) : ($now >= $start || $now < $end);
    }
}
```

`api/app/Models/AlertFire.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One (rule, subject, person): fired once, re-armed after it clears. */
class AlertFire extends Model
{
    public $timestamps = false;

    protected $fillable = ['rule', 'subject', 'user_id', 'fired_at', 'cleared_at'];

    protected function casts(): array
    {
        return ['fired_at' => 'datetime', 'cleared_at' => 'datetime'];
    }
}
```

`api/app/Models/StaffPushSubscription.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A staff member's browser. Never a `message_contacts` row: an alert is not a broadcast audience. */
class StaffPushSubscription extends Model
{
    protected $fillable = ['user_id', 'token', 'label', 'last_seen_at', 'failed_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime', 'failed_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

In `api/app/Models/User.php`, add the imports `Illuminate\Database\Eloquent\Relations\HasOne` and `HasMany` (if absent), and these methods beside `roles()`:

```php
    /** @return HasOne<StaffPreference, $this> */
    public function staffPreference(): HasOne
    {
        return $this->hasOne(StaffPreference::class);
    }

    /** @return HasMany<StaffPushSubscription, $this> */
    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(StaffPushSubscription::class);
    }
```

- [ ] **Step 5: AlertSettings and StaffPreferences**

`api/app/Support/Alerts/AlertSettings.php`:

```php
<?php

namespace App\Support\Alerts;

use App\Models\Setting;

/**
 * The private `alerts` group (docs/digest-alerts.md): each rule's switch,
 * each threshold, and the digest new staff start with. The one reader, with a
 * per-field fallback, and the write check `SettingController` calls.
 */
final class AlertSettings
{
    /** key => [default, min, max]. */
    public const THRESHOLDS = [
        'alert_ticket_critical_minutes' => [30, 5, 1440],
        'alert_lead_hot_hours' => [2, 1, 168],
        'alert_order_dispatch_days' => [2, 1, 30],
        'alert_return_days' => [2, 1, 30],
        'alert_mail_minutes' => [10, 5, 1440],
        'alert_health_points' => [10, 1, 100],
    ];

    public const DIGESTS = ['off', 'daily', 'weekly'];

    public const DIGEST_OPTIONS = [
        ['value' => 'weekly', 'label' => 'Weekly', 'description' => 'Once a week, on Monday at 8 am.'],
        ['value' => 'daily', 'label' => 'Daily', 'description' => 'Every morning at 8 am.'],
        ['value' => 'off', 'label' => 'Off', 'description' => 'No digest until somebody chooses one.'],
    ];

    public static function threshold(string $key): int
    {
        [$default, $min, $max] = self::THRESHOLDS[$key];
        $value = Setting::get($key);

        return is_numeric($value) && (int) $value >= $min && (int) $value <= $max ? (int) $value : $default;
    }

    /** A boolean row: true/false, or null when unseeded (on). */
    public static function enabled(string $rule): bool
    {
        return Setting::get('alert_'.$rule.'_enabled') !== false;
    }

    public static function defaultDigest(): string
    {
        $value = Setting::get('alerts_default_digest');

        return in_array($value, self::DIGESTS, true) ? $value : 'weekly';
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if ($key === 'alerts_default_digest') {
            return in_array($value, self::DIGESTS, true) ? null : 'Choose off, daily or weekly.';
        }
        if (! isset(self::THRESHOLDS[$key])) {
            return null;
        }
        [, $min, $max] = self::THRESHOLDS[$key];
        $text = is_scalar($value) ? trim((string) $value) : '';

        return ctype_digit($text) && (int) $text >= $min && (int) $text <= $max
            ? null : "A whole number from {$min} to {$max}.";
    }
}
```

`api/app/Support/Alerts/StaffPreferences.php`:

```php
<?php

namespace App\Support\Alerts;

use App\Models\StaffPreference;
use App\Models\User;

/** The one reader of a staff member's choices: the saved row, or the defaults unsaved. */
final class StaffPreferences
{
    public static function for(User $user): StaffPreference
    {
        $saved = $user->relationLoaded('staffPreference') ? $user->staffPreference : $user->staffPreference()->first();

        return $saved ?? new StaffPreference(['user_id' => $user->id, 'digest' => AlertSettings::defaultDigest()]);
    }
}
```

- [ ] **Step 6: Seed the group and wire the refusal and options**

In `SettingsSeeder.php`, after the `health` rows, add:

```php
            /*
             * Digest and alerts (0.185.0, docs/digest-alerts.md): each rule's
             * switch and threshold, and the digest new staff start with. Private.
             */
            ['group' => 'alerts', 'key' => 'alerts_default_digest', 'value' => 'weekly', 'type' => 'string'],
            ...array_map(
                fn (string $rule) => ['group' => 'alerts', 'key' => 'alert_'.$rule.'_enabled', 'value' => '1', 'type' => 'boolean'],
                ['ticket_critical_unassigned', 'ticket_overdue', 'lead_hot_untouched', 'order_not_dispatched',
                    'return_waiting', 'mail_stalled', 'backup_failed', 'health_drop'],
            ),
            ...array_map(
                fn (string $key, array $spec) => ['group' => 'alerts', 'key' => $key, 'value' => (string) $spec[0], 'type' => 'string'],
                array_keys(AlertSettings::THRESHOLDS),
                AlertSettings::THRESHOLDS,
            ),
```

(Add `use App\Support\Alerts\AlertSettings;` at the top.)

In `SettingController.php`, extend the refusal chain (~line 1329), so the last line becomes:

```php
                ?? ImageSettings::refusalFor($key, $row['value'] ?? null)
                ?? AlertSettings::refusalFor($key, $row['value'] ?? null);
```

In `optionsFor()` (~line 271) add the arm `'alerts_default_digest' => AlertSettings::DIGEST_OPTIONS,` beside `'social_style'`. Import `App\Support\Alerts\AlertSettings`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `php artisan test --filter=AlertSettingsTest`
Expected: PASS (7 tests).

Also run `php artisan test --filter=SettingsScreensTest`. It is expected to FAIL now on the new `alerts` group, which no console screen draws yet. Task 6 adds it, so note the failure in the report and do not fix it here.

- [ ] **Step 8: Commit**

```bash
./vendor/bin/pint app database tests
composer analyse
git add api/database/migrations/2026_10_24_100000_create_alert_tables.php api/app/Models/StaffPreference.php api/app/Models/AlertFire.php api/app/Models/StaffPushSubscription.php api/app/Models/User.php api/app/Support/Alerts api/database/seeders/SettingsSeeder.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/tests/Feature/AlertSettingsTest.php
git commit -m "Digest and alerts: tables, preferences and the alerts settings group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The eight alert rules

**Files:**
- Create: `api/app/Support/Alerts/AlertRule.php`, `AlertHit.php`, `Rules.php`
- Create: `api/app/Support/Alerts/Rules/TicketCriticalUnassigned.php`, `TicketOverdue.php`, `LeadHotUntouched.php`, `OrderNotDispatched.php`, `ReturnWaiting.php`, `MailStalled.php`, `BackupFailedRule.php`, `HealthDrop.php`
- Test: `api/tests/Feature/AlertRulesTest.php`

**Interfaces:**
- Consumes: `AlertSettings::threshold(string): int` (Task 1).
- Produces:
  - `interface AlertRule { public function key(): string; public function role(): Role; public function label(): string; public function thresholdLabel(): ?string; public function current(): Collection; }` (`Collection<int, AlertHit>`)
  - `final readonly class AlertHit { __construct(string $subject, string $line, string $href) }`
  - `Rules::all(): list<AlertRule>`, `Rules::forUser(User $u): list<AlertRule>`, `Rules::holds(User $u, AlertRule $r): bool`, `Rules::keys(): list<string>`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\Backup;
use App\Models\Customer;
use App\Models\HealthSnapshot;
use App\Models\Lead;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Support\Alerts\Rules;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class AlertRulesTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function rule(string $key)
    {
        return collect(Rules::all())->first(fn ($r) => $r->key() === $key);
    }

    private function hits(string $key): array
    {
        return $this->rule($key)->current()->map(fn ($h) => $h->subject)->all();
    }

    private function ticket(array $attrs): Ticket
    {
        $customer = Customer::query()->first();
        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['name' => 'C', 'email' => 'c@example.test', 'password' => 'x', 'status' => 'active', 'email_verified_at' => now()])->save();
        }
        $cat = TicketCategory::firstOrCreate(['slug' => 'general'], ['name' => 'General', 'sort_order' => 1]);
        $ticket = Ticket::create(array_merge([
            'customer_id' => $customer->id, 'ticket_category_id' => $cat->id, 'subject' => 'S', 'description' => 'D',
            'status' => TicketStatus::Open, 'priority' => TicketPriority::Normal,
        ], $attrs));
        if (isset($attrs['created_at'])) {
            DB::table('tickets')->where('id', $ticket->id)->update(['created_at' => $attrs['created_at']]);
        }

        return $ticket->fresh();
    }

    public function test_the_list_has_eight_rules_with_distinct_keys(): void
    {
        $this->assertSame([
            'ticket_critical_unassigned', 'ticket_overdue', 'lead_hot_untouched', 'order_not_dispatched',
            'return_waiting', 'mail_stalled', 'backup_failed', 'health_drop',
        ], Rules::keys());
    }

    public function test_a_critical_ticket_unassigned_past_the_threshold(): void
    {
        $old = $this->ticket(['priority' => TicketPriority::Critical, 'created_at' => now()->subMinutes(31)]);
        $this->ticket(['priority' => TicketPriority::Critical, 'created_at' => now()->subMinutes(29)]);
        $this->ticket(['priority' => TicketPriority::High, 'created_at' => now()->subHour()]);

        $this->assertSame(['ticket:'.$old->id], $this->hits('ticket_critical_unassigned'));
        $hit = $this->rule('ticket_critical_unassigned')->current()->first();
        $this->assertStringContainsString($old->reference, $hit->line);
        $this->assertSame('/admin/tickets/'.$old->reference, $hit->href);
    }

    public function test_an_overdue_ticket_is_the_overdue_scope(): void
    {
        $late = $this->ticket(['due_at' => now()->subMinute()]);
        $this->ticket(['due_at' => now()->addHour()]);

        $this->assertSame(['ticket:'.$late->id], $this->hits('ticket_overdue'));
    }

    public function test_a_hot_lead_still_new_past_the_threshold(): void
    {
        $lead = Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'hot']);
        DB::table('leads')->where('id', $lead->id)->update(['created_at' => now()->subHours(3)]);
        $fresh = Lead::create(['name' => 'B', 'email' => 'b@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'hot']);
        $warm = Lead::create(['name' => 'C', 'email' => 'c@example.test', 'status' => LeadStatus::New, 'channel' => 'contact', 'score_band' => 'warm']);
        DB::table('leads')->where('id', $warm->id)->update(['created_at' => now()->subHours(3)]);

        $this->assertSame(['lead:'.$lead->id], $this->hits('lead_hot_untouched'));
        $this->assertStringNotContainsString('a@example.test', $this->rule('lead_hot_untouched')->current()->first()->line);
    }

    public function test_a_paid_order_not_dispatched_that_ships(): void
    {
        $order = fn (ProductType $type, int $days) => tap(Order::create([
            'order_number' => Order::nextNumber(), 'status' => OrderStatus::Paid,
            'subtotal_paise' => 100, 'taxable_paise' => 85, 'gst_paise' => 15, 'total_paise' => 100,
            'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now(), 'paid_at' => now()->subDays($days),
        ]), fn (Order $o) => $o->items()->create([
            'name' => 'Thing', 'type' => $type, 'quantity' => 1, 'unit_price_paise' => 100, 'line_total_paise' => 100, 'returnable' => true,
        ]));

        $late = $order(ProductType::Physical, 3);
        $order(ProductType::Physical, 1);
        $order(ProductType::Digital, 5);

        $this->assertSame(['order:'.$late->id], $this->hits('order_not_dispatched'));
        $this->assertSame('/admin/store/orders/'.$late->order_number, $this->rule('order_not_dispatched')->current()->first()->href);
    }

    public function test_a_return_waiting_past_the_threshold(): void
    {
        // Reuse an order helper as the Zoho/Returns tests do; the shape only needs an order row.
        $order = Order::create([
            'order_number' => Order::nextNumber(), 'status' => OrderStatus::Dispatched,
            'subtotal_paise' => 100, 'taxable_paise' => 85, 'gst_paise' => 15, 'total_paise' => 100,
            'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now(), 'paid_at' => now(),
        ]);
        $old = OrderReturn::create(['order_id' => $order->id, 'reason' => 'faulty']);
        DB::table('order_returns')->where('id', $old->id)->update(['created_at' => now()->subDays(3)]);
        OrderReturn::create(['order_id' => $order->id, 'reason' => 'faulty']);

        $this->assertSame(['return:'.$old->id], $this->hits('return_waiting'));
    }

    public function test_mail_waiting_too_long(): void
    {
        config(['queue.default' => 'database']);
        $this->assertSame([], $this->hits('mail_stalled'));
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => time() - 11 * 60, 'created_at' => time() - 11 * 60]);
        $this->assertSame(['system'], $this->hits('mail_stalled'));
    }

    public function test_a_failed_backup_or_none_in_36_hours(): void
    {
        $this->assertSame([], $this->hits('backup_failed'), 'Backups switched off: no alert.');
        Setting::put('backup_enabled', '1');
        Setting::flushCache();
        $this->assertSame(['stale'], $this->hits('backup_failed'), 'On and never completed.');

        $ok = Backup::create(['uuid' => 'a', 'type' => 'full', 'trigger' => 'schedule', 'status' => 'completed', 'folder' => 'f1', 'finished_at' => now()]);
        $this->assertSame([], $this->hits('backup_failed'));

        $bad = Backup::create(['uuid' => 'b', 'type' => 'full', 'trigger' => 'schedule', 'status' => 'failed', 'folder' => 'f2', 'finished_at' => now()]);
        $this->assertSame(['backup:'.$bad->id], $this->hits('backup_failed'));
    }

    public function test_the_health_score_falls_by_the_threshold(): void
    {
        HealthSnapshot::create(['date' => now()->subDays(3)->toDateString(), 'score' => 92, 'records_checked' => 10, 'counts' => []]);
        HealthSnapshot::create(['date' => now()->toDateString(), 'score' => 83, 'records_checked' => 10, 'counts' => []]);
        $this->assertSame([], $this->hits('health_drop'), 'Nine points is under ten.');

        HealthSnapshot::query()->whereDate('date', now()->toDateString())->update(['score' => 82]);
        $this->assertSame(['system'], $this->hits('health_drop'));
    }

    public function test_an_administrator_holds_every_rule_and_a_role_only_its_own(): void
    {
        $this->assertCount(8, Rules::forUser($this->staff(RoleEnum::Admin)));
        $support = array_map(fn ($r) => $r->key(), Rules::forUser($this->staff(RoleEnum::SupportEngineer)));
        $this->assertSame(['ticket_critical_unassigned', 'ticket_overdue'], $support);
        $this->assertSame([], Rules::forUser($this->staff(RoleEnum::ContentManager)));
    }
}
```

Check two things while you write it. If `order_items.store_product_id` is not nullable, create a `StoreProduct` the way `ActivationProcedureTest::paidOrder()` does. If `Backup::create` needs more required columns, read the migration and add them; the assertions stay as written.

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=AlertRulesTest`
Expected: FAIL — `Class "App\Support\Alerts\Rules" not found`.

- [ ] **Step 3: The contract**

`AlertRule.php`:

```php
<?php

namespace App\Support\Alerts;

use App\Enums\Role;
use Illuminate\Support\Collection;

/**
 * One fixed alert (docs/digest-alerts.md). `current()` names what is in
 * trouble right now; the check decides who is told and whether they were
 * already told. Each rule reads the scope the screen it links to uses.
 */
interface AlertRule
{
    public function key(): string;

    public function role(): Role;

    /** What the switch on the profile says, e.g. "A critical ticket nobody has taken". */
    public function label(): string;

    /** The threshold in words, e.g. "after 30 minutes", or null for a rule without one. */
    public function thresholdLabel(): ?string;

    /** @return Collection<int, AlertHit> */
    public function current(): Collection;
}
```

`AlertHit.php`:

```php
<?php

namespace App\Support\Alerts;

/**
 * One thing in trouble. `subject` is stable (`ticket:41`, `system`) — it is
 * what once-per-thing is keyed on. `line` names the record by reference only,
 * never a customer's contact details or words. `href` is a console path.
 */
final readonly class AlertHit
{
    public function __construct(public string $subject, public string $line, public string $href) {}
}
```

`Rules.php`:

```php
<?php

namespace App\Support\Alerts;

use App\Models\User;
use App\Support\Alerts\Rules\BackupFailedRule;
use App\Support\Alerts\Rules\HealthDrop;
use App\Support\Alerts\Rules\LeadHotUntouched;
use App\Support\Alerts\Rules\MailStalled;
use App\Support\Alerts\Rules\OrderNotDispatched;
use App\Support\Alerts\Rules\ReturnWaiting;
use App\Support\Alerts\Rules\TicketCriticalUnassigned;
use App\Support\Alerts\Rules\TicketOverdue;

/** The one list of alerts. Adding one is a class here and two settings rows. */
final class Rules
{
    /** @return list<AlertRule> */
    public static function all(): array
    {
        return [
            new TicketCriticalUnassigned, new TicketOverdue, new LeadHotUntouched, new OrderNotDispatched,
            new ReturnWaiting, new MailStalled, new BackupFailedRule, new HealthDrop,
        ];
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_map(fn (AlertRule $r) => $r->key(), self::all());
    }

    /** `hasRole()` does not pass an administrator, so the admin check is explicit. */
    public static function holds(User $user, AlertRule $rule): bool
    {
        return $user->isAdmin() || $user->hasRole($rule->role());
    }

    /** @return list<AlertRule> */
    public static function forUser(User $user): array
    {
        return array_values(array_filter(self::all(), fn (AlertRule $r) => self::holds($user, $r)));
    }
}
```

- [ ] **Step 4: The eight rules**

Each file lives in `api/app/Support/Alerts/Rules/`, namespace `App\Support\Alerts\Rules`, and is `final class … implements AlertRule`. Each `current()` is capped at 50 hits (`->limit(50)`), so a broken day cannot produce a thousand-line email.

`TicketCriticalUnassigned.php`:

```php
<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Models\Ticket;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use Illuminate\Support\Collection;

final class TicketCriticalUnassigned implements AlertRule
{
    public function key(): string { return 'ticket_critical_unassigned'; }

    public function role(): Role { return Role::SupportEngineer; }

    public function label(): string { return 'A critical ticket nobody has taken'; }

    public function thresholdLabel(): ?string
    {
        return 'after '.AlertSettings::threshold('alert_ticket_critical_minutes').' minutes';
    }

    public function current(): Collection
    {
        $minutes = AlertSettings::threshold('alert_ticket_critical_minutes');

        return Ticket::query()->open()->where('priority', TicketPriority::Critical)->whereNull('assigned_to')
            ->where('created_at', '<=', now()->subMinutes($minutes))->oldest()->limit(50)->get(['id', 'reference', 'created_at'])
            ->map(fn (Ticket $t) => new AlertHit('ticket:'.$t->id,
                "{$t->reference} is critical and nobody has taken it (".(int) $t->created_at->diffInMinutes(now(), true).' min).',
                '/admin/tickets/'.$t->reference))->values();
    }
}
```

`TicketOverdue.php`: the same shape. `role()` is SupportEngineer, `label()` is `'A ticket past its due time'`, and `thresholdLabel()` returns `null`. `current()`:

```php
        return Ticket::query()->overdue()->orderBy('due_at')->limit(50)->get(['id', 'reference', 'due_at'])
            ->map(fn (Ticket $t) => new AlertHit('ticket:'.$t->id, "{$t->reference} is past its due time.", '/admin/tickets/'.$t->reference))->values();
```

`LeadHotUntouched.php`: role SalesManager, label `'A hot lead nobody has answered'`, thresholdLabel `'after '.$h.' hours'` with `$h = AlertSettings::threshold('alert_lead_hot_hours')`. `current()`:

```php
        return Lead::query()->where('score_band', 'hot')->where('status', LeadStatus::New)
            ->where('created_at', '<=', now()->subHours(AlertSettings::threshold('alert_lead_hot_hours')))
            ->oldest()->limit(50)->get(['id', 'created_at'])
            ->map(fn (Lead $l) => new AlertHit('lead:'.$l->id,
                "Hot lead #{$l->id} has had no reply for ".(int) $l->created_at->diffInHours(now(), true).' hours.', '/admin/leads/'.$l->id))->values();
```

`OrderNotDispatched.php`: role StoreManager, label `'A paid order not yet sent'`, thresholdLabel `'after N days'` with `$d = AlertSettings::threshold('alert_order_dispatch_days')`. The candidate set is the store's own definition of paid, filtered to orders with something to ship. `current()`:

```php
        return Order::query()->paid()->whereNull('dispatched_at')
            ->whereNotIn('status', [OrderStatus::Cancelled, OrderStatus::Refunded, OrderStatus::RefundRequested])
            ->where('paid_at', '<=', now()->subDays(AlertSettings::threshold('alert_order_dispatch_days')))
            ->with('items')->oldest('paid_at')->limit(50)->get()
            ->filter(fn (Order $o) => $o->needsShipping())
            ->map(fn (Order $o) => new AlertHit('order:'.$o->id,
                "Order {$o->order_number} was paid ".(int) $o->paid_at->diffInDays(now(), true).' days ago and has not been sent.',
                '/admin/store/orders/'.$o->order_number))->values();
```

`diffInDays` returns a float in Carbon 3, so wrap it in `(int)` inside the string. Do the same for `diffInMinutes` and `diffInHours` in the other rules.

`ReturnWaiting.php`: role StoreManager, label `'A return nobody has answered'`, thresholdLabel `'after N days'` (`alert_return_days`). `current()`:

```php
        return OrderReturn::query()->waiting()
            ->where('created_at', '<=', now()->subDays(AlertSettings::threshold('alert_return_days')))
            ->oldest()->limit(50)->get(['id', 'reference', 'created_at'])
            ->map(fn (OrderReturn $r) => new AlertHit('return:'.$r->id,
                "Return {$r->reference} has waited ".(int) $r->created_at->diffInDays(now(), true).' days for an answer.',
                '/admin/store/returns/'.$r->reference))->values();
```

`MailStalled.php`: role Admin, label `'Email not leaving'`, thresholdLabel `'after N minutes'` (`alert_mail_minutes`). `current()`:

```php
        $queue = QueueHealth::read();
        $oldest = $queue['oldest_seconds'] ?? null;
        $limit = AlertSettings::threshold('alert_mail_minutes') * 60;

        return collect($oldest !== null && $oldest >= $limit
            ? [new AlertHit('system', 'The oldest email has waited '.intdiv($oldest, 60).' minutes to leave. Check the scheduler.', '/admin/system/status')]
            : []);
```

`BackupFailedRule.php`: role Admin, label `'A backup that failed or did not run'`, thresholdLabel `null`. `current()`:

```php
        if (! BackupSettings::enabled()) {
            return collect();
        }
        $latest = Backup::query()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)
            ->whereIn('status', ['completed', 'completed_with_errors', 'failed'])->latest('id')->first();
        if ($latest !== null && $latest->status !== 'completed') {
            return collect([new AlertHit('backup:'.$latest->id, 'The latest backup did not complete everywhere.', '/admin/backups')]);
        }
        $recent = Backup::query()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->where('status', 'completed')
            ->where('finished_at', '>=', now()->subHours(36))->exists();

        return collect($recent ? [] : [new AlertHit('stale', 'No backup has completed in 36 hours.', '/admin/backups')]);
```

`HealthDrop.php`: role Admin, label `'The site health score fell'`, thresholdLabel `'by N points'` (`alert_health_points`). `current()`:

```php
        $today = HealthSnapshot::query()->latest('date')->first();
        if ($today === null || $today->score === null) {
            return collect();
        }
        $best = HealthSnapshot::query()->where('date', '<', $today->date)->where('date', '>=', $today->date->copy()->subDays(7))
            ->whereNotNull('score')->max('score');
        $drop = $best === null ? 0 : (int) $best - (int) $today->score;

        return collect($drop >= AlertSettings::threshold('alert_health_points')
            ? [new AlertHit('system', "Site health fell from {$best} to {$today->score} this week.", '/admin/health')]
            : []);
```

Import the models and enums each file uses: `Ticket`, `Lead`, `LeadStatus`, `Order`, `OrderStatus`, `OrderReturn`, `QueueHealth`, `Backup`, `App\Support\Backups\BackupSettings`, `HealthSnapshot`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `php artisan test --filter=AlertRulesTest`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
./vendor/bin/pint app tests
composer analyse
git add api/app/Support/Alerts api/tests/Feature/AlertRulesTest.php
git commit -m "Digest and alerts: the eight alert rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The alert check, staff push and the alerts email

**Files:**
- Create: `api/app/Support/Alerts/AlertCheck.php`, `api/app/Support/Alerts/StaffPush.php`
- Create: `api/app/Notifications/StaffAlerts.php`
- Create: `api/app/Console/Commands/CheckAlerts.php`, `api/app/Console/Commands/PruneAlertFires.php`
- Modify: `api/app/Support/Messaging/Providers/Fcm.php` (add `pushTo`)
- Modify: `api/app/Support/Mail/MessageCatalogueEntries.php` (`staff_alerts` entry)
- Modify: `api/routes/console.php`
- Test: `api/tests/Feature/AlertCheckTest.php`

**Interfaces:**
- Consumes: `Rules::all()`, `Rules::holds()`, `AlertHit`, `AlertSettings::enabled()`, `StaffPreferences::for()`, `StaffPreference::wantsAlert()`, `StaffPreference::quietAt()`.
- Produces:
  - `AlertCheck::run(): array{people: int, alerts: int}`
  - `AlertCheck::deliver(User $user, StaffPreference $prefs, array $hits, bool $respectQuiet = true): void`, where `$hits` is `list<array{rule: string, hit: AlertHit}>` (used by Task 5's test send)
  - `StaffPush::send(User $user, string $title, array $lines, string $href): int`
  - `StaffAlerts::__construct(array $lines)`, where `$lines` is `list<array{line: string, href: string}>`
  - `Fcm::pushTo(string $token, string $title, string $body, ?string $link): string`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\AlertFire;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\StaffPreference;
use App\Models\StaffPushSubscription;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\StaffAlerts;
use App\Support\Alerts\AlertCheck;
use App\Support\Alerts\Rules;
use App\Support\Messaging\Providers\Fcm;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use ReflectionClassConstant;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class AlertCheckTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(now()->setTimezone('Asia/Kolkata')->setTime(12, 0));
    }

    private function overdue(): Ticket
    {
        $customer = Customer::query()->first();
        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['name' => 'C', 'email' => 'c@example.test', 'password' => 'x', 'status' => 'active', 'email_verified_at' => now()])->save();
        }
        $cat = TicketCategory::firstOrCreate(['slug' => 'general'], ['name' => 'General', 'sort_order' => 1]);

        return Ticket::create([
            'customer_id' => $customer->id, 'ticket_category_id' => $cat->id, 'subject' => 'S', 'description' => 'D',
            'status' => TicketStatus::Open, 'priority' => TicketPriority::Normal, 'due_at' => now()->subMinute(),
        ]);
    }

    private function pushOn(): void
    {
        foreach ([
            Fcm::KEY => (string) json_encode([
                'client_email' => 'p@project.iam.gserviceaccount.com',
                'private_key' => (new ReflectionClassConstant(SearchConsoleTest::class, 'TEST_KEY'))->getValue(),
                'project_id' => 'technoware-push',
            ]),
            'messaging_push_provider' => 'fcm',
        ] as $key => $value) {
            Setting::put($key, $value);
        }
        Setting::flushCache();
    }

    public function test_one_hit_fires_once_across_two_checks(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();

        AlertCheck::run();
        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 1);
    }

    public function test_three_hits_make_one_email(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue(); $this->overdue(); $this->overdue();

        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 1);
        Notification::assertSentTo($support, StaffAlerts::class, fn (StaffAlerts $n) => count($n->lines) === 3);
    }

    public function test_a_cleared_alert_fires_again_when_it_returns(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $ticket = $this->overdue();

        AlertCheck::run();
        $ticket->update(['due_at' => now()->addDay()]);
        AlertCheck::run();
        $this->assertNotNull(AlertFire::first()->cleared_at);
        $ticket->update(['due_at' => now()->subMinute()]);
        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 2);
    }

    public function test_two_people_each_get_their_own(): void
    {
        $a = $this->staff(RoleEnum::SupportEngineer, 'a');
        $b = $this->staff(RoleEnum::SupportEngineer, 'b');
        $this->overdue();

        AlertCheck::run();

        Notification::assertSentToTimes($a, StaffAlerts::class, 1);
        Notification::assertSentToTimes($b, StaffAlerts::class, 1);
    }

    public function test_a_person_without_the_role_gets_nothing(): void
    {
        $content = $this->staff(RoleEnum::ContentManager);
        $admin = $this->staff(RoleEnum::Admin);
        $this->overdue();

        AlertCheck::run();

        Notification::assertNotSentTo($content, StaffAlerts::class);
        Notification::assertSentTo($admin, StaffAlerts::class);
    }

    public function test_switched_off_by_the_person_or_the_site_sends_nothing(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPreference::create(['user_id' => $support->id, 'alerts' => ['ticket_overdue' => false]]);
        $this->overdue();
        AlertCheck::run();
        Notification::assertNotSentTo($support, StaffAlerts::class);

        $other = $this->staff(RoleEnum::SupportEngineer, 'b');
        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        AlertCheck::run();
        Notification::assertNotSentTo($other, StaffAlerts::class);
    }

    public function test_switching_a_rule_off_clears_its_open_fires(): void
    {
        $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();
        AlertCheck::run();

        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        AlertCheck::run();

        $this->assertSame(0, AlertFire::query()->whereNull('cleared_at')->count());
    }

    public function test_inactive_staff_get_nothing(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $support->update(['is_active' => false]);
        $this->overdue();

        AlertCheck::run();

        Notification::assertNotSentTo($support, StaffAlerts::class);
    }

    public function test_a_rule_that_throws_spares_the_rest(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();
        // A broken rule: HealthDrop's table is gone, so its query throws. (QueueHealth swallows its own errors.)
        DB::statement('DROP TABLE health_snapshots');

        AlertCheck::run();

        Notification::assertSentTo($support, StaffAlerts::class);
    }

    public function test_push_is_one_message_and_skipped_in_quiet_hours(): void
    {
        $this->pushOn();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29']),
            'fcm.googleapis.com/*' => Http::response(['name' => 'projects/technoware-push/messages/1']),
        ]);
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPushSubscription::create(['user_id' => $support->id, 'token' => str_repeat('t', 40), 'label' => 'Chrome on Windows']);
        $this->overdue(); $this->overdue();

        AlertCheck::run();
        Http::assertSentCount(2); // the token exchange and one push
        Http::assertSent(fn ($r) => str_contains($r->url(), 'messages:send')
            && $r['message']['notification']['title'] === '2 things need you'
            && ! str_contains(json_encode($r->data()), 'c@example.test'));

        $this->travelTo(now()->setTime(22, 0));
        $this->overdue();
        AlertCheck::run();
        Http::assertSentCount(2); // quiet: no new push
        Notification::assertSentToTimes($support, StaffAlerts::class, 2); // email still goes
    }

    public function test_an_unregistered_token_is_deleted_and_the_email_still_goes(): void
    {
        $this->pushOn();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29']),
            'fcm.googleapis.com/*' => Http::response(['error' => ['message' => 'gone',
                'details' => [['@type' => 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode' => 'UNREGISTERED']]]], 404),
        ]);
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPushSubscription::create(['user_id' => $support->id, 'token' => str_repeat('t', 40)]);
        $this->overdue();

        AlertCheck::run();

        $this->assertSame(0, StaffPushSubscription::count());
        Notification::assertSentTo($support, StaffAlerts::class);
    }

    public function test_the_command_runs_and_the_prune_drops_old_cleared_fires(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        AlertFire::create(['rule' => 'ticket_overdue', 'subject' => 'ticket:1', 'user_id' => $support->id, 'fired_at' => now()->subDays(40), 'cleared_at' => now()->subDays(31)]);
        AlertFire::create(['rule' => 'ticket_overdue', 'subject' => 'ticket:2', 'user_id' => $support->id, 'fired_at' => now()->subDays(40)]);

        $this->artisan('technoware:check-alerts')->assertSuccessful();
        $this->artisan('technoware:prune-alert-fires')->assertSuccessful();

        $this->assertSame(['ticket:2'], AlertFire::pluck('subject')->all());
    }
}
```

Keep `'ticket:2'` in the prune test: the check clears it (no such ticket), but it was cleared only now, so the prune keeps it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=AlertCheckTest`
Expected: FAIL — `Class "App\Support\Alerts\AlertCheck" not found`.

- [ ] **Step 3: `Fcm::pushTo`**

In `Fcm.php`, after `test()`:

```php
    /** A push with no template: the staff alerts' (docs/digest-alerts.md). */
    public function pushTo(string $token, string $title, string $body, ?string $link): string
    {
        return $this->push($token, $title, $body, null, $link);
    }
```

- [ ] **Step 4: `StaffPush`**

```php
<?php

namespace App\Support\Alerts;

use App\Enums\MessageChannel;
use App\Models\StaffPushSubscription;
use App\Models\User;
use App\Support\Messaging\Providers\Fcm;
use App\Support\Messaging\Providers\ProviderException;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * A staff member's browser notifications, through the FCM provider messaging
 * already configures. It never throws: a failed push must never stop the email.
 */
final class StaffPush
{
    /** @param list<string> $lines @return int how many browsers took it */
    public static function send(User $user, string $title, array $lines, string $href): int
    {
        if (! MessageChannel::Push->ready()) {
            return 0;
        }
        $sent = 0;
        foreach (StaffPushSubscription::query()->where('user_id', $user->id)->get() as $sub) {
            try {
                (new Fcm)->pushTo($sub->token, $title, implode("\n", array_slice($lines, 0, 3)), $href);
                $sub->forceFill(['failed_at' => null])->save();
                $sent++;
            } catch (ProviderException $e) {
                $e->revoke ? $sub->delete() : $sub->forceFill(['failed_at' => now()])->save();
            } catch (Throwable $e) {
                Log::warning('Staff push failed', ['user' => $user->id, 'error' => $e->getMessage()]);
                $sub->forceFill(['failed_at' => now()])->save();
            }
        }

        return $sent;
    }
}
```

- [ ] **Step 5: `StaffAlerts` notification and its catalogue entry**

```php
<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/**
 * Things that went wrong since the last check, for one staff member
 * (docs/digest-alerts.md). One email per check however many lines.
 */
class StaffAlerts extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    /** @param list<array{line: string, href: string}> $lines */
    public function __construct(public readonly array $lines) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_alerts';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) ($notifiable->name ?? ''),
            'count' => (string) count($this->lines),
            'alerts' => $this->listHtml(),
            'url' => self::base().'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject(count($this->lines) === 1 ? 'Something needs you' : count($this->lines).' things need you')
            ->line(new HtmlString($this->listHtml()))
            ->line(new HtmlString('<a href="'.e(self::base().'/admin/profile').'">Choose which alerts you get</a>'));

        return $mail;
    }

    private function listHtml(): string
    {
        $items = array_map(fn (array $l) => '<li><a href="'.e(self::base().$l['href']).'">'.e($l['line']).'</a></li>', $this->lines);

        return '<ul>'.implode('', $items).'</ul>';
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
```

In `MessageCatalogueEntries.php`, beside `backup_failed`, add (import `App\Notifications\StaffAlerts`):

```php
            /*
             * Digest and alerts (0.185.0, docs/digest-alerts.md): the things
             * that need this staff member, one email per five-minute check.
             */
            'staff_alerts' => [
                'label' => 'Alerts — to a staff member',
                'description' => 'Sent when something a staff member looks after needs them: a critical ticket nobody has taken, a hot lead with no reply, a backup that failed. One email per check, listing every new alert.',
                'audience' => self::INTERNAL,
                'class' => StaffAlerts::class,
                'variables' => [
                    'name' => ['about' => 'The staff member’s name.', 'sample' => 'Priya Sharma'],
                    'count' => ['about' => 'How many alerts are in this email.', 'sample' => '2'],
                    'alerts' => self::details('The alerts, each a link to its record.', '<ul><li><a href="https://www.example.com/admin/tickets/TW-2026-00041">TW-2026-00041 is past its due time.</a></li></ul>'),
                    'url' => ['about' => 'Where to choose which alerts arrive.', 'sample' => 'https://www.example.com/admin/profile'],
                ],
                'subject' => '{{count}} things need you',
                'body' => '<p>Hello {{name}},</p>{{alerts}}<p><a href="{{url}}">Choose which alerts you get</a></p>',
            ],
```

- [ ] **Step 6: `AlertCheck`**

```php
<?php

namespace App\Support\Alerts;

use App\Models\AlertFire;
use App\Models\StaffPreference;
use App\Models\User;
use App\Notifications\StaffAlerts;
use App\Support\Notifier;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The five-minute check (docs/digest-alerts.md). Every enabled rule is read,
 * fires whose subject has gone are cleared, and each person is told — once —
 * about what is new for them, in one email and one push.
 */
final class AlertCheck
{
    /** @return array{people: int, alerts: int} */
    public static function run(): array
    {
        /** @var array<string, array{rule: AlertRule, hits: array<string, AlertHit>}> $live */
        $live = [];
        foreach (Rules::all() as $rule) {
            $key = $rule->key();
            if (! AlertSettings::enabled($key)) {
                AlertFire::query()->where('rule', $key)->whereNull('cleared_at')->update(['cleared_at' => now()]);

                continue;
            }
            try {
                $hits = $rule->current()->keyBy('subject')->all();
            } catch (Throwable $e) {
                Log::warning('Alert rule failed', ['rule' => $key, 'error' => $e->getMessage()]);

                continue; // nothing cleared for a rule that could not be read
            }
            AlertFire::query()->where('rule', $key)->whereNull('cleared_at')
                ->whereNotIn('subject', array_keys($hits) ?: [''])->update(['cleared_at' => now()]);
            $live[$key] = ['rule' => $rule, 'hits' => $hits];
        }

        $people = 0;
        $alerts = 0;
        foreach (User::query()->where('is_active', true)->with(['roles', 'staffPreference'])->get() as $user) {
            $prefs = StaffPreferences::for($user);
            $open = AlertFire::query()->where('user_id', $user->id)->whereNull('cleared_at')
                ->get(['rule', 'subject'])->map(fn ($f) => $f->rule.'|'.$f->subject)->flip();
            $batch = [];
            foreach ($live as $key => ['rule' => $rule, 'hits' => $hits]) {
                if (! Rules::holds($user, $rule) || ! $prefs->wantsAlert($key)) {
                    continue;
                }
                foreach ($hits as $subject => $hit) {
                    if (! isset($open[$key.'|'.$subject])) {
                        $batch[] = ['rule' => $key, 'hit' => $hit];
                    }
                }
            }
            if ($batch === []) {
                continue;
            }
            // Written first: a failed send must not resend the batch next time.
            foreach ($batch as ['rule' => $key, 'hit' => $hit]) {
                AlertFire::query()->updateOrCreate(
                    ['rule' => $key, 'subject' => $hit->subject, 'user_id' => $user->id],
                    ['fired_at' => now(), 'cleared_at' => null],
                );
            }
            self::deliver($user, $prefs, $batch);
            $people++;
            $alerts += count($batch);
        }

        return ['people' => $people, 'alerts' => $alerts];
    }

    /** @param list<array{rule: string, hit: AlertHit}> $batch */
    public static function deliver(User $user, StaffPreference $prefs, array $batch, bool $respectQuiet = true): void
    {
        $lines = array_map(fn (array $b) => ['line' => $b['hit']->line, 'href' => $b['hit']->href], $batch);
        if ($prefs->alert_email) {
            Notifier::send($user, new StaffAlerts($lines));
        }
        if ($prefs->alert_push && ! ($respectQuiet && $prefs->quietAt(now()))) {
            $title = count($lines) === 1 ? $lines[0]['line'] : count($lines).' things need you';
            $href = count($lines) === 1 ? $lines[0]['href'] : '/admin';
            StaffPush::send($user, $title, array_column($lines, 'line'), $href);
        }
    }
}
```

If `Notifier::send` takes a different shape for a `Notifiable` model, read `app/Support/Notifier.php::send` and call it as it documents. It must stay the guarded path, so a dead mail server never throws from the check.

- [ ] **Step 7: The commands and the schedule**

`CheckAlerts.php`:

```php
<?php

namespace App\Console\Commands;

use App\Support\Alerts\AlertCheck;
use Illuminate\Console\Command;

/** Every five minutes (docs/digest-alerts.md). */
class CheckAlerts extends Command
{
    protected $signature = 'technoware:check-alerts';

    protected $description = 'Tell staff, once, about what needs them now';

    public function handle(): int
    {
        $result = AlertCheck::run();
        $this->info("{$result['alerts']} new alerts for {$result['people']} people.");

        return self::SUCCESS;
    }
}
```

`PruneAlertFires.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\AlertFire;
use Illuminate\Console\Command;

class PruneAlertFires extends Command
{
    protected $signature = 'technoware:prune-alert-fires';

    protected $description = 'Delete alert records that cleared more than 30 days ago';

    public function handle(): int
    {
        $n = AlertFire::query()->whereNotNull('cleared_at')->where('cleared_at', '<', now()->subDays(30))->delete();
        $this->info("{$n} deleted.");

        return self::SUCCESS;
    }
}
```

In `routes/console.php`, beside the health lines:

```php
// Digest and alerts (0.185.0, docs/digest-alerts.md).
Schedule::command('technoware:check-alerts')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('technoware:prune-alert-fires')->dailyAt('03:25');
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `php artisan test --filter="AlertCheckTest|MailTemplateTest"`
Expected: PASS. `MailTemplateTest` checks that every catalogue entry's placeholders appear in its class.

- [ ] **Step 9: Commit**

```bash
./vendor/bin/pint app routes tests
composer analyse
git add api/app/Support/Alerts api/app/Notifications/StaffAlerts.php api/app/Console/Commands/CheckAlerts.php api/app/Console/Commands/PruneAlertFires.php api/app/Support/Messaging/Providers/Fcm.php api/app/Support/Mail/MessageCatalogueEntries.php api/routes/console.php api/tests/Feature/AlertCheckTest.php
git commit -m "Digest and alerts: the five-minute check, staff push and the alerts email

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The digest

**Files:**
- Create: `api/app/Support/Digest/Digest.php`, `api/app/Support/Digest/DigestBuilder.php`
- Create: `api/app/Notifications/StaffDigest.php`
- Create: `api/app/Console/Commands/SendDigests.php`
- Modify: `api/app/Support/Mail/MessageCatalogueEntries.php` (`staff_digest`), `api/routes/console.php`
- Test: `api/tests/Feature/StaffDigestTest.php`

**Interfaces:**
- Consumes: `Questions::for(array $roles): list<Question>` (existing); `StaffPreferences::for()` (Task 1).
- Produces:
  - `DigestBuilder::build(User $user, ?array $previous): Digest`
  - `Digest` with `items` (`list<array{key, label, figure, sentence, href, change}>`), `clear` (`list<string>`), `allZero: bool`, and `figures(): array<string,int>`
  - `DigestBuilder::due(StaffPreference $p, CarbonInterface $now): bool`
  - `SendDigests` (`technoware:send-digests`)
  - `StaffDigest::__construct(Digest $digest)`

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Lead;
use App\Models\StaffPreference;
use App\Notifications\StaffDigest;
use App\Support\Digest\DigestBuilder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class StaffDigestTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
    }

    private function at(string $when): void
    {
        $this->travelTo(\Carbon\Carbon::parse($when, 'Asia/Kolkata'));
    }

    public function test_the_digest_is_the_copilot_figures_for_the_persons_roles(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager);
        Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact']);

        $digest = DigestBuilder::build($sales, null);

        $keys = array_column($digest->items, 'key');
        $this->assertNotEmpty($keys);
        foreach ($digest->items as $item) {
            $this->assertNotSame(0, $item['figure']);
        }
        $this->assertStringNotContainsString('ticket', implode(' ', $keys), 'A sales manager sees no support question.');
    }

    public function test_a_change_is_against_the_last_digest_and_only_for_whole_numbers(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager);
        foreach (range(1, 4) as $i) {
            Lead::create(['name' => "L{$i}", 'email' => "l{$i}@example.test", 'status' => LeadStatus::New, 'channel' => 'contact']);
        }
        $first = DigestBuilder::build($sales, null);
        $key = $first->items[0]['key'];
        $this->assertNull($first->items[0]['change']);

        $second = DigestBuilder::build($sales, [$key => $first->items[0]['figure'] - 3]);
        $this->assertSame('up 3', collect($second->items)->firstWhere('key', $key)['change']);
    }

    public function test_zero_figures_fold_into_the_all_clear_line(): void
    {
        $digest = DigestBuilder::build($this->staff(RoleEnum::SupportEngineer), null);

        $this->assertTrue($digest->allZero);
        $this->assertSame([], $digest->items);
        $this->assertNotEmpty($digest->clear);
    }

    public function test_due_on_the_hour_and_the_weekday(): void
    {
        $daily = new StaffPreference(['digest' => 'daily', 'digest_hour' => 8]);
        $weekly = new StaffPreference(['digest' => 'weekly', 'digest_hour' => 8, 'digest_weekday' => 1]);
        $off = new StaffPreference(['digest' => 'off', 'digest_hour' => 8]);

        $monday8 = \Carbon\CarbonImmutable::parse('2026-10-26 08:10', 'Asia/Kolkata');
        $tuesday8 = $monday8->addDay();
        $monday9 = $monday8->addHour();

        $this->assertTrue(DigestBuilder::due($daily, $monday8));
        $this->assertTrue(DigestBuilder::due($daily, $tuesday8));
        $this->assertFalse(DigestBuilder::due($daily, $monday9));
        $this->assertTrue(DigestBuilder::due($weekly, $monday8));
        $this->assertFalse(DigestBuilder::due($weekly, $tuesday8));
        $this->assertFalse(DigestBuilder::due($off, $monday8));
    }

    public function test_once_a_day_even_when_run_twice(): void
    {
        $this->at('2026-10-26 08:05');
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPreference::create(['user_id' => $support->id, 'digest' => 'daily', 'digest_hour' => 8]);

        $this->artisan('technoware:send-digests')->assertSuccessful();
        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertSentToTimes($support, StaffDigest::class, 1);
        $this->assertNotNull(StaffPreference::first()->last_digest_at);
    }

    public function test_the_default_reaches_somebody_who_never_saved(): void
    {
        $this->at('2026-10-26 08:05'); // a Monday
        $support = $this->staff(RoleEnum::SupportEngineer);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertSentTo($support, StaffDigest::class);
    }

    public function test_a_quiet_day_is_skipped_only_when_asked(): void
    {
        $this->at('2026-10-26 08:05');
        $a = $this->staff(RoleEnum::SupportEngineer, 'a');
        $b = $this->staff(RoleEnum::SupportEngineer, 'b');
        StaffPreference::create(['user_id' => $a->id, 'digest' => 'daily', 'digest_hour' => 8, 'digest_skip_quiet' => true]);
        StaffPreference::create(['user_id' => $b->id, 'digest' => 'daily', 'digest_hour' => 8]);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertNotSentTo($a, StaffDigest::class);
        Notification::assertSentTo($b, StaffDigest::class);
    }

    public function test_inactive_staff_get_none(): void
    {
        $this->at('2026-10-26 08:05');
        $support = $this->staff(RoleEnum::SupportEngineer);
        $support->update(['is_active' => false]);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertNotSentTo($support, StaffDigest::class);
    }
}
```

`SalesManager` must exist on `App\Enums\Role` (it does; check the case name with `grep -n "case Sales" app/Enums/Role.php`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=StaffDigestTest`
Expected: FAIL — class not found.

- [ ] **Step 3: `Digest` and `DigestBuilder`**

`Digest.php`:

```php
<?php

namespace App\Support\Digest;

/** One staff member's digest, built and not yet sent. */
final readonly class Digest
{
    /**
     * @param list<array{key: string, label: string, figure: mixed, sentence: string, href: ?string, change: ?string}> $items
     * @param list<string> $clear
     * @param list<string> $zeros the keys whose figure was 0, stored so 0 → 3 reads "up 3"
     */
    public function __construct(public array $items, public array $clear, public bool $allZero, public array $zeros = []) {}

    /** The whole-number figures, zeros included, for the next digest to compare with. @return array<string, int> */
    public function figures(): array
    {
        $out = [];
        foreach ($this->items as $item) {
            if (is_int($item['figure'])) {
                $out[$item['key']] = $item['figure'];
            }
        }
        foreach ($this->zeros as $key) {
            $out[$key] = 0;
        }

        return $out;
    }
}
```

`DigestBuilder.php`:

```php
<?php

namespace App\Support\Digest;

use App\Models\StaffPreference;
use App\Models\User;
use App\Support\Copilot\Questions;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * A staff member's digest (docs/digest-alerts.md): the copilot's figures for
 * their roles, each compared with what their last digest showed. Every figure
 * and sentence is the copilot's; nothing here is written by a model.
 */
final class DigestBuilder
{
    /** @param array<string, int>|null $previous */
    public static function build(User $user, ?array $previous): Digest
    {
        $items = [];
        $clear = [];
        $zeros = [];
        foreach (Questions::for($user->roles->pluck('slug')->all()) as $question) {
            try {
                $answer = $question->answer();
            } catch (Throwable $e) {
                Log::warning('Digest question failed', ['question' => $question->key, 'error' => $e->getMessage()]);

                continue;
            }
            $figure = $answer['figure'];
            if ($figure === 0 || $figure === null) {
                $clear[] = $question->label;
                if ($figure === 0) {
                    $zeros[] = $question->key;
                }

                continue;
            }
            $before = $previous[$question->key] ?? null;
            $items[] = [
                'key' => $question->key,
                'label' => $question->label,
                'figure' => $figure,
                'sentence' => $answer['sentence'],
                'href' => $answer['href'],
                'change' => is_int($figure) && is_int($before) && $figure !== $before
                    ? ($figure > $before ? 'up '.($figure - $before) : 'down '.($before - $figure))
                    : null,
            ];
        }

        return new Digest($items, $clear, $items === [], $zeros);
    }

    public static function due(StaffPreference $prefs, CarbonInterface $now): bool
    {
        $local = $now->setTimezone(config('app.timezone'));
        if ($prefs->digest === 'off' || $local->hour !== (int) $prefs->digest_hour) {
            return false;
        }

        return $prefs->digest !== 'weekly' || $local->dayOfWeekIso === (int) $prefs->digest_weekday;
    }
}
```

- [ ] **Step 4: `StaffDigest` and its catalogue entry**

```php
<?php

namespace App\Notifications;

use App\Notifications\Concerns\QueuedMail;
use App\Notifications\Concerns\Templated;
use App\Support\Digest\Digest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

/** A staff member's digest (docs/digest-alerts.md). Every word is the copilot's. */
class StaffDigest extends Notification implements ShouldQueue
{
    use Queueable, QueuedMail;
    use Templated;

    public function __construct(public readonly Digest $digest) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function templateKey(): string
    {
        return 'staff_digest';
    }

    /** @return array<string, string> */
    protected function templateData(object $notifiable): array
    {
        return [
            'name' => (string) ($notifiable->name ?? ''),
            'figures' => $this->figuresHtml(),
            'clear' => $this->clearLine(),
            'url' => self::base().'/admin/profile',
        ];
    }

    protected function defaultMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->digest->allZero ? 'Your digest: all clear' : 'Your digest');
        if (! $this->digest->allZero) {
            $mail->line(new HtmlString($this->figuresHtml()));
        }
        if ($this->clearLine() !== '') {
            $mail->line($this->clearLine());
        }

        return $mail->line(new HtmlString('<a href="'.e(self::base().'/admin/profile').'">Change when your digest arrives</a>'));
    }

    private function figuresHtml(): string
    {
        $rows = array_map(function (array $i): string {
            $text = e($i['sentence']).($i['change'] !== null ? ' <em>('.e($i['change']).')</em>' : '');

            return '<li>'.($i['href'] !== null ? '<a href="'.e(self::base().$i['href']).'">'.$text.'</a>' : $text).'</li>';
        }, $this->digest->items);

        return $rows === [] ? '' : '<ul>'.implode('', $rows).'</ul>';
    }

    private function clearLine(): string
    {
        return $this->digest->clear === [] ? '' : 'All clear: '.implode('; ', $this->digest->clear).'.';
    }

    private static function base(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
```

Catalogue entry (import `App\Notifications\StaffDigest`):

```php
            /* The digest (0.185.0, docs/digest-alerts.md): the copilot's figures for this person's roles. */
            'staff_digest' => [
                'label' => 'Digest — to a staff member',
                'description' => 'Each staff member’s summary of what needs them, daily or weekly at the hour they choose on their profile.',
                'audience' => self::INTERNAL,
                'class' => StaffDigest::class,
                'variables' => [
                    'name' => ['about' => 'The staff member’s name.', 'sample' => 'Priya Sharma'],
                    'figures' => self::details('Each figure that is not zero, with its change since the last digest.', '<ul><li><a href="https://www.example.com/admin/tickets?open=1">4 tickets are open. <em>(up 2)</em></a></li></ul>'),
                    'clear' => ['about' => 'The questions whose answer is zero, in one line.', 'sample' => 'All clear: Which tickets are overdue?.'],
                    'url' => ['about' => 'Where to change when the digest arrives.', 'sample' => 'https://www.example.com/admin/profile'],
                ],
                'subject' => 'Your digest',
                'body' => '<p>Hello {{name}},</p>{{figures}}<p>{{clear}}</p><p><a href="{{url}}">Change when your digest arrives</a></p>',
            ],
```

- [ ] **Step 5: `SendDigests` and the schedule**

```php
<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Notifications\StaffDigest;
use App\Support\Alerts\StaffPreferences;
use App\Support\Digest\DigestBuilder;
use App\Support\Notifier;
use Illuminate\Console\Command;

/** Hourly (docs/digest-alerts.md): each person's digest, at their hour, once a day. */
class SendDigests extends Command
{
    protected $signature = 'technoware:send-digests';

    protected $description = 'Send each staff member their digest when it is due';

    public function handle(): int
    {
        $sent = 0;
        foreach (User::query()->where('is_active', true)->with(['roles', 'staffPreference'])->get() as $user) {
            $prefs = StaffPreferences::for($user);
            if (! DigestBuilder::due($prefs, now()) || $prefs->last_digest_at?->isSameDay(now())) {
                continue;
            }
            $digest = DigestBuilder::build($user, $prefs->last_digest_figures);
            $prefs->last_digest_at = now();
            if (! ($digest->allZero && $prefs->digest_skip_quiet)) {
                Notifier::send($user, new StaffDigest($digest));
                $prefs->last_digest_figures = $digest->figures();
                $sent++;
            }
            $prefs->save(); // stamped first time round too: saving an unsaved default row is how "once a day" holds
        }
        $this->info("{$sent} digests sent.");

        return self::SUCCESS;
    }
}
```

`isSameDay` compares in the app timezone; `now()` is already in it.

In `routes/console.php`:

```php
Schedule::command('technoware:send-digests')->hourlyAt(5)->withoutOverlapping();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php artisan test --filter="StaffDigestTest|MailTemplateTest"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
./vendor/bin/pint app routes tests
composer analyse
git add api/app/Support/Digest api/app/Notifications/StaffDigest.php api/app/Console/Commands/SendDigests.php api/app/Support/Mail/MessageCatalogueEntries.php api/routes/console.php api/tests/Feature/StaffDigestTest.php
git commit -m "Digest and alerts: the digest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The endpoints

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/NotificationsController.php`
- Create: `api/app/Http/Controllers/Api/V1/Admin/StaffPushController.php`
- Modify: `api/routes/api/admin-auth.php`
- Modify: `API.md` (new section "Admin — digest and alerts", after "Admin — AI images")
- Test: `api/tests/Feature/NotificationPreferencesTest.php`

**Interfaces:**
- Consumes: `StaffPreferences::for`, `Rules::forUser`, `AlertSettings::enabled`, `DigestBuilder::build`, `StaffDigest`, `AlertCheck::deliver`, `AlertHit`, `MessageChannel::Push->ready()`.
- Produces (wire shapes for Task 6):
  - `GET /admin/notifications/preferences[?user=]` → `{data: {digest, digest_hour, digest_weekday, digest_skip_quiet, alerts: {<rule>: bool}, alert_email, alert_push, quiet_start, quiet_end, last_digest_at}, meta: {user: {id, name}, self: bool, rules: [{key, label, threshold_label, site_enabled}], push_live: bool, browsers: [{id, label, last_seen_at, failed: bool}], digests: [{value, label}]}}`
  - `PATCH` takes the same `data` fields and answers the same shape
  - `POST /admin/notifications/digest/send` → 202 `{message}`
  - `POST /admin/notifications/alerts/test` → 202 `{message}`
  - `POST /admin/push/subscribe {token}` → 200 `{data: {id, label, last_seen_at, failed}}`
  - `DELETE /admin/push/{id}` → 204

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\StaffPreference;
use App\Models\StaffPushSubscription;
use App\Notifications\StaffAlerts;
use App\Notifications\StaffDigest;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class NotificationPreferencesTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
    }

    public function test_a_person_reads_the_defaults_and_their_own_rules(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/notifications/preferences')
            ->assertOk()
            ->assertJsonPath('data.digest', 'weekly')
            ->assertJsonPath('data.alerts', ['ticket_critical_unassigned' => true, 'ticket_overdue' => true])
            ->assertJsonPath('meta.rules.0.threshold_label', 'after 30 minutes')
            ->assertJsonPath('meta.self', true)
            ->assertJsonPath('meta.push_live', false);
    }

    public function test_saving_writes_a_row_and_answers_it(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($user, 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', [
                'digest' => 'daily', 'digest_hour' => 9, 'alerts' => ['ticket_overdue' => false],
                'quiet_start' => '22:00', 'quiet_end' => '07:00', 'alert_push' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.digest', 'daily')
            ->assertJsonPath('data.alerts.ticket_overdue', false)
            ->assertJsonPath('data.alerts.ticket_critical_unassigned', true);

        $this->assertSame(9, StaffPreference::where('user_id', $user->id)->value('digest_hour'));
    }

    public function test_an_alert_outside_the_persons_rules_is_refused(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', ['alerts' => ['backup_failed' => true]])
            ->assertStatus(422)->assertJsonValidationErrors('alerts');
    }

    public function test_bad_values_are_refused(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', ['digest' => 'hourly', 'digest_hour' => 24, 'quiet_start' => '25:00'])
            ->assertStatus(422)->assertJsonValidationErrors(['digest', 'digest_hour', 'quiet_start']);
    }

    public function test_an_administrator_may_read_and_change_somebody_else(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences?user='.$support->id, ['digest' => 'off'])
            ->assertOk()->assertJsonPath('meta.self', false)->assertJsonPath('meta.user.id', $support->id);

        $this->assertSame('off', StaffPreference::where('user_id', $support->id)->value('digest'));
    }

    public function test_nobody_else_may_address_another_person(): void
    {
        $other = $this->staff(RoleEnum::SupportEngineer, 'b');
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/notifications/preferences?user='.$other->id)->assertForbidden();
    }

    public function test_the_two_send_buttons_reach_only_the_caller(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($support, 'sanctum')->postJson('/api/v1/admin/notifications/digest/send')->assertStatus(202);
        $this->actingAs($support, 'sanctum')->postJson('/api/v1/admin/notifications/alerts/test')->assertStatus(202);

        Notification::assertSentTo($support, StaffDigest::class);
        Notification::assertSentTo($support, StaffAlerts::class);
        $this->assertNull(StaffPreference::where('user_id', $support->id)->value('last_digest_at'));
    }

    public function test_subscribing_needs_push_set_up_and_a_browser_is_removed_only_by_its_owner(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/push/subscribe', ['token' => str_repeat('a', 40)])
            ->assertStatus(422)->assertJsonValidationErrors('token');

        $mine = StaffPushSubscription::create(['user_id' => $user->id, 'token' => str_repeat('m', 40)]);
        $theirs = StaffPushSubscription::create(['user_id' => $this->staff(RoleEnum::SupportEngineer, 'b')->id, 'token' => str_repeat('t', 40)]);

        $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/admin/push/'.$theirs->id)->assertNotFound();
        $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/admin/push/'.$mine->id)->assertNoContent();
        $this->assertSame(1, StaffPushSubscription::count());
    }

    public function test_a_customer_token_is_refused(): void
    {
        $this->getJson('/api/v1/admin/notifications/preferences')->assertUnauthorized();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=NotificationPreferencesTest`
Expected: FAIL — 404 on the route.

- [ ] **Step 3: `NotificationsController`**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\StaffPreference;
use App\Models\StaffPushSubscription;
use App\Models\User;
use App\Notifications\StaffDigest;
use App\Support\Alerts\AlertCheck;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\Rules;
use App\Support\Alerts\StaffPreferences;
use App\Support\Digest\DigestBuilder;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Digest and alert choices (docs/digest-alerts.md). Staff-wide; the caller's
 * own, or, for an administrator, anybody's through `?user=`.
 */
class NotificationsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return $this->answer($request, $this->target($request));
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->target($request);
        $keys = array_map(fn (AlertRule $r) => $r->key(), Rules::forUser($user));
        $data = $request->validate([
            'digest' => ['sometimes', 'in:'.implode(',', AlertSettings::DIGESTS)],
            'digest_hour' => ['sometimes', 'integer', 'between:0,23'],
            'digest_weekday' => ['sometimes', 'integer', 'between:1,7'],
            'digest_skip_quiet' => ['sometimes', 'boolean'],
            'alerts' => ['sometimes', 'array'],
            'alerts.*' => ['boolean'],
            'alert_email' => ['sometimes', 'boolean'],
            'alert_push' => ['sometimes', 'boolean'],
            'quiet_start' => ['sometimes', 'date_format:H:i'],
            'quiet_end' => ['sometimes', 'date_format:H:i'],
        ]);
        if (isset($data['alerts']) && ($stray = array_diff(array_keys($data['alerts']), $keys)) !== []) {
            throw ValidationException::withMessages(['alerts' => 'These alerts are not this person’s: '.implode(', ', $stray).'.']);
        }

        $prefs = StaffPreferences::for($user);
        if (isset($data['alerts'])) {
            $data['alerts'] = array_merge($prefs->alerts ?? [], array_map('boolval', $data['alerts']));
        }
        $prefs->fill($data)->save();

        return $this->answer($request, $user->fresh(['roles', 'staffPreference']));
    }

    public function sendDigest(Request $request): JsonResponse
    {
        $user = $request->user();
        Notifier::send($user, new StaffDigest(DigestBuilder::build($user, StaffPreferences::for($user)->last_digest_figures)));

        return response()->json(['message' => 'Your digest is on its way.'], 202);
    }

    public function testAlert(Request $request): JsonResponse
    {
        $user = $request->user();
        AlertCheck::deliver($user, StaffPreferences::for($user), [
            ['rule' => 'test', 'hit' => new AlertHit('test', 'This is a test alert. Real ones name a ticket, an order or a lead.', '/admin/profile')],
        ], respectQuiet: false);

        return response()->json(['message' => 'A test alert is on its way.'], 202);
    }

    private function target(Request $request): User
    {
        $me = $request->user();
        if (! $request->filled('user') || (int) $request->query('user') === $me->id) {
            return $me->loadMissing(['roles', 'staffPreference']);
        }
        abort_unless($me->isAdmin(), 403);

        return User::query()->with(['roles', 'staffPreference'])->findOrFail((int) $request->query('user'));
    }

    private function answer(Request $request, User $user): JsonResponse
    {
        $prefs = StaffPreferences::for($user);
        $rules = Rules::forUser($user);

        return response()->json([
            'data' => [
                'digest' => $prefs->digest,
                'digest_hour' => $prefs->digest_hour,
                'digest_weekday' => $prefs->digest_weekday,
                'digest_skip_quiet' => $prefs->digest_skip_quiet,
                'alerts' => (object) collect($rules)->mapWithKeys(fn (AlertRule $r) => [$r->key() => $prefs->wantsAlert($r->key())])->all(),
                'alert_email' => $prefs->alert_email,
                'alert_push' => $prefs->alert_push,
                'quiet_start' => $prefs->quiet_start,
                'quiet_end' => $prefs->quiet_end,
                'last_digest_at' => $prefs->last_digest_at?->toIso8601String(),
            ],
            'meta' => [
                'user' => ['id' => $user->id, 'name' => $user->name],
                'self' => $user->id === $request->user()->id,
                'rules' => array_map(fn (AlertRule $r) => [
                    'key' => $r->key(), 'label' => $r->label(), 'threshold_label' => $r->thresholdLabel(),
                    'site_enabled' => AlertSettings::enabled($r->key()),
                ], $rules),
                'push_live' => MessageChannel::Push->ready(),
                'browsers' => StaffPushSubscription::query()->where('user_id', $user->id)->latest()->get()
                    ->map(fn (StaffPushSubscription $s) => [
                        'id' => $s->id, 'label' => $s->label, 'last_seen_at' => $s->last_seen_at?->toIso8601String(), 'failed' => $s->failed_at !== null,
                    ])->all(),
                'digests' => array_map(fn (array $o) => ['value' => $o['value'], 'label' => $o['label']], AlertSettings::DIGEST_OPTIONS),
            ],
        ]);
    }
}
```

`(object)` keeps an empty `alerts` serialising as `{}`, not `[]`. Leave `assertJsonPath('data.alerts', [...])` as written, since an associative array compares equal.

- [ ] **Step 4: `StaffPushController`**

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\StaffPushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/** A staff member's browsers for alerts (docs/digest-alerts.md). */
class StaffPushController extends Controller
{
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'min:20', 'max:512']]);
        if (! MessageChannel::Push->ready()) {
            throw ValidationException::withMessages(['token' => 'Browser notifications are not set up on this site.']);
        }

        $sub = StaffPushSubscription::query()->updateOrCreate(
            ['token' => $data['token']],
            ['user_id' => $request->user()->id, 'label' => self::label((string) $request->userAgent()), 'last_seen_at' => now(), 'failed_at' => null],
        );

        return response()->json(['data' => [
            'id' => $sub->id, 'label' => $sub->label, 'last_seen_at' => $sub->last_seen_at?->toIso8601String(), 'failed' => false,
        ]]);
    }

    public function destroy(Request $request, int $id): Response
    {
        StaffPushSubscription::query()->where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->noContent();
    }

    /** "Chrome on Windows" — enough to tell two browsers apart; never the whole agent string. */
    private static function label(string $agent): string
    {
        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Edge', str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'Chrome/') => 'Chrome', str_contains($agent, 'Safari/') => 'Safari', default => 'A browser',
        };
        $os = match (true) {
            str_contains($agent, 'Android') => 'Android', str_contains($agent, 'iPhone') || str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Windows') => 'Windows', str_contains($agent, 'Mac OS') => 'macOS', str_contains($agent, 'Linux') => 'Linux',
            default => 'an unknown system',
        };

        return "{$browser} on {$os}";
    }
}
```

- [ ] **Step 5: Routes**

In `routes/api/admin-auth.php`, after the writing routes:

```php
/*
 * Digest and alerts (0.185.0, docs/digest-alerts.md). Staff-wide: everybody
 * chooses their own; the controller lets an administrator address anybody.
 */
Route::get('notifications/preferences', [NotificationsController::class, 'show'])->name('notifications.show');
Route::patch('notifications/preferences', [NotificationsController::class, 'update'])->name('notifications.update');
Route::post('notifications/digest/send', [NotificationsController::class, 'sendDigest'])->middleware('throttle:6,1')->name('notifications.digest');
Route::post('notifications/alerts/test', [NotificationsController::class, 'testAlert'])->middleware('throttle:6,1')->name('notifications.test');
Route::post('push/subscribe', [StaffPushController::class, 'subscribe'])->middleware('throttle:20,1')->name('push.subscribe');
Route::delete('push/{id}', [StaffPushController::class, 'destroy'])->whereNumber('id')->name('push.destroy');
```

Import both controllers at the top of the file.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php artisan test --filter="NotificationPreferencesTest|RateLimitScopeTest"`
Expected: PASS.

- [ ] **Step 7: API.md**

Add a section **"## Admin — digest and alerts"** after "## Admin — AI images". It needs a table of the six routes above (method, path, notes); the full `GET` answer shape from Interfaces; the rules (an `alerts` key outside the person's rules is a 422 on `alerts`, `?user=` is an administrator's alone or a 403, a browser not yours is a 404); `push/subscribe` refused on `token` while push is not set up; the two sends reaching only the caller and the digest send not touching `last_digest_*`. Then a paragraph on the private `alerts` settings group: `alerts_default_digest` (`off`/`daily`/`weekly`, default weekly, offered as `options`), `alert_<rule>_enabled` for the eight keys (on), and the six thresholds with their default and range from `AlertSettings::THRESHOLDS`, each a 422 on its row outside the range. Then a paragraph on the commands: `technoware:check-alerts` every five minutes, `technoware:send-digests` hourly at :05, `technoware:prune-alert-fires` at 03:25. Finally, add the two emails (`staff_alerts`, `staff_digest`) to the Notifications table.

- [ ] **Step 8: Commit**

```bash
./vendor/bin/pint app routes tests
composer analyse
git add api/app/Http/Controllers/Api/V1/Admin/NotificationsController.php api/app/Http/Controllers/Api/V1/Admin/StaffPushController.php api/routes/api/admin-auth.php api/tests/Feature/NotificationPreferencesTest.php API.md
git commit -m "Digest and alerts: the preferences and push endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The console

**Files:**
- Create: `web/src/types/notifications.ts`
- Create: `web/src/lib/admin/notifications.ts` (and re-export from `web/src/lib/admin/index.ts`)
- Create: `web/src/app/admin/(app)/profile/notifications-actions.ts`
- Create: `web/src/components/admin/notifications-panel.tsx`
- Modify: `web/src/app/admin/(app)/profile/page.tsx`, `web/src/app/admin/(app)/users/[id]/page.tsx`
- Modify: `web/src/app/admin/(app)/settings/settings-copy.ts` (labels, group copy, order, the Settings screen's sections)
- Modify: `web/mock-api.mjs`
- Create: `web/scripts/probes/notifications.mjs`

**Interfaces:**
- Consumes: the wire shapes in Task 5's Interfaces.
- Produces: `NotificationsPanel({prefs, meta, pushConfig})`, where `pushConfig: PushConfig | null` comes from `pushConfigFrom(settings)` in `lib/push.ts`.

- [ ] **Step 1: Types and the server module**

`web/src/types/notifications.ts`:

```ts
export type NotificationPrefs = {
  digest: "off" | "daily" | "weekly";
  digest_hour: number;
  digest_weekday: number;
  digest_skip_quiet: boolean;
  alerts: Record<string, boolean>;
  alert_email: boolean;
  alert_push: boolean;
  quiet_start: string;
  quiet_end: string;
  last_digest_at: string | null;
};

export type NotificationRule = { key: string; label: string; threshold_label: string | null; site_enabled: boolean };
export type StaffBrowser = { id: number; label: string | null; last_seen_at: string | null; failed: boolean };

export type NotificationMeta = {
  user: { id: number; name: string };
  self: boolean;
  rules: NotificationRule[];
  push_live: boolean;
  browsers: StaffBrowser[];
  digests: { value: string; label: string }[];
};

export type NotificationSettings = { data: NotificationPrefs; meta: NotificationMeta };
```

`web/src/lib/admin/notifications.ts`:

```ts
import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { NotificationPrefs, NotificationSettings } from "@/types/notifications";

const path = (userId?: number) => `/admin/notifications/preferences${userId ? `?user=${userId}` : ""}`;

export async function getNotificationSettings(userId?: number): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>(path(userId), { token: await token() });
}

export async function saveNotificationSettings(
  body: Partial<NotificationPrefs>, userId?: number,
): Promise<{ ok: true; settings: NotificationSettings } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  try {
    return { ok: true, settings: await apiFetch<NotificationSettings>(path(userId), { method: "PATCH", body, token: await token() }) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { ok: false, error: error.message, fieldErrors: error.errors ?? undefined };
    }
    throw error;
  }
}

export async function sendTestDigest(): Promise<string> {
  return (await apiFetch<{ message: string }>("/admin/notifications/digest/send", { method: "POST", token: await token() })).message;
}

export async function sendTestAlert(): Promise<string> {
  return (await apiFetch<{ message: string }>("/admin/notifications/alerts/test", { method: "POST", token: await token() })).message;
}

export async function subscribeStaffPush(pushToken: string): Promise<void> {
  await apiFetch("/admin/push/subscribe", { method: "POST", body: { token: pushToken }, token: await token() });
}

export async function removeStaffPush(id: number): Promise<void> {
  await apiFetch(`/admin/push/${id}`, { method: "DELETE", token: await token() });
}
```

Check `ApiError`'s field names against `src/lib/api.ts` (`errors`, `message`, `status`) and match them. Add `export * from "./notifications";` to `lib/admin/index.ts`.

- [ ] **Step 2: Server Actions**

`web/src/app/admin/(app)/profile/notifications-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { removeStaffPush, saveNotificationSettings, sendTestAlert, sendTestDigest, subscribeStaffPush } from "@/lib/admin";
import type { NotificationPrefs } from "@/types/notifications";

export type NotificationsState = { ok?: string; error?: string; fieldErrors?: Record<string, string[]> };

const bool = (form: FormData, key: string) => form.get(key) === "1";

export async function saveNotificationsAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const userId = Number(form.get("user_id")) || undefined;
  const alerts: Record<string, boolean> = {};
  for (const key of form.getAll("alert_keys").map(String)) alerts[key] = bool(form, `alert__${key}`);

  const body: Partial<NotificationPrefs> = {
    digest: String(form.get("digest")) as NotificationPrefs["digest"],
    digest_hour: Number(form.get("digest_hour")),
    digest_weekday: Number(form.get("digest_weekday")),
    digest_skip_quiet: bool(form, "digest_skip_quiet"),
    alerts,
    alert_email: bool(form, "alert_email"),
    alert_push: bool(form, "alert_push"),
    quiet_start: String(form.get("quiet_start")),
    quiet_end: String(form.get("quiet_end")),
  };
  const result = await saveNotificationSettings(body, userId);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath(userId ? `/admin/users/${userId}` : "/admin/profile");

  return { ok: "Saved." };
}

export async function sendTestDigestAction(): Promise<string> { return sendTestDigest(); }
export async function sendTestAlertAction(): Promise<string> { return sendTestAlert(); }

export async function subscribePushAction(pushToken: string): Promise<void> {
  await subscribeStaffPush(pushToken);
  revalidatePath("/admin/profile");
}

export async function removePushAction(id: number): Promise<void> {
  await removeStaffPush(id);
  revalidatePath("/admin/profile");
}
```

- [ ] **Step 3: The panel**

`web/src/components/admin/notifications-panel.tsx` (client) draws:

1. A `<Form action={saveNotificationsAction} state={state}>` (`components/ui/form.tsx`) containing:
   - a hidden `user_id` (when `!meta.self`);
   - **Digest**: a `Select` named `digest` from `meta.digests` (on a `Field` with `variant="float-static"`); a `Select` named `digest_hour` with 24 options labelled "08:00" and so on; a `Select` named `digest_weekday` (Monday–Sunday, values 1–7), drawn only while digest is weekly (`useState` from `prefs.digest`; keep it mounted but `hidden` when not weekly, so the value still posts); a `RecordSwitch` named `digest_skip_quiet` labelled "Skip a day when everything is zero".
   - **Alerts**: per `meta.rules`, a hidden `alert_keys` input carrying the key and a `RecordSwitch` named `alert__<key>` labelled with `rule.label` and, under it, a hint "`threshold_label`" when there is one. When `!rule.site_enabled` the hint reads "Switched off for everybody in Settings → Alerts." and the switch is `disabled`.
   - **How**: `RecordSwitch` `alert_email` ("Email"), `RecordSwitch` `alert_push` ("Browser notifications"), and two `Input type="time"` fields `quiet_start` and `quiet_end` under "Quiet hours for browser notifications (email still arrives)".
   - `FormActions` with the submit "Save notification settings".
2. Outside the form (never inside it — these are `type="button"`):
   - **This browser** (only when `meta.self && pushConfig !== null`): a button "Get alerts in this browser". On press it `await import("@/lib/push-client")`, calls `subscribe(pushConfig)`, passes the token to `subscribePushAction(token)`, and shows the client's thrown sentence in an inline `Alert` on failure. When `pushConfig` is null, it shows one muted line: "Browser notifications are not set up on this site."
   - **Browsers**: the `meta.browsers` list (label, "Last seen" through `lib/dates.ts`, a "Not reachable" `Badge` when `failed`), each with a "Remove" button calling `removePushAction(id)` (only when `meta.self`). Remove **never** calls `unsubscribe()`.
   - **Try it** (only when `meta.self`): "Send me today's digest" and "Send a test alert", each a `Button pending` showing the returned sentence as a toast or an ok `Alert`.

Glyphs come only from `@/components/icons-ui`. Use no `toLocaleString`. Every boolean is a `RecordSwitch` (`components/admin/record-switch.tsx`). Every select goes through `Select`.

- [ ] **Step 4: Mount it**

In `profile/page.tsx`, after the password card:

```tsx
      <Card as="section" interactive={false} padding="md" className="mt-6">
        <h2 className="mb-1 text-15 font-semibold">Notifications</h2>
        <p className="measure mb-5 text-13 text-muted">
          A digest of what needs you, and an alert the moment something does. Email always; browser notifications when you want them.
        </p>
        <NotificationsPanel prefs={notifications.data} meta={notifications.meta} pushConfig={pushConfigFrom(settings)} />
      </Card>
```

Fetch `notifications` with `getNotificationSettings()` and `settings` with the public settings reader the console already uses (`getSiteSettings()` from `@/lib/settings`; check its exported name). Guard the fetch with `.catch(() => null)` and draw nothing when it fails.

In `users/[id]/page.tsx`, below `StaffForm`, draw the same card with `getNotificationSettings(numericId)` and `pushConfig={null}` (an administrator cannot subscribe somebody else's browser). Title it "Notifications".

- [ ] **Step 5: Settings → Alerts**

In `settings-copy.ts`:
- Labels:
  - `alerts_default_digest`: "Digest for new staff".
  - One per rule switch, e.g. `alert_ticket_critical_unassigned_enabled`: "Alert: a critical ticket nobody has taken".
  - One per threshold:
    - `alert_ticket_critical_minutes`: "…after (minutes)".
    - `alert_lead_hot_hours`: "A hot lead with no reply — after (hours)".
    - `alert_order_dispatch_days`: "A paid order not sent — after (days)".
    - `alert_return_days`: "A return not answered — after (days)".
    - `alert_mail_minutes`: "Email not leaving — after (minutes)".
    - `alert_health_points`: "Health score fell by (points)".
  - Hints give the ranges.
- A group entry `alerts: { title: "Alerts and digests", blurb: "Which alerts the console sends, after how long, and the digest new staff start with. Each person chooses their own on their profile; an administrator can change anybody's on the Staff screen." }`.
- An order entry listing the 15 keys, with each rule's switch followed by its threshold.
- Add `{ label: "Notifications", groups: ["alerts"] }` to the `/admin/settings` screen's sections.

Then run `php artisan test --filter=SettingsScreensTest` from `api/`. It must now pass.

- [ ] **Step 6: The mock**

In `web/mock-api.mjs`, beside the writing routes, answer:
- `GET /admin/notifications/preferences` with the defaults from Task 5's shape: two support rules, `push_live: false`, no browsers, the three digests.
- `PATCH` by echoing the merged body.
- `POST …/digest/send` and `…/alerts/test` with 202 and a message.
- `POST /admin/push/subscribe` with a 422 (`errors.token`).

Afterwards check `git diff --stat web/mock-api.mjs` stays small, and restore the one stray `\r\r\n` byte if the Edit tool normalised it.

- [ ] **Step 7: The probe**

`web/scripts/probes/notifications.mjs` follows the shape of the other probes: a docblock, `BASE`, and sign-in through `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`. It opens `/admin/profile`, finds the "Notifications" heading, switches "Skip a day when everything is zero", changes the hour, saves, reloads, and checks both stuck. With push not live it checks that "Get alerts in this browser" is absent and the "not set up" line is present. It **never** presses the two send buttons, and exits non-zero on any failure.

- [ ] **Step 8: Verify**

From `web/`: `npx tsc --noEmit`, `npm run lint`, then run the probe and the audits against `npm run dev` with a throwaway administrator:

```bash
cd api
php artisan tinker --execute="\$u=\App\Models\User::create(['name'=>'Audit','email'=>'audit-b6@example.test','phone'=>'9876543210','password'=>'Audit-b6-pass!','is_active'=>true]); \$u->roles()->sync([\App\Models\Role::where('slug','admin')->value('id')]); echo \$u->id;"
cd ../web
ADMIN_LOGIN_EMAIL=audit-b6@example.test ADMIN_LOGIN_PASSWORD='Audit-b6-pass!' node scripts/probes/notifications.mjs
MSYS_NO_PATHCONV=1 ADMIN_LOGIN_EMAIL=audit-b6@example.test ADMIN_LOGIN_PASSWORD='Audit-b6-pass!' node scripts/audit.mjs /admin/profile /admin/settings
MSYS_NO_PATHCONV=1 AUDIT_SCHEME=dark ADMIN_LOGIN_EMAIL=audit-b6@example.test ADMIN_LOGIN_PASSWORD='Audit-b6-pass!' node scripts/audit.mjs /admin/profile
MSYS_NO_PATHCONV=1 ADMIN_LOGIN_EMAIL=audit-b6@example.test ADMIN_LOGIN_PASSWORD='Audit-b6-pass!' node scripts/mobile-audit.mjs /admin/profile
cd ../api
php artisan tinker --execute="\App\Models\User::where('email','audit-b6@example.test')->delete();"
```

Expected: probe ok, every audit 0 failures. Add `/admin/profile` to both audit scripts' route lists if it is not already there. Check the staff account screen with the audits too, on the throwaway account's own id.

- [ ] **Step 9: Commit**

```bash
git add web/src/types/notifications.ts web/src/lib/admin/notifications.ts web/src/lib/admin/index.ts "web/src/app/admin/(app)/profile" "web/src/app/admin/(app)/users/[id]/page.tsx" web/src/components/admin/notifications-panel.tsx "web/src/app/admin/(app)/settings/settings-copy.ts" web/mock-api.mjs web/scripts/probes/notifications.mjs
git commit -m "Digest and alerts: the notifications panel, Settings → Alerts and the mock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs and the release

**Files:**
- Create: `docs/digest-alerts.md`, `manual/35-digest-and-alerts.md`
- Modify: `CLAUDE.md` (Modules contents line + module block), `manual/README.md` (a row), `web/src/content/help.json` (regenerated), `web/src/lib/help-routes.ts` (`/admin/profile` → the new chapter's section if the profile is not already mapped), `VERSION.md`, `web/src/lib/version.ts`

- [ ] **Step 1: `docs/digest-alerts.md`**

The module note, in the style of `docs/ai-images.md`. Cover:
- what it does;
- the eight rules, each with its scope and threshold;
- once per thing and the re-arm (one row per rule, subject and person, `updateOrCreate`);
- the check's order (clear before deliver, fires written before sending);
- push being separate from `message_contacts`, and why Remove never unsubscribes the browser;
- quiet hours being push only;
- the digest being the copilot's figures, with the change only for whole numbers, zeros stored so 0 → 3 reads "up 3", and once a day by `last_digest_at`;
- what leaves the server;
- the settings group;
- the commands and their times;
- known limits: no Slack or WhatsApp, no editor-defined alerts, an alert batch capped at 50 lines per rule, push not driven against a real Firebase account here.

- [ ] **Step 2: CLAUDE.md**

Under "Modules" in the contents list, add `  - Digest and alerts — \`docs/digest-alerts.md\``. After the "AI images" block, add a block:

```markdown
### Digest and alerts — `docs/digest-alerts.md`

A scheduled digest of each person's copilot figures and immediate alerts by email and browser push (0.185.0).

- The digest is `Copilot\Questions::for()` and nothing else: every figure, sentence and link is the copilot's; a change ("up 3") only for a whole number, against the figures the last digest stored (zeros included); once a day by `last_digest_at`, at the person's hour (`technoware:send-digests`, hourly at :05).
- Eight fixed `AlertRule`s in `App\Support\Alerts\Rules`, each reading the scope its screen uses; a line names a record by reference, never a customer's contact details or words. `alert_fires` is one row per (rule, subject, person), re-armed by `updateOrCreate` — MySQL has no partial unique index; the check clears what has gone before it delivers, writes the fires before it sends, and a rule that throws skips only itself (`technoware:check-alerts`, every five minutes).
- Staff push is `staff_push_subscriptions`, never `message_contacts`; Remove deletes the row and never calls `unsubscribe()`, because a customer subscription in the same browser shares the token. Quiet hours hold back push, never email. `hasRole()` does not pass an administrator: `Rules::holds()` checks `isAdmin()` first.
```

- [ ] **Step 3: The manual chapter and help**

`manual/35-digest-and-alerts.md`, written for the client's staff:
- Choosing your digest.
- The alerts and what each means.
- Getting alerts in this browser, and what quiet hours do.
- For administrators: Settings → Alerts and changing someone else's on the Staff screen.

Add its row to `manual/README.md`. Then run `npm run help` from `web/` and check `node scripts/build-help.mjs --check` passes. Map `/admin/profile` in `lib/help-routes.ts` to the new chapter's first section id, and run `node scripts/help-routes.check.mjs`.

- [ ] **Step 4: Version**

Bump `VERSION.md` and `web/src/lib/version.ts` to `0.185.0` with a changelog entry in the house style.

- [ ] **Step 5: The full suite**

Run, from `api/` (one process only): `php artisan test`
Expected: all green, apart from the one skip that already exists. From `web/`: `npx tsc --noEmit` and `npm run lint`, both clean.

- [ ] **Step 6: Commit**

```bash
git add docs/digest-alerts.md manual CLAUDE.md VERSION.md web/src/lib/version.ts web/src/content/help.json web/src/lib/help-routes.ts
git commit -m "0.185.0: digest and alerts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
