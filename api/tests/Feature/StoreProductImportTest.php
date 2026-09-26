<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\StockMovementReason;
use App\Models\Brand;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\StoreProductImport;
use App\Models\User;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The catalogue as a spreadsheet, both ways.
 *
 * What is worth pinning is what a spreadsheet can silently do to a shop: a
 * blank cell clearing a price, a repeated SKU applying twice, a typo minting
 * a category, a variation invented from a line that named none of its
 * options, and a stock change that reaches the shelf without reaching the
 * ledger. Each of those is one test here. The export is tested for the two
 * things a file opened in Excel needs — every cell escaped, and a variation
 * under its parent — because a formula in a product name is an attack on
 * whoever opens the file.
 */
class StoreProductImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // The spreadsheet waits on the private disk between the dry run and
        // the commit; faked so the test can assert it is gone afterwards.
        Storage::fake('local');
    }

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-import@example.test'],
            ['name' => 'Ira Import', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'sku' => 'SW-'.strtoupper(uniqid()),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 10,
        ], $attributes));
    }

    /** @return array<string, mixed> the analysis */
    private function analyse(string $csv, string $name = 'catalogue.csv'): array
    {
        return $this->actingAs($this->manager(), 'sanctum')
            ->post('/api/v1/admin/store/products/import/analyse', [
                'file' => UploadedFile::fake()->createWithContent($name, $csv),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data');
    }

    /** @return array<string, mixed> the import summary */
    private function commit(array $analysis): array
    {
        return $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products/import', [
                'file' => $analysis['file'],
                'original_name' => $analysis['original_name'],
                'mapping' => $analysis['mapping'],
            ])
            ->assertCreated()
            ->json('data');
    }

    // ------------------------------------------------------------ export

    public function test_the_export_lists_a_variation_under_its_parent_and_escapes_every_cell(): void
    {
        $product = $this->product(['name' => '=HYPERLINK("http://attacker.test")', 'sku' => 'SW-24', 'price_paise' => 117900]);
        $product->variations()->create(['name' => '48 port', 'sku' => 'SW-24-48', 'price_paise' => 235900, 'stock' => 3]);

        $response = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/products/export')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $csv = $response->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));

        // The header row names the columns the importer reads back.
        $this->assertStringStartsWith("\xEF\xBB\xBFsku,parent_sku,name,slug,type,category,brand,price,compare_at,stock", $lines[0]);

        // The product, then its variation directly under it with the parent's SKU.
        $this->assertStringStartsWith('SW-24,,', $lines[1]);
        $this->assertStringStartsWith('SW-24-48,SW-24,"48 port",,,,,2359.00,,3', $lines[2]);

        // The formula is neutralised with Excel's own escape, and money is a
        // plain decimal, not a formatted amount.
        $this->assertStringContainsString("'=HYPERLINK", $lines[1]);
        $this->assertStringContainsString(',1179.00,', $lines[1]);
    }

    // ----------------------------------------------------------- dry run

    public function test_the_dry_run_counts_what_would_happen_and_writes_nothing(): void
    {
        $category = StoreCategory::create(['name' => 'Switches', 'slug' => 'switches']);
        $existing = $this->product(['sku' => 'SW-EXIST', 'price_paise' => 100000]);
        $existing->variations()->create(['name' => '48 port', 'sku' => 'SW-EXIST-48', 'stock' => 2]);

        $csv = "sku,parent_sku,name,price,stock,category\n"
            ."SW-EXIST,,Renamed,1500.00,,\n"
            ."SW-EXIST-48,SW-EXIST,,2500.00,9,\n"
            ."SW-NEW,,A brand new switch,999.99,4,switches\n"
            ."SW-BAD,,Wrong shelf,10.00,,no-such-category\n"
            ."SW-NOPRICE,,Priceless,,,\n";

        $analysis = $this->analyse($csv);

        $this->assertSame(['total' => 5, 'create' => 1, 'update_product' => 1, 'update_variation' => 1, 'invalid' => 2], $analysis['counts']);
        $this->assertSame(0, $analysis['mapping']['sku']);
        $this->assertSame(5, $analysis['mapping']['category']);
        $this->assertCount(2, $analysis['problems']);
        $this->assertSame('SW-BAD', $analysis['problems'][0]['sku']);
        $this->assertStringContainsString('no-such-category', $analysis['problems'][0]['reason']);
        $this->assertStringContainsString('needs a price', $analysis['problems'][1]['reason']);
        $this->assertStringStartsWith('store-imports/', $analysis['file']);

        // Nothing moved.
        $this->assertSame('A switch', $existing->fresh()->name);
        $this->assertSame(100000, $existing->fresh()->price_paise);
        $this->assertSame(2, $existing->variations()->first()->stock);
        $this->assertDatabaseCount('store_products', 1);
        $this->assertDatabaseCount('store_product_imports', 0);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertNull($category->fresh()->products()->first());
    }

    // ------------------------------------------------------------ commit

    public function test_the_commit_creates_updates_and_moves_stock_through_the_ledger(): void
    {
        $category = StoreCategory::create(['name' => 'Switches', 'slug' => 'switches']);
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        $existing = $this->product(['sku' => 'SW-EXIST', 'price_paise' => 100000, 'stock' => 10, 'short_description' => 'Keep me']);
        $withVariations = $this->product(['sku' => 'SW-VAR', 'stock' => 0]);
        $variation = $withVariations->variations()->create(['name' => '48 port', 'sku' => 'SW-VAR-48', 'stock' => 2, 'price_paise' => 200000]);

        $csv = "sku,parent_sku,name,price,compare_at,stock,category,brand,status,gtin\n"
            ."SW-EXIST,,Renamed switch,1500.00,\"1,800.00\",40,switches,cisco,published,\n"
            ."SW-VAR-48,SW-VAR,,2359.00,,9,,,,12345678\n"
            ."SW-NEW,,A brand new switch,999.99,,4,switches,cisco,,\n";

        $summary = $this->commit($this->analyse($csv));

        $this->assertSame('completed', $summary['status']);
        // `assertEquals`: the counts come back through a JSON column, and
        // MySQL reorders an object's keys.
        $this->assertEquals(['total' => 3, 'create' => 1, 'update_product' => 1, 'update_variation' => 1, 'invalid' => 0], $summary['counts']);
        $this->assertSame([], $summary['problems']);

        // The product, by SKU: every mapped, filled cell applied and the
        // blank one left alone.
        $existing->refresh();
        $this->assertSame('Renamed switch', $existing->name);
        $this->assertSame(150000, $existing->price_paise);
        $this->assertSame(180000, $existing->compare_at_paise);
        $this->assertSame(40, $existing->stock);
        $this->assertSame($category->id, $existing->store_category_id);
        $this->assertSame($brand->id, $existing->brand_id);
        $this->assertSame('Keep me', $existing->short_description);

        // The variation, by SKU, and never the parent's own counter.
        $variation->refresh();
        $this->assertSame(235900, $variation->price_paise);
        $this->assertSame(9, $variation->stock);
        $this->assertSame('12345678', $variation->gtin);
        $this->assertSame(0, $withVariations->fresh()->stock);

        // The new product: a draft, physical, slug derived from the name,
        // the price parsed from the text.
        $created = StoreProduct::where('sku', 'SW-NEW')->sole();
        $this->assertSame('a-brand-new-switch', $created->slug);
        $this->assertSame(99999, $created->price_paise);
        $this->assertSame(PublishStatus::Draft, $created->status);
        $this->assertSame(ProductType::Physical, $created->type);
        $this->assertSame(4, $created->stock);

        // Three movements, each naming the import: 30 arriving on the
        // product, 7 on the variation, and the new product's opening 4.
        $import = StoreProductImport::sole();
        $movements = StockMovement::orderBy('id')->get();

        $this->assertCount(3, $movements);
        $this->assertSame(30, $movements[0]->delta);
        $this->assertSame(StockMovementReason::Adjustment, $movements[0]->reason);
        $this->assertStringContainsString("Import #{$import->id}", (string) $movements[0]->note);
        $this->assertStringContainsString('from 10 to 40', (string) $movements[0]->note);
        $this->assertSame(7, $movements[1]->delta);
        $this->assertSame($variation->id, $movements[1]->store_product_variation_id);
        $this->assertSame(4, $movements[2]->delta);
        $this->assertSame(StockMovementReason::Initial, $movements[2]->reason);

        // The file is gone once it has been read; the row remembers the rest.
        $this->assertNull($import->file);
        Storage::disk('local')->assertDirectoryEmpty('store-imports');
        $this->assertSame('Ira Import', $import->uploader->name);
    }

    public function test_an_unknown_category_refuses_the_line_and_not_the_file(): void
    {
        $existing = $this->product(['sku' => 'SW-OK', 'price_paise' => 100000]);

        $csv = "sku,name,price,category\n"
            ."SW-OK,,1200.00,\n"
            ."SW-TYPO,Mis-shelved,10.00,swtiches\n";

        $summary = $this->commit($this->analyse($csv));

        $this->assertSame(1, $summary['counts']['update_product']);
        $this->assertSame(1, $summary['counts']['invalid']);
        $this->assertSame('SW-TYPO', $summary['problems'][0]['sku']);
        $this->assertSame(3, $summary['problems'][0]['line']);
        $this->assertStringContainsString('swtiches', $summary['problems'][0]['reason']);

        $this->assertSame(120000, $existing->fresh()->price_paise);
        $this->assertNull(StoreProduct::where('sku', 'SW-TYPO')->first());
        $this->assertDatabaseCount('store_categories', 0);
    }

    /**
     * A variation is a set of options a buyer picks from, and a spreadsheet
     * cell cannot say what those are — so a line naming a parent whose SKU
     * matches no variation is refused, and so is a parent nobody has.
     */
    public function test_the_import_never_creates_a_variation(): void
    {
        $parent = $this->product(['sku' => 'SW-PARENT']);

        $csv = "sku,parent_sku,name,price,stock\n"
            ."SW-PARENT-NEW,SW-PARENT,24 port,1000.00,5\n"
            ."SW-ORPHAN,SW-NOBODY,24 port,1000.00,5\n";

        $analysis = $this->analyse($csv);

        $this->assertSame(2, $analysis['counts']['invalid']);
        $this->assertSame(0, $analysis['counts']['create']);
        $this->assertStringContainsString('never creates a variation', $analysis['problems'][0]['reason']);
        $this->assertStringContainsString('SW-NOBODY', $analysis['problems'][1]['reason']);

        $this->commit($analysis);

        $this->assertSame(0, $parent->variations()->count());
        $this->assertDatabaseCount('store_products', 1);
    }

    public function test_a_price_that_is_not_a_number_and_a_status_outside_the_enum_are_refused(): void
    {
        $this->product(['sku' => 'SW-A']);
        $this->product(['sku' => 'SW-B']);

        $csv = "sku,price,status\n"
            ."SW-A,call for price,\n"
            ."SW-B,,live\n";

        $analysis = $this->analyse($csv);

        $this->assertSame(2, $analysis['counts']['invalid']);
        $this->assertStringContainsString('not a price', $analysis['problems'][0]['reason']);
        $this->assertStringContainsString('not a status', $analysis['problems'][1]['reason']);
    }

    public function test_a_sku_repeated_in_the_file_applies_once(): void
    {
        $product = $this->product(['sku' => 'SW-TWICE', 'price_paise' => 100000]);

        $csv = "sku,price\nSW-TWICE,1100.00\nSW-TWICE,1200.00\n";

        $summary = $this->commit($this->analyse($csv));

        $this->assertSame(1, $summary['counts']['update_product']);
        $this->assertSame(1, $summary['counts']['invalid']);
        $this->assertStringContainsString('repeated', $summary['problems'][0]['reason']);
        $this->assertSame(110000, $product->fresh()->price_paise);
    }

    public function test_an_xlsx_is_read_like_a_csv(): void
    {
        $product = $this->product(['sku' => 'SW-XL', 'price_paise' => 100000]);

        $path = $this->xlsx();

        $summary = $this->commit($this->analyse(file_get_contents($path), 'catalogue.xlsx'));

        $this->assertSame(1, $summary['counts']['update_product']);
        $this->assertSame(1, $summary['counts']['create']);
        $this->assertSame(250000, $product->fresh()->price_paise);
        $this->assertSame(88800, StoreProduct::where('sku', 'SW-XL-2')->sole()->price_paise);

        @unlink($path);
    }

    /**
     * The file named on commit is ours, and only ours.
     *
     * The path comes back from the browser. A prefix check let
     * `store-imports/../newsletter-imports/…` through — Flysystem collapses
     * the `..` — so a store manager could read another area's private file
     * (its rows came back in `problems[]`) and delete it.
     */
    public function test_a_file_outside_the_import_directory_cannot_be_committed(): void
    {
        Storage::disk('local')->put('newsletter-imports/mailbox-3.csv', "sku,name\nX-1,Secret list\n");

        foreach ([
            'store-imports/../newsletter-imports/mailbox-3.csv',
            'store-imports/..\\newsletter-imports\\mailbox-3.csv',
            'store-imports/sub/../../newsletter-imports/mailbox-3.csv',
        ] as $path) {
            $this->actingAs($this->manager(), 'sanctum')
                ->postJson('/api/v1/admin/store/products/import', [
                    'file' => $path,
                    'mapping' => ['sku' => 0, 'name' => 1],
                ])
                ->assertStatus(422);
        }

        Storage::disk('local')->assertExists('newsletter-imports/mailbox-3.csv');
        $this->assertSame(0, StoreProduct::count());
    }

    public function test_the_import_is_store_manager_work(): void
    {
        $editor = User::create(['name' => 'Editor', 'email' => 'cm-import@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $editor->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]));

        $this->actingAs($editor, 'sanctum')->get('/api/v1/admin/store/products/export')->assertForbidden();
        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/store/products/import', ['file' => 'x', 'mapping' => []])->assertForbidden();
    }

    public function test_rupees_are_parsed_from_the_text_and_never_through_a_float(): void
    {
        $this->assertSame(117999, Money::fromRupeeString('1179.99'));
        $this->assertSame(118000, Money::fromRupeeString('₹1,180'));
        $this->assertSame(118010, Money::fromRupeeString('Rs. 1,180.1'));
        $this->assertSame(0, Money::fromRupeeString('0'));
        $this->assertNull(Money::fromRupeeString('call for price'));
        $this->assertNull(Money::fromRupeeString(''));
        $this->assertNull(Money::fromRupeeString('12.345'));
    }

    /**
     * A real xlsx, written here rather than read from a fixture — the same
     * builder `NewsletterTest` carries. Two rows: one updating SW-XL's
     * price, one creating SW-XL-2 with a name and a price.
     */
    private function xlsx(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'st').'.xlsx';

        $shared = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<si><t>sku</t></si><si><t>name</t></si><si><t>price</t></si>'
            .'<si><t>SW-XL</t></si><si><t>SW-XL-2</t></si><si><t>Second switch</t></si>'
            .'</sst>';

        // Row 2 omits column B (no name: an update); row 3 carries a numeric
        // cell, which is how Excel writes 888.00.
        $sheet = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            .'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
            .'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>2500</v></c></row>'
            .'<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c><c r="C3"><v>888</v></c></row>'
            .'</sheetData></worksheet>';

        self::writeZip($path, [
            'xl/sharedStrings.xml' => $shared,
            'xl/worksheets/sheet1.xml' => $sheet,
        ]);

        return $path;
    }

    /** @param  array<string, string>  $files */
    private static function writeZip(string $path, array $files): void
    {
        $local = '';
        $central = '';
        $offset = 0;

        foreach ($files as $name => $contents) {
            $crc = crc32($contents);
            $deflated = gzdeflate($contents);
            $header = pack('VvvvvvVVVvv', 0x04034B50, 20, 0, 8, 0, 0, $crc,
                strlen($deflated), strlen($contents), strlen($name), 0).$name;

            $local .= $header.$deflated;

            $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 20, 20, 0, 8, 0, 0, $crc,
                strlen($deflated), strlen($contents), strlen($name), 0, 0, 0, 0, 0, $offset).$name;

            $offset += strlen($header) + strlen($deflated);
        }

        $eocd = pack('VvvvvVVv', 0x06054B50, 0, 0, count($files), count($files),
            strlen($central), $offset, 0);

        file_put_contents($path, $local.$central.$eocd);
    }
}
