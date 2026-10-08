<?php

namespace Database\Seeders;

use App\Enums\DownloadAccess;
use App\Enums\DownloadSource;
use App\Enums\PublishStatus;
use App\Models\Download;
use App\Models\DownloadCategory;
use App\Models\Media;
use App\Models\Product;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Downloads\DownloadFiles;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * A sample downloads centre (0.131.0, docs/downloads.md), demo only: three
 * shelves and three files, so `/downloads`, a product page's Downloads block
 * and the portal's list can be judged before a real file is uploaded.
 *
 * **Every row is a placeholder and says so** — the titles begin "Sample",
 * and the files are a one-line PDF and a short text file written here.
 * Listed on the must-not-ship list in CLAUDE.md; delete them before launch.
 *
 * Created only while there are no downloads at all, so a re-seed never puts
 * a deleted sample back beside real files. Two of the three are public
 * library PDFs; the third is a customers-only private upload, because that
 * path — the lock, the sign-in, the stream — is the one worth seeing work.
 */
class SampleDownloadSeeder extends Seeder
{
    public function run(): void
    {
        if (Download::query()->exists()) {
            return;
        }

        $shelves = [];
        foreach ([
            ['Datasheets', 'Specifications and dimensions for the hardware we supply.'],
            ['Drivers and software', 'Drivers, utilities and management software.'],
            ['Firmware', 'Firmware images and their release notes.'],
        ] as $i => [$name, $description]) {
            $shelves[$name] = DownloadCategory::query()->firstOrCreate(
                ['name' => $name],
                ['description' => $description, 'sort_order' => $i + 1, 'is_active' => true],
            );
        }

        $product = Product::query()->where('status', PublishStatus::Published)->orderBy('id')->first();
        $storeProduct = StoreProduct::query()->where('status', PublishStatus::Published)->orderBy('id')->first();

        $datasheet = Download::create([
            'download_category_id' => $shelves['Datasheets']->id,
            'title' => 'Sample datasheet',
            'summary' => 'A placeholder datasheet. Replace it with the manufacturer\'s own.',
            'version' => 'Rev. A',
            'released_on' => now()->subMonths(2)->toDateString(),
            'access' => DownloadAccess::Public,
            'source' => DownloadSource::Library,
            'file_path' => $this->pdf('sample-datasheet', 'Sample datasheet'),
            'status' => PublishStatus::Published,
            'sort_order' => 1,
        ]);

        $guide = Download::create([
            'download_category_id' => $shelves['Drivers and software']->id,
            'title' => 'Sample installation guide',
            'summary' => 'A placeholder guide, standing in for a driver package or a setup utility.',
            'version' => '1.0',
            'released_on' => now()->subMonth()->toDateString(),
            'access' => DownloadAccess::Public,
            'source' => DownloadSource::Library,
            'file_path' => $this->pdf('sample-installation-guide', 'Sample installation guide'),
            'status' => PublishStatus::Published,
            'sort_order' => 1,
        ]);

        $notes = "Sample firmware release notes\n\nA placeholder for a customers-only file. Replace it with a real firmware image.\n";
        $private = DownloadFiles::FOLDER.'/'.bin2hex(random_bytes(20)).'.txt';
        Storage::disk(DownloadFiles::DISK)->put($private, $notes);

        $firmware = Download::create([
            'download_category_id' => $shelves['Firmware']->id,
            'title' => 'Sample firmware release notes',
            'summary' => 'A placeholder for a file only signed-in customers may download.',
            'version' => '2.4.1',
            'released_on' => now()->subWeeks(2)->toDateString(),
            'access' => DownloadAccess::Customers,
            'source' => DownloadSource::Upload,
            'private_path' => $private,
            'file_name' => 'sample-firmware-release-notes.txt',
            'file_size' => strlen($notes),
            'file_mime' => 'text/plain',
            'status' => PublishStatus::Published,
            'sort_order' => 1,
        ]);

        if ($product) {
            $product->downloads()->syncWithoutDetaching([$datasheet->id, $firmware->id]);
        }
        if ($storeProduct) {
            $storeProduct->downloads()->syncWithoutDetaching([$datasheet->id, $guide->id]);
        }
    }

    /** A one-page PDF in the media library, as an editor's upload would be. */
    private function pdf(string $key, string $title): string
    {
        $path = "media/seed/downloads/{$key}.pdf";
        $bytes = self::onePage($title);

        Storage::disk('public')->put($path, $bytes);

        Media::updateOrCreate(['path' => $path], [
            'uploaded_by' => User::orderBy('id')->value('id'),
            'disk' => 'public',
            'filename' => "{$key}.pdf",
            'mime' => 'application/pdf',
            'size' => strlen($bytes),
            'width' => null,
            'height' => null,
            'alt_text' => $title,
        ]);

        return $path;
    }

    /**
     * The smallest honest PDF: one A4 page, one line of Helvetica, and a
     * cross-reference table whose offsets are counted rather than guessed —
     * a viewer that checks them opens it without a repair prompt.
     */
    private static function onePage(string $title): string
    {
        $text = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $title.' - placeholder file. Replace before launch.');
        $stream = "BT /F1 16 Tf 72 760 Td ({$text}) Tj ET";

        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            '<< /Length '.strlen($stream)." >>\nstream\n{$stream}\nendstream",
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $i => $body) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1)." 0 obj\n{$body}\nendobj\n";
        }

        $xref = strlen($pdf);
        $pdf .= 'xref'."\n0 ".(count($objects) + 1)."\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        return $pdf.'trailer'."\n<< /Size ".(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    }
}
