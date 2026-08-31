<?php

namespace Tests\Feature;

use App\Enums\DigitalCodeStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\DigitalCode;
use App\Models\Media;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Notifications\ActivationProcedureIssued;
use App\Support\Store\ActivationProcedure;
use App\Support\Store\DigitalFulfilment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * How to use the licence you just bought.
 *
 * The rules worth pinning are the three where a plausible implementation is
 * quietly wrong: a blank override beating a good default, an email that
 * contains the code it must not contain, and a missing attachment taking the
 * whole delivery down with it.
 */
class ActivationProcedureTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Settings are defined by the seeder and cached, so a test writing one has
     * to create the row and drop the cache — `Setting::get()` reads
     * `all_cached()`, which is remembered for ever.
     */
    private function setting(string $key, ?string $value, string $type = 'text'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'store', 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A firewall licence', 'slug' => 'lic-'.uniqid(),
            'type' => ProductType::Digital, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => false, 'stock' => 0,
        ], $attributes));
    }

    private function paidOrder(StoreProduct $product, int $quantity = 1): Order
    {
        $order = Order::create([
            'order_number' => Order::nextNumber(),
            'status' => OrderStatus::Paid,
            'subtotal_paise' => 1180000, 'taxable_paise' => 1000000,
            'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(), 'paid_at' => now(),
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name, 'type' => ProductType::Digital,
            'quantity' => $quantity, 'unit_price_paise' => 1180000,
            'line_total_paise' => 1180000, 'returnable' => false,
        ]);

        foreach (range(1, $quantity) as $n) {
            DigitalCode::create([
                'store_product_id' => $product->id,
                'code' => 'KEY-'.$product->id.'-'.$n,
                'status' => DigitalCodeStatus::Available,
            ]);
        }

        return $order->fresh('items');
    }

    // ------------------------------------------------------ resolution

    /**
     * A blank override must not beat a good default.
     *
     * `??` only falls through on null, and a product edited and left blank
     * stores an empty string — so the naive version sends nothing at all to
     * every product somebody has opened. That is the newsletter footer's bug,
     * and it is why this uses `?:`.
     */
    public function test_a_blank_product_field_falls_through_to_the_default(): void
    {
        $this->setting('activation_procedure', '<p>Sign in and paste the key.</p>');

        $blank = $this->product(['activation_procedure' => '']);
        $null = $this->product(['activation_procedure' => null]);

        $this->assertSame('<p>Sign in and paste the key.</p>', ActivationProcedure::for($blank)['html']);
        $this->assertSame('<p>Sign in and paste the key.</p>', ActivationProcedure::for($null)['html']);
    }

    public function test_a_product_overrides_the_default_where_it_says_something(): void
    {
        $this->setting('activation_procedure', '<p>The usual steps.</p>');

        $product = $this->product(['activation_procedure' => '<p>These ones instead.</p>']);
        $resolved = ActivationProcedure::for($product);

        $this->assertSame('<p>These ones instead.</p>', $resolved['html']);
        $this->assertSame('product', $resolved['source']);
    }

    public function test_it_reports_when_there_is_nothing_at_all(): void
    {
        $resolved = ActivationProcedure::for($this->product());

        $this->assertNull($resolved['html']);
        $this->assertNull($resolved['pdf_path']);
        $this->assertSame('none', $resolved['source']);
        $this->assertFalse(ActivationProcedure::exists($this->product()));
    }

    /** The stored filename is a hash; the attachment needs the human one. */
    public function test_the_pdf_carries_the_human_filename(): void
    {
        Media::create([
            'filename' => 'Firewall activation guide.pdf',
            'path' => 'media/a8f3c1d2.pdf',
            'mime' => 'application/pdf',
            'size' => 1024,
            'disk' => 'public',
        ]);

        $product = $this->product(['activation_pdf_path' => 'media/a8f3c1d2.pdf']);

        $this->assertSame('Firewall activation guide.pdf', ActivationProcedure::for($product)['pdf_name']);
    }

    // ------------------------------------------------------ the email

    public function test_issuing_a_code_sends_the_procedure(): void
    {
        Notification::fake();
        $this->setting('digital_auto_fulfil', '1');

        $product = $this->product(['activation_procedure' => '<p>Paste the key under Licences.</p>']);
        $order = $this->paidOrder($product);

        DigitalFulfilment::fulfil($order);

        Notification::assertSentOnDemand(
            ActivationProcedureIssued::class,
            fn ($n) => $n->order->is($order) && $n->procedure['html'] === '<p>Paste the key under Licences.</p>',
        );
    }

    /**
     * A licence key in an inbox is a licence key in every mail server it passed
     * through. `OrderPaid` documents the rule; it does not bend because the
     * instructions have arrived.
     */
    public function test_the_email_never_contains_the_code(): void
    {
        $this->setting('digital_auto_fulfil', '1');

        $product = $this->product(['activation_procedure' => '<p>Paste the key under Licences.</p>']);
        $order = $this->paidOrder($product);

        DigitalFulfilment::fulfil($order);

        $code = DigitalCode::where('order_id', $order->id)->firstOrFail();
        $rendered = (new ActivationProcedureIssued(
            $order,
            ['A firewall licence'],
            ActivationProcedure::for($product),
        ))->toMail(new AnonymousNotifiable)->render();

        $this->assertStringNotContainsString($code->code, $rendered);
        $this->assertStringContainsString('Paste the key under Licences', $rendered);
        $this->assertStringContainsString($order->order_number, $rendered);
    }

    /** Nothing predefined means nothing sent — the receipt already said the code is ready. */
    public function test_nothing_is_sent_when_no_procedure_is_defined(): void
    {
        Notification::fake();
        $this->setting('digital_auto_fulfil', '1');

        $order = $this->paidOrder($this->product());

        DigitalFulfilment::fulfil($order);

        // `fulfil()` sends nothing else, so this is exact.
        Notification::assertNothingSent();
    }

    /**
     * Two licences from one vendor share one set of steps.
     *
     * Two identical emails arriving together reads as a bug in the shop rather
     * than as thoroughness.
     */
    public function test_lines_sharing_a_procedure_share_one_email(): void
    {
        Notification::fake();
        $this->setting('digital_auto_fulfil', '1');
        $this->setting('activation_procedure', '<p>The usual steps.</p>');

        $first = $this->product(['name' => 'Licence A']);
        $second = $this->product(['name' => 'Licence B']);

        $order = $this->paidOrder($first);
        $order->items()->create([
            'store_product_id' => $second->id,
            'name' => $second->name, 'type' => ProductType::Digital,
            'quantity' => 1, 'unit_price_paise' => 1180000,
            'line_total_paise' => 1180000, 'returnable' => false,
        ]);
        DigitalCode::create([
            'store_product_id' => $second->id, 'code' => 'KEY-B-1',
            'status' => DigitalCodeStatus::Available,
        ]);

        DigitalFulfilment::fulfil($order->fresh('items'));

        Notification::assertSentOnDemandTimes(ActivationProcedureIssued::class, 1);
    }

    /** Two genuinely different procedures cannot be merged into one message. */
    public function test_two_different_procedures_are_two_emails(): void
    {
        Notification::fake();
        $this->setting('digital_auto_fulfil', '1');

        $first = $this->product(['name' => 'Licence A', 'activation_procedure' => '<p>Steps A.</p>']);
        $second = $this->product(['name' => 'Licence B', 'activation_procedure' => '<p>Steps B.</p>']);

        $order = $this->paidOrder($first);
        $order->items()->create([
            'store_product_id' => $second->id,
            'name' => $second->name, 'type' => ProductType::Digital,
            'quantity' => 1, 'unit_price_paise' => 1180000,
            'line_total_paise' => 1180000, 'returnable' => false,
        ]);
        DigitalCode::create([
            'store_product_id' => $second->id, 'code' => 'KEY-B-2',
            'status' => DigitalCodeStatus::Available,
        ]);

        DigitalFulfilment::fulfil($order->fresh('items'));

        Notification::assertSentOnDemandTimes(ActivationProcedureIssued::class, 2);
    }

    /**
     * A missing attachment must not take the delivery with it.
     *
     * The money has arrived and the licence is issued; failing because somebody
     * tidied the media library would lose the instructions as well as the file.
     */
    public function test_a_missing_pdf_is_skipped_rather_than_thrown_on(): void
    {
        Storage::fake('public');

        $product = $this->product([
            'activation_procedure' => '<p>Paste the key.</p>',
            'activation_pdf_path' => 'media/gone.pdf',
        ]);

        $order = $this->paidOrder($product);

        $rendered = (new ActivationProcedureIssued(
            $order,
            ['A firewall licence'],
            ActivationProcedure::for($product),
        ))->toMail(new AnonymousNotifiable)->render();

        $this->assertStringContainsString('Paste the key', $rendered);
        $this->assertNull(ActivationProcedure::pdfFile('media/gone.pdf'));
    }

    // ------------------------------------------------------ the reveal

    public function test_the_reveal_returns_the_procedure_beside_the_code(): void
    {
        $this->setting('digital_auto_fulfil', '1');

        $product = $this->product(['activation_procedure' => '<p>Paste the key under Licences.</p>']);
        $order = $this->paidOrder($product);

        DigitalFulfilment::fulfil($order);

        $item = $order->items()->firstOrFail();

        $response = $this->postJson(
            "/api/v1/orders/{$order->order_number}/items/{$item->id}/reveal?token={$order->access_token}",
        )->assertOk();

        $response->assertJsonPath('procedure.html', '<p>Paste the key under Licences.</p>');
        $this->assertNotEmpty($response->json('data.0.code'));
    }

    // ------------------------------------------------------ writing it

    /**
     * Rich text is sanitised on write, and the field has to be declared for
     * that to happen. It is rendered into an email and into a browser.
     */
    public function test_the_procedure_is_sanitised_on_write(): void
    {
        $manager = User::firstOrCreate(
            ['email' => 'store-proc@example.test'],
            ['name' => 'Store Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $manager->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::StoreManager->value],
            ['name' => RoleEnum::StoreManager->label()],
        ));

        $product = $this->product();

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'activation_procedure' => '<p>Paste it.</p><script>alert(1)</script>',
            ])
            ->assertOk();

        $stored = $product->fresh()->activation_procedure;

        $this->assertStringNotContainsString('<script', $stored);
        $this->assertStringContainsString('Paste it.', $stored);
    }

    /**
     * An unknown path is an attachment that silently fails to attach: the email
     * claims a document and the customer receives a message referring to
     * something that is not there.
     */
    public function test_a_pdf_path_the_library_does_not_know_is_refused(): void
    {
        $manager = User::firstOrCreate(
            ['email' => 'store-proc2@example.test'],
            ['name' => 'Store Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $manager->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::StoreManager->value],
            ['name' => RoleEnum::StoreManager->label()],
        ));

        $product = $this->product();

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'activation_pdf_path' => 'media/never-uploaded.pdf',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('activation_pdf_path');
    }
}
