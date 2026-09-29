<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Models\VisitRequest;
use App\Support\InboundMail\ReplyParser;
use App\Support\References;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The prefixes on ticket, visit and order numbers are settings
 * (App\Support\References), for a product sold under other companies' names.
 *
 * What is pinned is what a customer would notice going wrong: a new prefix
 * applies to new numbers only; one that could not be parsed is refused on
 * write and ignored on read; and a reply quoting a number from before the
 * change still finds its ticket, while an order number in the same subject
 * is never taken for one.
 */
class ReferencePrefixTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function admin(): User
    {
        $user = User::firstOrCreate(['email' => 'ada@example.test'], ['name' => 'Ada', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        return $user;
    }

    private function ticket(): Ticket
    {
        $customer = Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        return Ticket::create([
            'customer_id' => $customer->id, 'ticket_category_id' => $category->id,
            'subject' => 'Switch down', 'description' => 'The core switch is down.',
            'status' => TicketStatus::Open, 'priority' => 'normal',
        ]);
    }

    /** @param array<string, string> $values */
    private function save(array $values): TestResponse
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => array_map(fn ($k, $v) => ['key' => $k, 'value' => $v], array_keys($values), $values),
        ]);
    }

    public function test_the_defaults_are_the_numbers_already_issued(): void
    {
        $year = now()->year;

        $this->assertSame("TW-{$year}-00001", Ticket::nextReference());
        $this->assertSame("TV-{$year}-00001", VisitRequest::nextReference());
        $this->assertSame("ORD-{$year}-00001", Order::nextNumber());
    }

    public function test_a_new_prefix_applies_to_new_numbers_and_the_old_ones_keep_theirs(): void
    {
        $year = now()->year;
        $old = $this->ticket();
        $this->assertSame("TW-{$year}-00001", $old->reference);

        // Typed in lower case, read back upper.
        $this->save(['ticket_reference_prefix' => 'ab', 'visit_reference_prefix' => 'abv', 'order_number_prefix' => 'shop'])->assertOk();

        $new = $this->ticket();
        $this->assertSame("AB-{$year}-00001", $new->reference);
        $this->assertSame("TW-{$year}-00001", $old->fresh()->reference);
        $this->assertSame("ABV-{$year}-00001", VisitRequest::nextReference());
        $this->assertSame("SHOP-{$year}-00001", Order::nextNumber());

        // Both are still reachable by their numbers.
        $this->actingAs($this->admin(), 'sanctum');
        $this->assertSame($old->id, Ticket::where('reference', "TW-{$year}-00001")->value('id'));
    }

    public function test_a_prefix_that_could_not_be_parsed_is_refused_and_a_bad_row_is_ignored(): void
    {
        foreach (['A', 'TOOLONGX', '1AB', 'A-B', 'AB C'] as $bad) {
            $this->save(['ticket_reference_prefix' => $bad])->assertStatus(422);
        }

        // A row written behind the console's back falls back to the default.
        Setting::query()->where('key', 'ticket_reference_prefix')->update(['value' => 'no good!']);
        Setting::flushCache();
        $this->assertSame('TW', References::ticket());
    }

    public function test_a_reply_quoting_an_old_number_still_finds_its_ticket_and_an_order_number_does_not(): void
    {
        $year = now()->year;
        $this->ticket(); // TW-…-00001
        $this->save(['ticket_reference_prefix' => 'AB'])->assertOk();

        $prefixes = References::ticketPrefixes();
        $this->assertEqualsCanonicalizing(['AB', 'TW'], $prefixes);

        $this->assertSame("TW-{$year}-00001", ReplyParser::reference("Re: [TW-{$year}-00001] Switch down"));
        $this->assertSame("AB-{$year}-00002", ReplyParser::reference("Re: [ab-{$year}-00002] Printer"));
        $this->assertNull(ReplyParser::reference("Re: my order ORD-{$year}-00042 has not arrived"));
        $this->assertSame('Switch down', ReplyParser::withoutReference("Re: [TW-{$year}-00001] Switch down"));
    }

    public function test_initials_make_a_prefix(): void
    {
        $this->assertSame('AN', References::initialsOf('Acme Networks'));
        $this->assertSame('ATCS', References::initialsOf('Altis Tech Cloud Solutions Pvt Ltd'));
        $this->assertSame('TK', References::initialsOf('Zenith'));
        $this->assertSame('TK', References::initialsOf('   '));
    }
}
