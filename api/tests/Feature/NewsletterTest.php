<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Mail\CampaignMessage;
use App\Models\Media;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\AudienceResolver;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use App\Support\Newsletter\Spreadsheet;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The newsletter module.
 *
 * The tests worth having here are not the CRUD ones. This module mails
 * thousands of real people and keeps a do-not-mail list with legal weight, so
 * the failures worth engineering against are: mailing somebody who asked not
 * to be, mailing somebody twice, and losing an unsubscribe.
 */
class NewsletterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'nell-newsletter@example.test'],
            ['name' => 'Nell Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $role = Role::firstOrCreate(
                ['slug' => RoleEnum::Admin->value],
                ['name' => RoleEnum::Admin->label()],
            );
            $user->roles()->attach($role);
        }

        return $user;
    }

    private function subscriber(string $email, ?NewsletterGroup $group = null, array $attributes = []): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email, ...$attributes]);

        if ($group) {
            $s->groups()->attach($group->id);
        }

        return $s;
    }

    // ---------------------------------------------------------------- intake

    /**
     * The rule with legal weight, and the one every path must obey.
     *
     * Somebody who unsubscribed is on a spreadsheet a colleague uploads six
     * months later. If the import puts them back, the company mails a person
     * who asked it not to — which is the complaint this whole module is shaped
     * around avoiding.
     */
    public function test_a_suppressed_address_is_refused_however_it_arrives(): void
    {
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        foreach (['import', 'manual', 'signup', 'customer'] as $source) {
            $result = SubscriberIntake::take('GONE@Example.test', ['first_name' => 'Back'], [], $source);

            $this->assertSame(SubscriberIntake::SUPPRESSED, $result['outcome'], "source: {$source}");
        }

        $this->assertSame(0, NewsletterSubscriber::count());
    }

    /** Case is not identity. */
    public function test_addresses_are_matched_without_regard_to_case(): void
    {
        SubscriberIntake::take('John@Example.TEST', ['first_name' => 'John']);
        $second = SubscriberIntake::take('john@example.test', []);

        $this->assertSame(SubscriberIntake::DUPLICATE, $second['outcome']);
        $this->assertSame(1, NewsletterSubscriber::count());
        $this->assertSame('john@example.test', NewsletterSubscriber::first()->email);
    }

    /**
     * An import adds what it knows and never clears what it does not.
     *
     * A second spreadsheet with the address but no company column must not
     * erase a company somebody typed in — treating a missing column as an
     * instruction to blank the field is how a list quietly loses everything.
     */
    public function test_an_import_enriches_and_never_blanks(): void
    {
        SubscriberIntake::take('a@example.test', ['first_name' => 'Ann', 'company' => 'ABC Ltd']);
        SubscriberIntake::take('a@example.test', ['first_name' => '', 'company' => '', 'last_name' => 'Lee']);

        $s = NewsletterSubscriber::first();

        $this->assertSame('Ann', $s->first_name);
        $this->assertSame('ABC Ltd', $s->company);
        $this->assertSame('Lee', $s->last_name);
    }

    // -------------------------------------------------------------- audience

    /**
     * Who a campaign reaches, and everything that must be removed first.
     *
     * The one that is easy to get wrong is the duplicate: somebody in two of
     * the chosen groups is one contact and must receive one email.
     */
    public function test_the_audience_excludes_the_unmailable_and_deduplicates(): void
    {
        $a = NewsletterGroup::create(['name' => 'Group A']);
        $b = NewsletterGroup::create(['name' => 'Group B']);

        $both = $this->subscriber('both@example.test', $a);
        $both->groups()->attach($b->id);

        $this->subscriber('ok@example.test', $a);
        $this->subscriber('left@example.test', $a, ['status' => SubscriberStatus::Unsubscribed]);
        $this->subscriber('dead@example.test', $a, ['status' => SubscriberStatus::Bounced]);

        // Active, in the group, and suppressed anyway — the case a status
        // filter alone would let through, and the one a hard bounce creates.
        $this->subscriber('hidden@example.test', $a);
        NewsletterSuppression::add('hidden@example.test', SuppressionReason::HardBounce);

        $eligible = AudienceResolver::eligible([$a->id, $b->id]);

        $this->assertEqualsCanonicalizing(
            ['both@example.test', 'ok@example.test'],
            $eligible->pluck('email')->all(),
        );

        $preview = AudienceResolver::preview([$a->id, $b->id]);

        $this->assertSame(6, $preview['group_contacts']);
        $this->assertSame(1, $preview['duplicates_removed']);
        $this->assertSame(1, $preview['unsubscribed_removed']);
        $this->assertSame(1, $preview['bounced_removed']);
        $this->assertSame(1, $preview['suppressed_removed']);
        $this->assertSame(2, $preview['final_recipients']);
    }

    // ---------------------------------------------------------------- sending

    /**
     * A campaign is never sent twice.
     *
     * The worst mistake this module can make, and there is no undo. Two
     * requests arriving together — a double-click, a retried POST — must
     * produce one send.
     */
    public function test_a_campaign_cannot_be_queued_twice(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = $this->readyCampaign($group);

        $first = CampaignSender::queue($campaign->fresh());
        $second = CampaignSender::queue($campaign->fresh());

        $this->assertTrue($first['queued']);
        $this->assertFalse($second['queued']);
        $this->assertSame(1, $campaign->fresh()->recipients()->count());
    }

    /**
     * Somebody who unsubscribes mid-send does not get the rest of it.
     *
     * The list is frozen when the campaign is queued, and a large one takes
     * minutes to work through — so the recipient's eligibility is checked
     * again inside the batch, immediately before the send.
     */
    public function test_a_recipient_suppressed_after_freezing_is_skipped(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('leaver@example.test', $group);

        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        // They unsubscribe between the freeze and the batch running.
        NewsletterSuppression::add('leaver@example.test', SuppressionReason::Unsubscribed);

        (new SendCampaignBatch($campaign->id, [$recipient->id]))->handle();

        $this->assertSame('skipped', $recipient->fresh()->status);
    }

    // ----------------------------------------------------------- unsubscribe

    /** No login, no confirmation step, and safe to call twice. */
    public function test_unsubscribing_is_idempotent_and_suppresses_the_address(): void
    {
        $s = $this->subscriber('bye@example.test');
        $token = $s->unsubscribe_token;

        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();
        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();

        $this->assertSame(SubscriberStatus::Unsubscribed, $s->fresh()->status);
        $this->assertSame(1, NewsletterSuppression::count());
    }

    /**
     * The suppression outlives the subscriber row.
     *
     * That is the entire reason suppressions are keyed on the address. Delete
     * somebody and re-import them, and they must stay off the list.
     */
    public function test_a_suppression_survives_deleting_the_subscriber(): void
    {
        $s = $this->subscriber('bye@example.test');
        $this->postJson("/api/v1/newsletter/unsubscribe/{$s->unsubscribe_token}")->assertOk();

        $s->delete();

        $this->assertSame(
            SubscriberIntake::SUPPRESSED,
            SubscriberIntake::take('bye@example.test', [], [], 'import')['outcome'],
        );
    }

    /** Staff may undo a bounce; they may not undo somebody's decision. */
    public function test_staff_cannot_lift_a_suppression_the_person_chose(): void
    {
        $theirs = NewsletterSuppression::add('left@example.test', SuppressionReason::Unsubscribed);
        $ours = NewsletterSuppression::add('dead@example.test', SuppressionReason::HardBounce);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$theirs->id}")
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$ours->id}")
            ->assertNoContent();
    }

    /** The signup form must not reveal who is already on the list. */
    public function test_signing_up_answers_identically_for_every_address(): void
    {
        $this->subscriber('known@example.test');
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $responses = collect(['new@example.test', 'known@example.test', 'gone@example.test'])
            ->map(fn ($email) => $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email]));

        foreach ($responses as $response) {
            $response->assertStatus(202);
        }

        // Byte-identical, not merely all-successful — the distinction
        // `CustomerRegistrationTest` already makes for the same reason.
        $this->assertCount(1, $responses->map(fn ($r) => $r->getContent())->unique());
    }

    // --------------------------------------------------------- health check

    /**
     * A campaign with no way out is refused, whatever it scores.
     *
     * The blocking checks are the legal ones, and they are re-run on the
     * server at the moment of sending rather than read from a stored number.
     */
    public function test_a_campaign_without_an_unsubscribe_link_cannot_be_sent(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = NewsletterCampaign::create([
            'name' => 'No way out',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Words that fill the body. ', 20).'</p></body></html>',
            'text_content' => str_repeat('Words that fill the body. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);
        $campaign->groups()->attach($group->id);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/send")
            ->assertStatus(422);

        $this->assertContains('An unsubscribe link', $response->json('errors.health'));
        $this->assertSame(CampaignStatus::Draft, $campaign->fresh()->status);
    }

    /** Scored out of what applies, so a text-only campaign is not punished
     *  for the image checks it can never satisfy. */
    public function test_image_checks_do_not_apply_to_a_campaign_with_no_images(): void
    {
        $campaign = new NewsletterCampaign([
            'subject' => 'A subject of reasonable length',
            'html_content' => '<html><body><p>'.str_repeat('Plenty of readable words here. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Plenty of readable words here. ', 20),
        ]);

        $keys = array_column(HealthCheck::run($campaign)['checks'], 'key');

        $this->assertNotContains('alt_text', $keys);
        $this->assertNotContains('image_ratio', $keys);
    }

    /**
     * A created campaign comes back shaped like every read of one.
     *
     * `response()->json($resource)` serialises through `jsonSerialize()`,
     * which drops the `data` wrapper — so the client's `res.data` is undefined
     * and the console reports "could not be created" for a campaign that was
     * created. It has happened twice in this codebase now, on two different
     * modules, which is what earns a test rather than a comment.
     */
    public function test_a_created_campaign_is_wrapped_like_every_other_read(): void
    {
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/campaigns', [
                'name' => 'Wrapped',
                'subject' => 'A subject long enough to pass',
            ])
            ->assertCreated();

        $this->assertIsInt($response->json('data.id'));
        $this->assertSame('Wrapped', $response->json('data.name'));
    }

    // ------------------------------------------------------ ways in

    /**
     * A spreadsheet is read by its bytes, not its extension.
     *
     * People rename files, and "contacts.csv" is regularly an xlsx somebody
     * renamed. Read as text it produces one unreadable column and reports every
     * row invalid, which looks like the importer being broken.
     */
    public function test_an_xlsx_is_read_whatever_it_is_called(): void
    {
        $path = $this->xlsx();

        // Deliberately named `.csv`, which is the case that used to fail.
        $renamed = str_replace('.xlsx', '.csv', $path);
        copy($path, $renamed);

        $parsed = Spreadsheet::read($renamed);

        $this->assertSame('xlsx', $parsed['format']);
        $this->assertSame(['email', 'first_name', 'company'], $parsed['headers']);

        @unlink($path);
        @unlink($renamed);
    }

    /**
     * A missing cell keeps its column.
     *
     * The bug this reader would otherwise have: a row with an empty column
     * simply omits that `<c>` element, so `A,C` arrives as two cells and a
     * reader that appends them in order shifts everything left from the gap.
     * The company column silently becomes the first-name column for some rows
     * and not others — which is not a crash, it is bad data.
     */
    public function test_a_gap_in_a_spreadsheet_row_does_not_shift_the_columns(): void
    {
        $path = $this->xlsx();
        $rows = Spreadsheet::read($path)['rows'];

        // Row two has no first name: A and C only.
        $this->assertSame('bob@sheet.test', $rows[1][0]);
        $this->assertSame('', $rows[1][1]);
        $this->assertSame('Gap Ltd', $rows[1][2]);

        @unlink($path);
    }

    /**
     * A file of bare addresses has no header row, and must not lose its first
     * one.
     *
     * The first real file anybody uploaded was exactly this — a `.txt` holding
     * one address — and the importer ate it as a column heading and reported
     * "0 rows", which reads as the file being empty. No legitimate heading is a
     * valid email address, so a first row containing one is data.
     */
    public function test_a_file_with_no_header_row_keeps_its_first_address(): void
    {
        $path = $this->csv("pradiptac@example.test\n");
        $parsed = Spreadsheet::read($path);

        $this->assertFalse($parsed['has_header']);
        $this->assertSame(['Column 1'], $parsed['headers']);
        $this->assertSame([['pradiptac@example.test']], $parsed['rows']);

        // And the email column is found from the data, so the wizard opens
        // ready to import rather than saying "Not in this file" for the one
        // field that is required.
        $mapping = Csv::guessMapping($parsed['headers'], $parsed['rows']);
        $this->assertSame(0, $mapping['email']);

        @unlink($path);
    }

    /** A real header row is still treated as one. */
    public function test_a_header_row_is_not_mistaken_for_data(): void
    {
        $path = $this->csv("email,first_name\nann@example.test,Ann\n");
        $parsed = Spreadsheet::read($path);

        $this->assertTrue($parsed['has_header']);
        $this->assertSame(['email', 'first_name'], $parsed['headers']);
        $this->assertCount(1, $parsed['rows']);

        @unlink($path);
    }

    /**
     * A heading nobody anticipated still finds its column.
     *
     * "Contact e-mail 1" matches none of the candidate names, and before this
     * the mapping came back empty for a file that is otherwise perfectly
     * ordinary.
     */
    public function test_the_email_column_is_found_when_the_heading_is_unusual(): void
    {
        $path = $this->csv("Full Name,Contact e-mail 1\nAnn Lee,ann@example.test\nBob Roy,bob@example.test\n");
        $parsed = Spreadsheet::read($path);

        $mapping = Csv::guessMapping($parsed['headers'], $parsed['rows']);

        $this->assertSame(1, $mapping['email']);

        @unlink($path);
    }

    /**
     * A column that merely mentions an address is not the address column.
     *
     * The majority of sampled values must parse, or a notes column containing
     * one address would be chosen over the real one.
     */
    public function test_a_notes_column_is_not_mistaken_for_the_address_column(): void
    {
        $path = $this->csv(
            "Notes,Contact e-mail 1\n"
            ."rang on Tuesday,ann@example.test\n"
            ."forwarded from bob@example.test,bob@example.test\n"
            ."no answer,carol@example.test\n"
        );

        $mapping = Csv::guessMapping(
            Spreadsheet::read($path)['headers'],
            Spreadsheet::read($path)['rows'],
        );

        $this->assertSame(1, $mapping['email']);

        @unlink($path);
    }

    /** The legacy binary `.xls` is named rather than parsed as gibberish. */
    public function test_a_legacy_xls_is_recognised(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.xls';
        file_put_contents($path, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1".str_repeat("\x00", 64));

        $this->assertTrue(Spreadsheet::isLegacyExcel($path));
        $this->assertFalse(Spreadsheet::isLegacyExcel($this->csv("email\na@b.test\n")));

        @unlink($path);
    }

    /**
     * Pasting a list is the third way in, and it takes what a paste looks like.
     *
     * Newlines, commas, semicolons and `Name <address>` as a mail client
     * writes it — because the alternative is telling somebody with eleven
     * addresses in an email to type them into a four-field form eleven times.
     */
    public function test_pasting_a_list_adds_everybody_and_keeps_the_names(): void
    {
        NewsletterSuppression::add('gone@paste.test', SuppressionReason::Unsubscribed);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/subscribers/paste', [
                'text' => "ann@paste.test\n"
                    ."Priya Nair <priya@paste.test>, bob@paste.test;carol@paste.test\n"
                    ."ANN@paste.test\n"
                    ."gone@paste.test\n"
                    ."not-an-address\n",
            ])
            ->assertOk();

        $this->assertSame(4, $response->json('data.added'));
        // The repeat inside the paste itself, which is the common case when
        // two lists are copied together.
        $this->assertSame(1, $response->json('data.already'));
        $this->assertSame(1, $response->json('data.suppressed'));
        $this->assertSame(1, $response->json('data.invalid'));

        // The name in angle brackets is kept — the difference between "Hello
        // there" and "Hello Priya" in the first campaign.
        $priya = NewsletterSubscriber::where('email', 'priya@paste.test')->firstOrFail();
        $this->assertSame('Priya', $priya->first_name);
        $this->assertSame('Nair', $priya->last_name);

        // Named, not just counted: "1 invalid" with no way to see which one
        // means retyping the paste to find the typo.
        $this->assertNotEmpty($response->json('data.rejected'));
    }

    // ---------------------------------------------------------------- safety

    /** An export is opened in Excel, and Excel executes a leading `=`. */
    public function test_csv_export_escapes_formula_injection(): void
    {
        $this->assertSame("'=HYPERLINK(\"http://x\")", Csv::escape('=HYPERLINK("http://x")'));
        $this->assertSame("'+1", Csv::escape('+1'));
        $this->assertSame("'@x", Csv::escape('@x'));
        $this->assertSame('ABC Ltd', Csv::escape('ABC Ltd'));
    }

    /** A mail merge that leaves `{{firstname}}` in somebody's inbox is the
     *  most obviously amateur thing a mailing can do. */
    public function test_unknown_placeholders_are_removed_rather_than_sent(): void
    {
        $out = EmailRenderer::personalise('Hi {{first_name}}, {{firstname}} {{nonsense}}', null);

        $this->assertStringContainsString('Hi there,', $out);
        $this->assertStringNotContainsString('{{', $out);
    }

    /** A test send must not touch the figures the report is drawn from. */
    public function test_a_test_send_creates_no_recipient_and_no_events(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => 'Kolkata', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);

        $campaign = NewsletterCampaign::create([
            'name' => 'Test only',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Out</a></body></html>',
            'text_content' => 'Hello',
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/test");

        $response->assertOk();

        $this->assertSame(0, $campaign->recipients()->count());
        $this->assertSame(0, $campaign->events()->count());
        $this->assertNotNull($campaign->fresh()->test_sent_at);
    }

    /** The pixel answers identically whatever the token, so nothing can be
     *  probed with it — and records the open once. */
    public function test_the_open_pixel_is_constant_and_stamps_once(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('reader@example.test', $group);
        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        $real = $this->get("/api/v1/newsletter/open/{$recipient->token}")->assertOk();
        $fake = $this->get('/api/v1/newsletter/open/not-a-real-token')->assertOk();

        $this->assertSame($real->getContent(), $fake->getContent());
        $this->assertSame('image/gif', $real->headers->get('Content-Type'));

        $first = $recipient->fresh()->opened_at;
        $this->get("/api/v1/newsletter/open/{$recipient->token}");

        // Stamped once; the second open is an event, not a new timestamp.
        $this->assertEquals($first, $recipient->fresh()->opened_at);
        $this->assertSame(2, $campaign->events()->where('event_type', 'opened')->count());
    }

    /** A real xlsx, written here so the test does not depend on a fixture file. */
    private function xlsx(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.xlsx';

        $shared = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<si><t>email</t></si><si><t>first_name</t></si><si><t>company</t></si>'
            .'<si><t>ann@sheet.test</t></si><si><r><t>An</t></r><r><t>n</t></r></si>'
            .'<si><t>Ridge &amp; Co</t></si><si><t>bob@sheet.test</t></si><si><t>Gap Ltd</t></si>'
            .'</sst>';

        // Row 3 omits column B entirely — the gap this reader must survive.
        $sheet = '<?xml version="1.0" encoding="UTF-8"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            .'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
            .'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>'
            .'<row r="3"><c r="A3" t="s"><v>6</v></c><c r="C3" t="s"><v>7</v></c></row>'
            .'</sheetData></worksheet>';

        self::writeZip($path, [
            'xl/sharedStrings.xml' => $shared,
            'xl/worksheets/sheet1.xml' => $sheet,
        ]);

        return $path;
    }

    /**
     * An attachment is stored by path, and its name and size are copied.
     *
     * Copied rather than joined, for the reason the activity log copies its
     * actor: the media row can be renamed or deleted afterwards, and what was
     * sent must not change. The stored filename is a hash, so without the human
     * name the recipient's downloads folder fills with `a8f3c1....pdf`.
     */
    public function test_an_attachment_is_stored_with_the_name_and_size_of_the_file(): void
    {
        $media = Media::create([
            'filename' => 'Company brochure.pdf',
            'path' => 'media/brochure-test.pdf',
            'disk' => 'public',
            'mime' => 'application/pdf',
            'size' => 348_112,
        ]);

        $campaign = NewsletterCampaign::create([
            'name' => 'With a brochure', 'subject' => 'Our brochure',
            'status' => CampaignStatus::Draft,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}", [
                'attachment_path' => 'media/brochure-test.pdf',
            ])
            ->assertOk()
            ->assertJsonPath('data.attachment_name', 'Company brochure.pdf')
            ->assertJsonPath('data.attachment_bytes', 348_112);

        $media->forceDelete();
    }

    /**
     * A path with no media row behind it is refused rather than stored.
     *
     * Storing it would be an attachment that silently fails to attach: the
     * campaign reports one, the mailable finds no file, and every recipient
     * gets the message without the thing it refers to.
     */
    public function test_an_attachment_path_with_no_file_behind_it_is_not_stored(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Phantom', 'subject' => 'Phantom',
            'status' => CampaignStatus::Draft,
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}", [
                'attachment_path' => 'media/does-not-exist.pdf',
            ])
            ->assertOk()
            ->assertJsonPath('data.attachment_path', null);
    }

    /**
     * The mailable attaches the file, under its human name.
     *
     * Built for real rather than asserted about, the same reasoning
     * `OutgoingMailTest` follows for the API transports: whether an attachment
     * is actually on the message is not something a stored column can tell you.
     */
    public function test_the_message_carries_the_attachment(): void
    {
        Storage::disk('public')->put('media/brochure-test.pdf', '%PDF-1.4 test');

        $campaign = NewsletterCampaign::create([
            'name' => 'With a brochure', 'subject' => 'Our brochure',
            'status' => CampaignStatus::Draft,
            'attachment_path' => 'media/brochure-test.pdf',
            'attachment_name' => 'Company brochure.pdf',
            'attachment_bytes' => 13,
        ]);

        $recipient = NewsletterCampaignRecipient::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => NewsletterSubscriber::create([
                'email' => 'reader@example.test', 'status' => SubscriberStatus::Active,
            ])->id,
            'email' => 'reader@example.test',
        ]);

        $built = (new CampaignMessage($campaign, '<p>Hello</p>', 'Hello', $recipient))->attachments();

        $this->assertCount(1, $built);
        $this->assertSame('Company brochure.pdf', $built[0]->as);

        Storage::disk('public')->delete('media/brochure-test.pdf');
    }

    /**
     * A file deleted after the campaign was queued is skipped, not thrown on.
     *
     * The message is worth sending without its brochure; a campaign that fails
     * wholesale part-way through a list because somebody tidied the media
     * library is the worse outcome, and it is unrecoverable — the sender has
     * already delivered to everyone before the failure.
     */
    public function test_a_missing_attachment_file_does_not_stop_the_send(): void
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'Gone', 'subject' => 'Gone',
            'status' => CampaignStatus::Draft,
            'attachment_path' => 'media/deleted-since.pdf',
            'attachment_name' => 'Gone.pdf',
        ]);

        $recipient = NewsletterCampaignRecipient::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => NewsletterSubscriber::create([
                'email' => 'reader2@example.test', 'status' => SubscriberStatus::Active,
            ])->id,
            'email' => 'reader2@example.test',
        ]);

        $this->assertSame([], (new CampaignMessage($campaign, '<p>Hi</p>', 'Hi', $recipient))->attachments());
    }

    private function csv(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.csv';
        file_put_contents($path, $contents);

        return $path;
    }

    /**
     * A minimal ZIP writer, so the test builds the same kind of container the
     * reader has to open — `ext-zip` is not available here, which is the whole
     * reason `Xlsx` reads the format itself.
     *
     * @param  array<string, string>  $files
     */
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

    private function readyCampaign(NewsletterGroup $group): NewsletterCampaign
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'A campaign',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Ready,
        ]);

        $campaign->groups()->attach($group->id);

        return $campaign;
    }
}
