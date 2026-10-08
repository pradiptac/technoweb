<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Download;
use App\Models\DownloadCategory;
use App\Models\Media;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\Product;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Downloads\DownloadFiles;
use App\Support\ReservedSlugs;
use App\Support\SiteSection;
use App\Support\Upgrade\Steps\RetireDownloadsPage;
use Database\Seeders\SampleDownloadSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The downloads centre (0.131.0, docs/downloads.md): the console's CRUD and
 * its rules, the two kinds of file, who may fetch a customers-only one, and
 * every other place a download appears — a product's page, search, menus,
 * the page builder and the upgrade that moves the old page aside.
 */
class DownloadsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        Storage::fake('local');
        Storage::fake('public');
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function libraryFile(string $path = 'media/datasheet.pdf', int $size = 2048): string
    {
        Media::create(['disk' => 'public', 'path' => $path, 'filename' => 'CBS350 datasheet.pdf', 'mime' => 'application/pdf', 'size' => $size]);

        return $path;
    }

    /** A published public download backed by a library file. */
    private function download(array $overrides = []): Download
    {
        return Download::create(array_replace([
            'title' => 'CBS350 datasheet',
            'summary' => 'Specifications and dimensions.',
            'version' => 'Rev. C',
            'released_on' => '2026-09-01',
            'access' => 'public',
            'source' => 'library',
            'file_path' => $overrides['file_path'] ?? $this->libraryFile('media/'.Str::random(8).'.pdf'),
            'status' => 'published',
        ], $overrides));
    }

    /** A published download whose file is a private upload. */
    private function privateDownload(array $overrides = []): Download
    {
        $path = DownloadFiles::FOLDER.'/'.Str::random(40).'.bin';
        Storage::disk('local')->put($path, 'firmware-bytes');

        return Download::create(array_replace([
            'title' => 'Firmware 2.4.1',
            'access' => 'customers',
            'source' => 'upload',
            'private_path' => $path,
            'file_name' => 'fw-2.4.1.bin',
            'file_size' => 14,
            'file_mime' => 'application/octet-stream',
            'status' => 'published',
        ], $overrides));
    }

    private function customer(CustomerStatus $status = CustomerStatus::Active): Customer
    {
        return Customer::create([
            'name' => 'Priya Das', 'email' => 'priya-'.Str::random(5).'@acme.co.in',
            'password' => 'password-for-tests', 'status' => $status,
        ]);
    }

    // ---- The console ----------------------------------------------------

    public function test_a_content_manager_creates_a_library_download_and_reads_it_back(): void
    {
        $category = DownloadCategory::create(['name' => 'Datasheets']);
        $product = Product::create(['name' => 'CBS350-24T', 'slug' => 'cbs350-24t', 'status' => 'published']);
        $path = $this->libraryFile();

        $response = $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/downloads', [
            'title' => 'CBS350 datasheet',
            'summary' => 'Specifications and dimensions.',
            'download_category_id' => $category->id,
            'version' => 'Rev. C',
            'released_on' => '2026-09-01',
            'source' => 'library',
            'file_path' => $path,
            'status' => 'published',
            'product_ids' => [$product->id],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.title', 'CBS350 datasheet')
            ->assertJsonPath('data.source', 'library')
            ->assertJsonPath('data.access', 'public')
            ->assertJsonPath('data.file.name', 'CBS350 datasheet.pdf')
            ->assertJsonPath('data.file.extension', 'pdf')
            ->assertJsonPath('data.file.size', 2048)
            ->assertJsonPath('data.has_file', true)
            ->assertJsonPath('data.file_missing', false)
            ->assertJsonPath('data.category.name', 'Datasheets')
            ->assertJsonPath('data.product_ids', [$product->id])
            ->assertJsonPath('data.products.0.name', 'CBS350-24T')
            ->assertJsonPath('data.download_count', 0)
            // The form's vocabulary rides on every answer.
            ->assertJsonPath('meta.accesses.1.value', 'customers')
            ->assertJsonPath('meta.sources.1.value', 'upload');

        $this->assertArrayNotHasKey('private_path', $response->json('data'));
        $this->assertSame($category->slug, 'datasheets');
    }

    public function test_only_a_content_manager_reaches_the_console_routes(): void
    {
        $download = $this->download();

        foreach ([RoleEnum::StoreManager, RoleEnum::SupportEngineer, RoleEnum::SalesManager] as $role) {
            $this->actingAs($this->staff($role), 'sanctum');
            $this->getJson('/api/v1/admin/downloads')->assertForbidden();
            $this->getJson('/api/v1/admin/downloads/options')->assertForbidden();
            $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['title' => 'x'])->assertForbidden();
            $this->getJson('/api/v1/admin/download-categories')->assertForbidden();
            app('auth')->forgetGuards();
        }

        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')->getJson('/api/v1/admin/downloads')->assertOk();
        app('auth')->forgetGuards();

        // A customer's token is not staff at all.
        $token = $this->customer()->createToken('portal', ['portal'])->plainTextToken;
        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/v1/admin/downloads')->assertForbidden();
    }

    public function test_options_names_the_shelves_and_both_kinds_of_product(): void
    {
        DownloadCategory::create(['name' => 'Firmware', 'sort_order' => 2]);
        DownloadCategory::create(['name' => 'Datasheets', 'sort_order' => 1]);
        Product::create(['name' => 'Catalogue switch', 'slug' => 'catalogue-switch', 'status' => 'published']);
        StoreProduct::create(['name' => 'Shop switch', 'slug' => 'shop-switch', 'status' => 'published', 'price_paise' => 100000]);

        $this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/downloads/options')
            ->assertOk()
            ->assertJsonPath('data.categories.0.name', 'Datasheets')
            ->assertJsonPath('data.categories.1.name', 'Firmware')
            ->assertJsonPath('data.products.0.name', 'Catalogue switch')
            ->assertJsonPath('data.store_products.0.name', 'Shop switch')
            ->assertJsonPath('data.max_upload_kb', DownloadFiles::maxKb());
    }

    public function test_a_private_upload_arrives_as_multipart_and_is_kept_off_the_public_disk(): void
    {
        $file = UploadedFile::fake()->createWithContent('Router FW 2.4.1.bin', 'firmware-bytes');

        $response = $this->actingAs($this->staff(), 'sanctum')->post('/api/v1/admin/downloads', [
            'title' => 'Router firmware',
            'source' => 'upload',
            'access' => 'customers',
            'status' => 'published',
            'relations_sent' => '1',
            'file' => $file,
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('data.source', 'upload')
            ->assertJsonPath('data.access', 'customers')
            ->assertJsonPath('data.file.name', 'Router FW 2.4.1.bin')
            ->assertJsonPath('data.file.extension', 'bin')
            ->assertJsonPath('data.file_path', null)
            ->assertJsonPath('data.product_ids', []);

        $download = Download::sole();
        $this->assertStringStartsWith('downloads/', $download->private_path);
        // The stored name is random; the upload's own name is only a label.
        $this->assertStringNotContainsString('Router', $download->private_path);
        Storage::disk('local')->assertExists($download->private_path);
        $this->assertSame([], Storage::disk('public')->allFiles());

        // Staff read it back through their own route, as an attachment.
        $stream = $this->get("/api/v1/admin/downloads/{$download->id}/file");
        $stream->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('attachment', (string) $stream->headers->get('Content-Disposition'));
        $this->assertStringContainsString('Router FW 2.4.1.bin', (string) $stream->headers->get('Content-Disposition'));
        $this->assertSame('firmware-bytes', $stream->streamedContent());
    }

    public function test_an_edit_through_post_with_a_method_override_replaces_the_file_and_removes_the_old_one(): void
    {
        $download = $this->privateDownload(['status' => 'draft']);
        $old = $download->private_path;

        $this->actingAs($this->staff(), 'sanctum')->post("/api/v1/admin/downloads/{$download->id}", [
            '_method' => 'PATCH',
            'title' => 'Firmware 2.5.0',
            'source' => 'upload',
            'file' => UploadedFile::fake()->createWithContent('fw-2.5.0.img', 'newer-bytes'),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Firmware 2.5.0')
            ->assertJsonPath('data.file.name', 'fw-2.5.0.img');

        $download->refresh();
        $this->assertNotSame($old, $download->private_path);
        Storage::disk('local')->assertMissing($old);
        Storage::disk('local')->assertExists($download->private_path);
    }

    public function test_switching_to_a_library_file_removes_the_private_upload(): void
    {
        $download = $this->privateDownload(['access' => 'public']);
        $old = $download->private_path;

        $this->actingAs($this->staff(), 'sanctum')->patchJson("/api/v1/admin/downloads/{$download->id}", [
            'source' => 'library',
            'file_path' => $this->libraryFile(),
        ])->assertOk()->assertJsonPath('data.source', 'library')->assertJsonPath('data.file.extension', 'pdf');

        Storage::disk('local')->assertMissing($old);
        $this->assertNull($download->refresh()->private_path);
        $this->assertNull($download->file_name);
    }

    public function test_deleting_a_download_removes_its_upload_and_leaves_a_library_file_alone(): void
    {
        $private = $this->privateDownload();
        $library = $this->download();
        $this->actingAs($this->staff(), 'sanctum');

        $this->deleteJson("/api/v1/admin/downloads/{$private->id}")->assertNoContent();
        $this->deleteJson("/api/v1/admin/downloads/{$library->id}")->assertNoContent();

        Storage::disk('local')->assertMissing($private->private_path);
        $this->assertTrue(Media::where('path', $library->file_path)->exists());
        $this->assertSame(0, Download::count());
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function refusals(): array
    {
        return [
            'no title' => [['title' => ''], 'title'],
            'a library file the library does not hold' => [['file_path' => 'media/nowhere.pdf'], 'file_path'],
            'customers-only on a library file' => [['access' => 'customers'], 'access'],
            'published with no file' => [['file_path' => null], 'status'],
            'published upload with nothing uploaded' => [['source' => 'upload', 'file_path' => null], 'status'],
            'an unknown category' => [['download_category_id' => 999], 'download_category_id'],
            'a product that does not exist' => [['product_ids' => [999]], 'product_ids.0'],
            'a date that is not one' => [['released_on' => 'soon'], 'released_on'],
            'an unknown access' => [['access' => 'partners'], 'access'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('refusals')]
    public function test_a_download_is_refused_when(array $overrides, string $field): void
    {
        $payload = array_replace([
            'title' => 'CBS350 datasheet', 'source' => 'library', 'file_path' => $this->libraryFile(), 'status' => 'published',
        ], $overrides);

        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/downloads', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors($field);

        $this->assertSame(0, Download::count());
    }

    public function test_an_upload_is_refused_by_type_and_when_the_source_is_the_library(): void
    {
        $this->actingAs($this->staff(), 'sanctum');

        // Markup and script are not downloads, whatever they are called.
        foreach (['page.html', 'shell.php', 'logo.svg', 'run.js'] as $name) {
            $this->post('/api/v1/admin/downloads', [
                'title' => 'Nope', 'source' => 'upload',
                'file' => UploadedFile::fake()->createWithContent($name, 'x'),
            ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('file');
        }

        // A file sent with a library download would be dropped in silence; it is refused instead.
        $this->post('/api/v1/admin/downloads', [
            'title' => 'Mixed up', 'source' => 'library', 'file_path' => $this->libraryFile(),
            'file' => UploadedFile::fake()->createWithContent('fw.bin', 'x'),
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->assertSame(0, Download::count());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_a_patch_is_checked_against_what_the_download_will_be(): void
    {
        $download = $this->download(['status' => 'draft']);
        $this->actingAs($this->staff(), 'sanctum');

        // The stored source is the library, so naming only the access is still refused.
        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['access' => 'customers'])
            ->assertUnprocessable()->assertJsonValidationErrors('access');

        // Clearing the file of a published download is refused on the status it would leave.
        $download->forceFill(['status' => 'published'])->save();
        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['file_path' => null])
            ->assertUnprocessable()->assertJsonValidationErrors('status');

        // A change that leaves both halves alone is not asked to restate them.
        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['version' => 'Rev. D'])
            ->assertOk()->assertJsonPath('data.version', 'Rev. D');
    }

    public function test_relations_are_replaced_only_when_sent(): void
    {
        $a = Product::create(['name' => 'A', 'slug' => 'a', 'status' => 'published']);
        $b = StoreProduct::create(['name' => 'B', 'slug' => 'b', 'status' => 'published', 'price_paise' => 100]);
        $download = $this->download();
        $download->products()->sync([$a->id]);
        $download->storeProducts()->sync([$b->id]);
        $this->actingAs($this->staff(), 'sanctum');

        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['title' => 'Renamed'])
            ->assertOk()->assertJsonPath('data.product_ids', [$a->id])->assertJsonPath('data.store_product_ids', [$b->id]);

        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['product_ids' => []])
            ->assertOk()->assertJsonPath('data.product_ids', [])->assertJsonPath('data.store_product_ids', [$b->id]);

        // A multipart form cannot say "an empty list"; `relations_sent` says it for both.
        $this->patchJson("/api/v1/admin/downloads/{$download->id}", ['relations_sent' => true])
            ->assertOk()->assertJsonPath('data.store_product_ids', []);
    }

    public function test_the_list_filters_and_reports_a_file_that_has_gone(): void
    {
        $shelf = DownloadCategory::create(['name' => 'Datasheets']);
        $filed = $this->download(['title' => 'Filed', 'download_category_id' => $shelf->id]);
        $this->download(['title' => 'Unfiled draft', 'status' => 'draft']);
        $gone = $this->download(['title' => 'Gone', 'file_path' => 'media/gone.pdf']);
        Media::where('path', 'media/gone.pdf')->delete();
        $this->actingAs($this->staff(), 'sanctum');

        $this->getJson('/api/v1/admin/downloads?category='.$shelf->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $filed->id);
        $this->getJson('/api/v1/admin/downloads?category=none')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/downloads?status=draft')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Unfiled draft');
        $this->getJson('/api/v1/admin/downloads?q=fil')->assertOk()->assertJsonCount(2, 'data');
        // `%` matches itself, never everything.
        $this->getJson('/api/v1/admin/downloads?q=%25')->assertOk()->assertJsonCount(0, 'data');

        $this->getJson("/api/v1/admin/downloads/{$gone->id}")->assertOk()
            ->assertJsonPath('data.has_file', false)->assertJsonPath('data.file_missing', true);
    }

    public function test_categories_are_created_slugged_edited_and_deleted_without_their_downloads(): void
    {
        $this->actingAs($this->staff(), 'sanctum');

        $id = $this->postJson('/api/v1/admin/download-categories', ['name' => 'Drivers & software'])
            ->assertCreated()->assertJsonPath('data.slug', 'drivers-software')->assertJsonPath('data.is_active', true)->json('data.id');
        $this->postJson('/api/v1/admin/download-categories', ['name' => 'Drivers & software'])
            ->assertCreated()->assertJsonPath('data.slug', 'drivers-software-2');
        $this->postJson('/api/v1/admin/download-categories', ['name' => 'Other', 'slug' => 'drivers-software'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
        $this->postJson('/api/v1/admin/download-categories', ['name' => 'Other', 'slug' => 'Bad Slug'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');

        $download = $this->download(['download_category_id' => $id]);

        $this->patchJson("/api/v1/admin/download-categories/{$id}", ['name' => 'Drivers', 'slug' => ''])
            ->assertOk()->assertJsonPath('data.slug', 'drivers')->assertJsonPath('data.downloads_count', 1);

        $this->deleteJson("/api/v1/admin/download-categories/{$id}")->assertNoContent();
        $this->assertNull($download->refresh()->download_category_id);
    }

    // ---- The public list --------------------------------------------------

    public function test_the_public_list_shows_what_is_published_and_has_a_file_and_never_an_address(): void
    {
        $shelf = DownloadCategory::create(['name' => 'Datasheets', 'sort_order' => 1]);
        $off = DownloadCategory::create(['name' => 'Switched off', 'is_active' => false]);

        $shown = $this->download(['download_category_id' => $shelf->id]);
        $locked = $this->privateDownload();
        $this->download(['title' => 'Draft', 'status' => 'draft']);
        $this->download(['title' => 'Archived', 'status' => 'archived']);
        $this->download(['title' => 'On a shelf that is off', 'download_category_id' => $off->id]);
        $this->download(['title' => 'No file yet', 'file_path' => null]);
        Download::create(['title' => 'Upload never sent', 'source' => 'upload', 'status' => 'published']);

        $response = $this->getJson('/api/v1/downloads')->assertOk()->assertJsonCount(2, 'data');

        // Shelved first, unfiled last.
        $response->assertJsonPath('data.0.id', $shown->id)
            ->assertJsonPath('data.0.locked', false)
            ->assertJsonPath('data.0.category.slug', 'datasheets')
            ->assertJsonPath('data.0.released_label', '1 September 2026')
            ->assertJsonPath('data.0.file.extension', 'pdf')
            ->assertJsonPath('data.1.id', $locked->id)
            ->assertJsonPath('data.1.locked', true)
            ->assertJsonPath('data.1.file.name', 'fw-2.4.1.bin');

        $body = $response->getContent();
        foreach (['file_path', 'private_path', 'download_count', '/storage/', 'downloads/'] as $never) {
            $this->assertStringNotContainsString($never, (string) $body, "The public list must not carry {$never}.");
        }
    }

    public function test_the_public_list_filters_by_shelf_access_and_search(): void
    {
        $shelf = DownloadCategory::create(['name' => 'Datasheets']);
        $this->download(['title' => 'Switch datasheet', 'download_category_id' => $shelf->id]);
        $this->download(['title' => 'Router guide', 'summary' => 'Setting up 100% of the ports']);
        $this->privateDownload(['title' => 'Switch firmware']);

        $this->getJson('/api/v1/downloads?category=datasheets')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Switch datasheet');
        $this->getJson('/api/v1/downloads?category=nothing-here')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/downloads?access=customers')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Switch firmware');
        // An unknown access is ignored, not refused: it arrives from a link.
        $this->getJson('/api/v1/downloads?access=everyone')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/downloads?q=switch')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/downloads?q=100%25')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/downloads?q=%25')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/downloads?q=_')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_the_shelves_endpoint_lists_only_shelves_with_something_published(): void
    {
        $datasheets = DownloadCategory::create(['name' => 'Datasheets', 'sort_order' => 2, 'description' => 'Specifications.']);
        $firmware = DownloadCategory::create(['name' => 'Firmware', 'sort_order' => 1]);
        DownloadCategory::create(['name' => 'Empty']);
        $off = DownloadCategory::create(['name' => 'Off', 'is_active' => false]);

        $this->download(['download_category_id' => $datasheets->id]);
        $this->download(['download_category_id' => $datasheets->id]);
        $this->privateDownload(['download_category_id' => $firmware->id]);
        $this->download(['download_category_id' => $datasheets->id, 'status' => 'draft']);
        $this->download(['download_category_id' => $off->id]);
        $this->download();

        $this->getJson('/api/v1/download-categories')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.slug', 'firmware')->assertJsonPath('data.0.count', 1)
            ->assertJsonPath('data.1.slug', 'datasheets')->assertJsonPath('data.1.count', 2)
            ->assertJsonPath('data.1.description', 'Specifications.')
            ->assertJsonPath('meta.total', 4);

        Download::query()->delete();
        $this->getJson('/api/v1/download-categories')->assertOk()->assertExactJson(['data' => [], 'meta' => ['total' => 0, 'updated_at' => null]]);
    }

    // ---- The file ---------------------------------------------------------

    public function test_a_public_library_file_is_answered_as_an_address_and_counted_without_moving_updated_at(): void
    {
        $download = $this->download();
        $before = $download->fresh()->updated_at;
        $this->travel(5)->minutes();

        $this->getJson("/api/v1/downloads/{$download->id}/file")->assertOk()
            ->assertJsonPath('data.url', fn (string $url) => str_ends_with($url, '/storage/'.$download->file_path));
        $this->getJson("/api/v1/downloads/{$download->id}/file")->assertOk();

        $download->refresh();
        $this->assertSame(2, $download->download_count);
        $this->assertTrue($before->equalTo($download->updated_at), 'A download being fetched is not the page changing.');
    }

    public function test_a_public_private_upload_is_streamed_as_an_attachment(): void
    {
        $download = $this->privateDownload(['access' => 'public']);

        $response = $this->get("/api/v1/downloads/{$download->id}/file");

        $response->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Type', 'application/octet-stream');
        $this->assertStringContainsString('attachment', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('fw-2.4.1.bin', (string) $response->headers->get('Content-Disposition'));
        $this->assertSame('firmware-bytes', $response->streamedContent());
        $this->assertSame(1, $download->refresh()->download_count);
    }

    public function test_a_customers_only_file_needs_a_customer_who_may_sign_in(): void
    {
        $download = $this->privateDownload();
        $url = "/api/v1/downloads/{$download->id}/file";

        // Nobody: a 401 the website branches on, and nothing counted.
        $this->getJson($url)->assertUnauthorized()->assertJsonPath('reason', 'sign_in_required');

        // Staff are not customers; the console has its own route.
        $staff = $this->staff(RoleEnum::Admin)->createToken('admin', ['admin'])->plainTextToken;
        $this->withHeader('Authorization', "Bearer {$staff}")->getJson($url)->assertUnauthorized();
        app('auth')->forgetGuards();

        // A customer who may not sign in is nobody.
        $suspended = $this->customer(CustomerStatus::Suspended)->createToken('portal', ['portal'])->plainTextToken;
        $this->flushHeaders()->withHeader('Authorization', "Bearer {$suspended}")->getJson($url)->assertUnauthorized();
        app('auth')->forgetGuards();

        $this->assertSame(0, $download->refresh()->download_count);

        // A real bearer token, not `actingAs`: the route is public, so only
        // the header proves the guard is read by name.
        $token = $this->customer()->createToken('portal', ['portal'])->plainTextToken;
        $response = $this->flushHeaders()->withHeader('Authorization', "Bearer {$token}")->get($url);
        $response->assertOk();
        $this->assertSame('firmware-bytes', $response->streamedContent());
        $this->assertSame(1, $download->refresh()->download_count);
        app('auth')->forgetGuards();

        // With the portal closed, that same token opens nothing.
        Setting::where('key', 'portal_enabled')->firstOrFail()->forceFill(['value' => '0'])->save();
        Setting::flushCache();
        $this->flushHeaders()->withHeader('Authorization', "Bearer {$token}")->getJson($url)->assertUnauthorized();
    }

    public function test_the_file_route_is_a_404_for_anything_that_is_not_a_published_download_with_a_file(): void
    {
        $draft = $this->download(['status' => 'draft']);
        $gone = $this->download(['file_path' => 'media/gone.pdf']);
        Media::where('path', 'media/gone.pdf')->delete();
        $missing = $this->privateDownload(['access' => 'public']);
        Storage::disk('local')->delete($missing->private_path);

        foreach ([$draft->id, $gone->id, $missing->id, 999999] as $id) {
            $this->getJson("/api/v1/downloads/{$id}/file")->assertNotFound();
        }
        $this->getJson('/api/v1/downloads/options/file')->assertNotFound();

        $this->assertSame(0, (int) DB::table('downloads')->sum('download_count'));
    }

    // ---- Where else a download appears -----------------------------------

    public function test_a_product_page_carries_its_published_downloads_and_a_list_row_does_not(): void
    {
        $product = Product::create(['name' => 'CBS350-24T', 'slug' => 'cbs350-24t', 'status' => 'published']);
        $shop = StoreProduct::create(['name' => 'Shop switch', 'slug' => 'shop-switch', 'status' => 'published', 'price_paise' => 100000]);

        $second = $this->download(['title' => 'B guide', 'sort_order' => 2]);
        $first = $this->download(['title' => 'A datasheet', 'sort_order' => 1]);
        $draft = $this->download(['title' => 'Draft', 'status' => 'draft']);
        $locked = $this->privateDownload(['sort_order' => 3]);

        $product->downloads()->sync([$second->id, $first->id, $draft->id, $locked->id]);
        $shop->downloads()->sync([$first->id]);

        $this->getJson('/api/v1/products/cbs350-24t')->assertOk()
            ->assertJsonCount(3, 'data.downloads')
            ->assertJsonPath('data.downloads.0.title', 'A datasheet')
            ->assertJsonPath('data.downloads.1.title', 'B guide')
            ->assertJsonPath('data.downloads.2.locked', true)
            ->assertJsonPath('data.downloads.0.file.extension', 'pdf');

        $this->getJson('/api/v1/store/products/shop-switch')->assertOk()
            ->assertJsonCount(1, 'data.downloads')->assertJsonPath('data.downloads.0.id', $first->id);

        $this->assertArrayNotHasKey('downloads', $this->getJson('/api/v1/products')->json('data.0'));
        $this->assertArrayNotHasKey('downloads', $this->getJson('/api/v1/store/products')->json('data.0'));
    }

    public function test_search_finds_a_download_and_opens_the_centre_on_it(): void
    {
        $shelf = DownloadCategory::create(['name' => 'Firmware']);
        $this->privateDownload(['title' => 'Aruba 6100 firmware', 'download_category_id' => $shelf->id, 'summary' => 'Release 10.13.']);
        $this->download(['title' => 'Aruba draft', 'status' => 'draft']);

        $group = collect($this->getJson('/api/v1/search?q=aruba')->assertOk()->json('data.groups'))->firstWhere('type', 'download');

        $this->assertSame('Downloads', $group['label']);
        $this->assertCount(1, $group['results']);
        $this->assertSame('/downloads?q=Aruba%206100%20firmware', $group['results'][0]['path']);
        $this->assertSame('Firmware', $group['results'][0]['kicker']);

        // The console's palette: a content manager finds it, drafts included; a support engineer does not.
        $palette = collect($this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/search?q=aruba')->json('data'))->firstWhere('type', 'download');
        $this->assertCount(2, $palette['items']);
        $this->assertStringStartsWith('/admin/downloads/', $palette['items'][0]['admin_path']);
        app('auth')->forgetGuards();

        $none = collect($this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')->getJson('/api/v1/admin/search?q=aruba')->json('data'))->firstWhere('type', 'download');
        $this->assertNull($none);
    }

    public function test_the_menu_link_appears_with_the_first_published_download(): void
    {
        $this->assertTrue(SiteSection::exists('downloads'));
        $this->assertSame('/downloads', SiteSection::path('downloads'));
        $this->assertTrue(ReservedSlugs::isFrontendRoute('downloads'));

        $menu = Menu::create(['name' => 'Footer', 'location' => 'footer']);
        MenuItem::create(['menu_id' => $menu->id, 'label' => 'Downloads', 'type' => MenuItemType::Section, 'target_key' => 'downloads', 'sort_order' => 1, 'is_active' => true]);
        MenuItem::create(['menu_id' => $menu->id, 'label' => 'Contact', 'type' => MenuItemType::Section, 'target_key' => 'contact', 'sort_order' => 2, 'is_active' => true]);

        $this->getJson('/api/v1/menus/footer')->assertOk()->assertJsonCount(1, 'data');

        $this->download();
        SiteSection::forgetContent();

        $this->getJson('/api/v1/menus/footer')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.href', '/downloads');
    }

    public function test_a_builder_downloads_section_reads_the_centre(): void
    {
        $shelf = DownloadCategory::create(['name' => 'Datasheets']);
        $first = $this->download(['title' => 'On the shelf', 'download_category_id' => $shelf->id, 'summary' => 'A line about it.']);
        $this->privateDownload(['title' => 'Unfiled firmware']);
        $this->download(['title' => 'Draft', 'status' => 'draft', 'download_category_id' => $shelf->id]);

        $section = fn (array $data) => ['id' => (string) Str::uuid(), 'type' => 'downloads', 'hidden' => false, 'background' => null, 'data' => $data];
        $this->actingAs($this->staff(), 'sanctum');

        // A typed list still needs its files; the centre needs none.
        $this->postJson('/api/v1/admin/pages', ['title' => 'Nothing', 'template' => 'builder', 'status' => 'published', 'blocks' => [$section(['heading' => 'Files'])]])
            ->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.items');
        $this->postJson('/api/v1/admin/pages', ['title' => 'Bad shelf', 'template' => 'builder', 'status' => 'published', 'blocks' => [$section(['source' => 'centre', 'category_id' => 999])]])
            ->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.category_id');

        $stored = $this->postJson('/api/v1/admin/pages', [
            'title' => 'Support files', 'template' => 'builder', 'status' => 'published',
            'blocks' => [
                $section(['heading' => 'Everything', 'source' => 'centre', 'limit' => '5', 'items' => [['title' => 'Stale', 'file_path' => 'media/x.pdf']]]),
                $section(['heading' => 'One shelf', 'source' => 'centre', 'category_id' => (string) $shelf->id]),
            ],
        ])->assertCreated()->json('data.blocks');

        // The centre's list keeps no typed files, and its numbers are numbers.
        $this->assertSame(['heading' => 'Everything', 'source' => 'centre', 'limit' => 5], $stored[0]['data']);
        $this->assertSame($shelf->id, $stored[1]['data']['category_id']);

        $sections = $this->getJson('/api/v1/pages/support-files')->assertOk()->json('data.sections');

        $this->assertCount(2, $sections[0]['data']['items']);
        $this->assertSame('/downloads', $sections[0]['data']['index_path']);
        $this->assertSame(
            ['title' => 'On the shelf', 'note' => 'A line about it.', 'version' => 'Rev. C', 'released_label' => '1 September 2026', 'download_id' => $first->id, 'size' => 2048, 'extension' => 'pdf'],
            $sections[0]['data']['items'][0],
        );
        $this->assertTrue($sections[0]['data']['items'][1]['locked']);
        $this->assertArrayNotHasKey('url', $sections[0]['data']['items'][1]);
        $this->assertCount(1, $sections[1]['data']['items']);

        // Nothing published drops the section, the rule every live list follows.
        Download::query()->update(['status' => PublishStatus::Draft]);
        $this->assertSame([], $this->getJson('/api/v1/pages/support-files')->json('data.sections'));

        // The builder is told which shelves a section may name.
        $this->getJson('/api/v1/admin/pages/builder')->assertOk()->assertJsonPath('data.download_categories.0.name', 'Datasheets');
    }

    // ---- The old page, and the samples -----------------------------------

    public function test_the_upgrade_step_moves_the_old_page_aside_and_keeps_its_menu_link(): void
    {
        $page = Page::create(['title' => 'Downloads', 'slug' => 'downloads', 'status' => 'published', 'body' => '<p>Ask us for documents.</p>']);
        Page::create(['title' => 'Taken', 'slug' => 'downloads-page', 'status' => 'draft']);
        $other = Page::create(['title' => 'Privacy', 'slug' => 'privacy', 'status' => 'published']);
        Redirect::create(['from_path' => '/downloads', 'to_path' => '/support', 'status_code' => 301, 'is_active' => true]);
        Redirect::create(['from_path' => '/files', 'to_path' => '/downloads', 'status_code' => 301, 'is_active' => true]);

        $menu = Menu::create(['name' => 'Footer', 'location' => 'footer']);
        $link = MenuItem::create(['menu_id' => $menu->id, 'label' => 'Downloads', 'type' => MenuItemType::Page, 'target_type' => 'page', 'target_id' => $page->id, 'sort_order' => 1, 'is_active' => true]);
        $kept = MenuItem::create(['menu_id' => $menu->id, 'label' => 'Privacy', 'type' => MenuItemType::Page, 'target_type' => 'page', 'target_id' => $other->id, 'sort_order' => 2, 'is_active' => true]);
        $redirects = Redirect::count();

        (new RetireDownloadsPage)->run();
        // Safe to run twice: a retried update must not move anything again.
        (new RetireDownloadsPage)->run();

        $page->refresh();
        $this->assertSame('downloads-page-2', $page->slug);
        $this->assertSame(PublishStatus::Draft, $page->status);
        $this->assertSame('<p>Ask us for documents.</p>', $page->body);

        // No 301 from /downloads was written, and the one that existed is gone;
        // a redirect *to* the centre is still right.
        $this->assertSame($redirects - 1, Redirect::count());
        $this->assertFalse(Redirect::where('from_path', '/downloads')->exists());
        $this->assertTrue(Redirect::where('to_path', '/downloads')->exists());

        $link->refresh();
        $this->assertSame(MenuItemType::Section, $link->type);
        $this->assertSame('downloads', $link->target_key);
        $this->assertNull($link->target_id);
        $this->assertSame(MenuItemType::Page, $kept->refresh()->type);

        // And a page can no longer be made at the centre's address.
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/pages', ['title' => 'Downloads', 'slug' => 'downloads', 'status' => 'draft'])
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_the_sample_seeder_makes_a_working_centre_once(): void
    {
        $product = Product::create(['name' => 'CBS350-24T', 'slug' => 'cbs350-24t', 'status' => 'published']);

        $this->seed(SampleDownloadSeeder::class);
        $this->seed(SampleDownloadSeeder::class);

        $this->assertSame(3, Download::count());
        $this->assertSame(3, DownloadCategory::count());
        $this->getJson('/api/v1/downloads')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/products/cbs350-24t')->assertOk()->assertJsonCount(2, 'data.downloads');
        $this->assertSame(2, $product->downloads()->count());

        $public = Download::where('title', 'Sample datasheet')->sole();
        $this->assertStringStartsWith('%PDF-1.4', (string) Storage::disk('public')->get($public->file_path));
        $this->getJson("/api/v1/downloads/{$public->id}/file")->assertOk();

        $locked = Download::where('access', 'customers')->sole();
        $this->getJson("/api/v1/downloads/{$locked->id}/file")->assertUnauthorized();
    }
}
