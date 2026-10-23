<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\SuppressionReason;
use App\Models\ApiKey;
use App\Models\Lead;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\StockMovement;
use App\Models\StoreProduct;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** The `/ext` write endpoints: each goes through the site's own intake, never a raw insert. */
class ApiKeyWriteTest extends TestCase
{
    use RefreshDatabase;

    private ApiKey $apiKey;

    private function as(array $scopes): static
    {
        [$plain, $hash] = ApiKey::mint();
        $this->apiKey = ApiKey::create([
            'name' => 'ERP sync', 'prefix' => substr($plain, 0, 11), 'key_hash' => $hash, 'scopes' => $scopes,
        ]);

        return $this->withHeader('Authorization', 'Bearer '.$plain);
    }

    private function product(string $sku, array $extra = []): StoreProduct
    {
        return StoreProduct::create($extra + [
            'name' => 'Switch '.$sku, 'slug' => 'switch-'.strtolower($sku), 'sku' => $sku,
            'status' => PublishStatus::Published, 'price_paise' => 1000000, 'track_stock' => true, 'stock' => 1,
        ]);
    }

    private function setStock(array $items): TestResponse
    {
        return $this->as(['stock:write'])->putJson('/api/v1/ext/store/stock', ['items' => $items]);
    }

    public function test_a_lead_is_filed_with_channel_api_and_the_key_as_source(): void
    {
        $res = $this->as(['leads:write'])->postJson('/api/v1/ext/leads', [
            'name' => 'Asha', 'email' => 'asha@example.test', 'message' => 'Need a quote',
            '_source_url' => 'https://partner.example/landing?x=1',
        ])->assertCreated()->assertJsonPath('data.email', 'asha@example.test');

        $lead = Lead::findOrFail($res->json('data.id'));
        $this->assertSame('api', $lead->channel);
        $this->assertSame('api_key', $lead->source_type);
        $this->assertSame($this->apiKey->id, $lead->source_id);
        $this->assertSame('API: ERP sync', $lead->form_name);
        $this->assertSame('https://partner.example/landing?x=1', $lead->source_url);
    }

    public function test_a_lead_needs_an_email_or_a_phone(): void
    {
        $this->as(['leads:write'])->postJson('/api/v1/ext/leads', ['name' => 'Asha'])
            ->assertStatus(422)->assertJsonValidationErrors(['email']);
        $this->assertSame(0, Lead::count());

        $this->postJson('/api/v1/ext/leads', ['phone' => '+91 98765 43210'])->assertCreated();
    }

    public function test_a_subscriber_is_added_through_intake_and_a_suppressed_address_is_not(): void
    {
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $this->as(['subscribers:write'])->postJson('/api/v1/ext/subscribers', [
            'email' => 'New@Example.test', 'first_name' => 'Nia',
        ])->assertOk()->assertJsonPath('outcome', 'created')->assertJsonPath('data.email', 'new@example.test');

        $this->postJson('/api/v1/ext/subscribers', ['email' => 'gone@example.test'])
            ->assertOk()->assertJsonPath('outcome', 'suppressed')->assertJsonPath('data', null);
        $this->assertNull(NewsletterSubscriber::where('email', 'gone@example.test')->first());
    }

    public function test_the_derived_customers_group_cannot_be_joined(): void
    {
        $derived = NewsletterGroup::create(['name' => 'Whoever', 'slug' => 'whoever', 'source' => 'customers']);
        $plain = NewsletterGroup::create(['name' => 'General', 'slug' => 'general']);

        $this->as(['subscribers:write'])->postJson('/api/v1/ext/subscribers', [
            'email' => 'a@example.test', 'group_ids' => [$plain->id, $derived->id],
        ])->assertStatus(422)->assertJsonValidationErrors(['group_ids.1'])
            ->assertJsonMissingValidationErrors(['group_ids.0']);

        $this->postJson('/api/v1/ext/subscribers', ['email' => 'a@example.test', 'group_ids' => [$plain->id]])->assertOk();
    }

    public function test_stock_is_set_by_sku_and_recorded_in_the_ledger(): void
    {
        $plain = $this->product('SW-1', ['stock' => 2]);
        $parent = $this->product('SW-2', ['stock' => 0]);
        $variation = $parent->variations()->create(['name' => '24-port', 'sku' => 'SW-2-24', 'price_paise' => 1, 'stock' => 3, 'is_active' => true]);

        $this->setStock([['sku' => 'SW-1', 'stock' => 9], ['sku' => 'SW-2-24', 'stock' => 7]])
            ->assertOk()->assertExactJson(['updated' => ['SW-1', 'SW-2-24'], 'refused' => []]);

        $this->assertSame(9, $plain->fresh()->stock);
        $this->assertSame(7, $variation->fresh()->stock);
        $this->assertSame(2, StockMovement::where('note', 'like', '%API key "ERP sync"%')->count());
    }

    public function test_an_ambiguous_or_unknown_sku_is_refused_and_the_rest_applied(): void
    {
        $ok = $this->product('OK-1');
        $this->product('DUP-1');
        $other = $this->product('OTHER');
        $other->variations()->create(['name' => 'dup', 'sku' => 'DUP-1', 'price_paise' => 1, 'stock' => 1, 'is_active' => true]);
        $this->product('SVC-1', ['type' => 'digital']);
        $this->product('UNTRACKED', ['track_stock' => false]);

        $this->setStock([
            ['sku' => 'NOPE', 'stock' => 1], ['sku' => 'DUP-1', 'stock' => 1], ['sku' => 'SVC-1', 'stock' => 1],
            ['sku' => 'UNTRACKED', 'stock' => 1], ['sku' => 'OK-1', 'stock' => 5],
        ])->assertOk()->assertExactJson([
            'updated' => ['OK-1'],
            'refused' => [
                ['sku' => 'NOPE', 'message' => 'No product or option has that SKU.'],
                ['sku' => 'DUP-1', 'message' => 'That SKU is on more than one product.'],
                ['sku' => 'SVC-1', 'message' => 'That product does not count stock.'],
                ['sku' => 'UNTRACKED', 'message' => 'That product does not count stock.'],
            ],
        ]);
        $this->assertSame(5, $ok->fresh()->stock);
    }

    public function test_a_product_with_options_is_set_by_an_option_sku_only(): void
    {
        $parent = $this->product('PAR-1', ['stock' => 0]);
        $parent->variations()->create(['name' => 'a', 'sku' => 'PAR-1-A', 'price_paise' => 1, 'stock' => 3, 'is_active' => true]);

        $this->setStock([['sku' => 'PAR-1', 'stock' => 8]])->assertOk()
            ->assertJsonPath('updated', [])->assertJsonPath('refused.0.sku', 'PAR-1');
        $this->assertSame(0, $parent->fresh()->stock);
    }

    public function test_stock_input_is_validated(): void
    {
        $this->setStock([['sku' => 'A', 'stock' => -1]])->assertStatus(422)->assertJsonValidationErrors(['items.0.stock']);
        $this->setStock([['sku' => 'A', 'stock' => 1], ['sku' => 'A', 'stock' => 2]])->assertStatus(422);
    }

    public function test_writes_need_their_write_scope(): void
    {
        $this->as(['leads:read'])->postJson('/api/v1/ext/leads', ['email' => 'a@example.test'])
            ->assertForbidden();
        $this->postJson('/api/v1/ext/subscribers', ['email' => 'a@example.test'])->assertForbidden();
        $this->putJson('/api/v1/ext/store/stock', ['items' => [['sku' => 'A', 'stock' => 1]]])->assertForbidden();
        $this->assertSame(0, Lead::count());
    }
}
