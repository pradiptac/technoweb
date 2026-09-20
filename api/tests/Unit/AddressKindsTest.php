<?php

namespace Tests\Unit;

use App\Support\Newsletter\AddressKinds;
use App\Support\Newsletter\FolderPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The lists a mailbox scan's review is built from. Each is a heuristic the
 * reviewer can override on screen, which is why the cases here are about
 * *where the line is* — `info@` is a customer, `noreply@` is not — rather
 * than about coverage.
 */
class AddressKindsTest extends TestCase
{
    #[DataProvider('roles')]
    public function test_a_role_address_is_one_a_machine_answers(string $email, bool $expected): void
    {
        $this->assertSame($expected, AddressKinds::isRole($email));
    }

    /** @return array<string, array{string, bool}> */
    public static function roles(): array
    {
        return [
            'noreply' => ['noreply@vendor.example', true],
            'no-reply upper' => ['No-Reply@vendor.example', true],
            'mailer-daemon' => ['MAILER-DAEMON@mx.example', true],
            'notifications' => ['notifications@github.com', true],
            'abuse' => ['abuse@isp.example', true],
            'a person' => ['priya.nair@client.example', false],
            'info is a customer here' => ['info@client.example', false],
            'sales is a customer here' => ['sales@client.example', false],
            'support is a customer here' => ['support@client.example', false],
        ];
    }

    #[DataProvider('domains')]
    public function test_a_domain_is_ours_or_a_machines_or_neither(string $domain, ?string $expected): void
    {
        $this->assertSame($expected, AddressKinds::domainKind($domain, ['technoware.in', 'altisinfonet.in']));
    }

    /** @return array<string, array{string, ?string}> */
    public static function domains(): array
    {
        return [
            'own' => ['technoware.in', 'own'],
            'own subdomain' => ['mail.technoware.in', 'own'],
            'lookalike is not own' => ['technoware.in.attacker.test', null],
            'ses' => ['email.amazonses.com', 'machine'],
            'bounce prefix' => ['bounces.crm.example', 'machine'],
            'notifications prefix' => ['notifications.example.com', 'machine'],
            'a bare prefix-looking domain is not' => ['news.example', null],
            'linkedin' => ['bounce.linkedin.com', 'machine'],
            'a client' => ['client.example', null],
            'freemail is neither' => ['gmail.com', null],
        ];
    }

    public function test_freemail_is_never_an_own_domain_even_when_the_account_is_freemail(): void
    {
        // The list a mailbox on gmail.com produces must not untick every Gmail contact.
        $this->assertTrue(AddressKinds::isFreemail('gmail.com'));
        $this->assertTrue(AddressKinds::isFreemail('Rediffmail.com'));
        $this->assertFalse(AddressKinds::isFreemail('client.example'));
    }

    #[DataProvider('names')]
    public function test_a_display_name_splits_the_way_a_person_would(?string $display, ?string $email, array $expected): void
    {
        $this->assertSame($expected, AddressKinds::nameSplit($display, $email));
    }

    /** @return array<string, array{?string, ?string, array{?string, ?string}}> */
    public static function names(): array
    {
        return [
            'first last' => ['Priya Nair', null, ['Priya', 'Nair']],
            'three words keep the rest as last' => ['Priya Devi Nair', null, ['Priya', 'Devi Nair']],
            'outlook last, first' => ['Nair, Priya', null, ['Priya', 'Nair']],
            'quoted' => ['"Priya Nair"', null, ['Priya', 'Nair']],
            'single word' => ['Priya', null, ['Priya', null]],
            'the address itself is no name' => ['priya@client.example', 'priya@client.example', [null, null]],
            'anything with an at sign is no name' => ['Priya <priya@client.example>', null, [null, null]],
            'blank' => ['   ', null, [null, null]],
            'null' => [null, null, [null, null]],
        ];
    }

    #[DataProvider('folders')]
    public function test_a_folder_is_read_or_skipped_by_flag_first_and_name_second(array $folder, bool $includeJunk, ?string $expected): void
    {
        $this->assertSame($expected, FolderPolicy::classify($folder + ['no_select' => false, 'flags' => []], $includeJunk));
    }

    /** @return array<string, array{array<string, mixed>, bool, ?string}> */
    public static function folders(): array
    {
        return [
            'inbox' => [['path' => 'INBOX', 'name' => 'INBOX'], false, null],
            'sent by flag' => [['path' => '[Gmail]/Sent Mail', 'name' => 'Sent Mail', 'flags' => ['\\HasNoChildren', '\\Sent']], false, null],
            'all mail by flag' => [['path' => '[Gmail]/All Mail', 'name' => 'All Mail', 'flags' => ['\\All']], false, 'virtual'],
            'all mail by name' => [['path' => '[Google Mail]/All Mail', 'name' => 'All Mail'], false, 'virtual'],
            'junk by flag' => [['path' => 'Spam', 'name' => 'Spam', 'flags' => ['\\Junk']], false, 'junk'],
            'junk by flag, included' => [['path' => 'Spam', 'name' => 'Spam', 'flags' => ['\\Junk']], true, null],
            'localised trash by flag' => [['path' => 'Éléments supprimés', 'name' => 'Éléments supprimés', 'flags' => ['\\Trash']], false, 'trash'],
            'deleted items by name' => [['path' => 'Deleted Items', 'name' => 'Deleted Items'], false, 'trash'],
            'drafts included with junk' => [['path' => 'Drafts', 'name' => 'Drafts'], true, null],
            'o365 calendar never' => [['path' => 'Calendar', 'name' => 'Calendar'], true, 'system'],
            'sync issues never' => [['path' => 'Sync Issues/Conflicts', 'name' => 'Sync Issues (This computer only)'], true, 'system'],
            'noselect parent' => [['path' => '[Gmail]', 'name' => '[Gmail]', 'no_select' => true], true, 'noselect'],
            'a project folder' => [['path' => 'Clients/Meridian', 'name' => 'Meridian'], false, null],
        ];
    }

    public function test_the_sent_folder_is_known_by_flag_or_by_name(): void
    {
        $this->assertTrue(FolderPolicy::isSent(['path' => 'Éléments envoyés', 'name' => 'Éléments envoyés', 'flags' => ['\\Sent']]));
        $this->assertTrue(FolderPolicy::isSent(['path' => 'Sent Items', 'name' => 'Sent Items', 'flags' => []]));
        $this->assertTrue(FolderPolicy::isSent(['path' => '[Gmail]/Sent Mail', 'name' => 'Sent Mail', 'flags' => []]));
        $this->assertFalse(FolderPolicy::isSent(['path' => 'INBOX', 'name' => 'INBOX', 'flags' => []]));
    }
}
