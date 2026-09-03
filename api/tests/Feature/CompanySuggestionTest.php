<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Company names already on file, offered back on the registration form.
 *
 * What the tests pin is the *bound* rather than the feature: a prefix and not a
 * substring, a floor under how short a prefix may be, and a cap on how many
 * come back. Those three are the whole of what separates a spelling aid from a
 * way of reading the customer list, so each is control-run on its own.
 */
class CompanySuggestionTest extends TestCase
{
    use RefreshDatabase;

    private int $made = 0;

    private function customer(string $company): Customer
    {
        $this->made++;

        return Customer::create([
            'name' => 'Somebody '.$this->made,
            'email' => "person{$this->made}@example.test",
            'password' => 'password-for-tests',
            'company' => $company,
            'status' => CustomerStatus::Active,
        ]);
    }

    public function test_it_suggests_a_company_by_prefix(): void
    {
        $this->customer('Meridian Foods');

        $this->getJson('/api/v1/companies/suggest?q=mer')
            ->assertOk()
            ->assertExactJson(['data' => ['Meridian Foods']]);
    }

    /**
     * A prefix, never a substring.
     *
     * `%foods%` would let three characters sweep the middle of every name on
     * the list, which is a listing rather than a guess.
     */
    public function test_it_does_not_match_the_middle_of_a_name(): void
    {
        $this->customer('Meridian Foods');

        $this->getJson('/api/v1/companies/suggest?q=foods')
            ->assertOk()
            // Exact, not `assertJson`: that one matches a *subset*, so
            // `['data' => []]` is satisfied by a response full of names.
            ->assertExactJson(['data' => []]);
    }

    /** Two characters is not a guess somebody was already making. */
    public function test_a_short_term_returns_nothing(): void
    {
        $this->customer('Meridian Foods');

        $this->getJson('/api/v1/companies/suggest?q=me')
            ->assertOk()
            // Exact, not `assertJson`: that one matches a *subset*, so
            // `['data' => []]` is satisfied by a response full of names.
            ->assertExactJson(['data' => []]);
    }

    public function test_it_returns_at_most_five(): void
    {
        foreach (range(1, 8) as $n) {
            $this->customer("Acme Holdings {$n}");
        }

        $response = $this->getJson('/api/v1/companies/suggest?q=acme')->assertOk();

        $this->assertCount(5, $response->json('data'));
    }

    /**
     * A LIKE wildcard is a character somebody can type, and it means nothing
     * to them and everything to the query. Unescaped, `%` alone would be a
     * listing of the whole table.
     */
    public function test_a_wildcard_is_treated_as_a_character(): void
    {
        $this->customer('Meridian Foods');

        $this->getJson('/api/v1/companies/suggest?q=%25%25%25')
            ->assertOk()
            // Exact, not `assertJson`: that one matches a *subset*, so
            // `['data' => []]` is satisfied by a response full of names.
            ->assertExactJson(['data' => []]);
    }

    /** One name however many people from that firm have registered. */
    public function test_a_name_is_listed_once(): void
    {
        $this->customer('Meridian Foods');
        $this->customer('Meridian Foods');

        $this->assertSame(
            ['Meridian Foods'],
            $this->getJson('/api/v1/companies/suggest?q=meri')->json('data'),
        );
    }

    /** Names only — nothing that says who or how many is behind one. */
    public function test_it_returns_names_and_nothing_else(): void
    {
        $this->customer('Meridian Foods');

        $data = $this->getJson('/api/v1/companies/suggest?q=meri')->json('data');

        $this->assertSame(['Meridian Foods'], $data);
        $this->assertContainsOnly('string', $data);
    }
}
