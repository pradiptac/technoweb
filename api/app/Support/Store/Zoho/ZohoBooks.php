<?php

namespace App\Support\Store\Zoho;

use App\Support\OAuth\OAuthConnection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The Zoho Books API, as far as this application uses it (0.134.0,
 * docs/store.md "Zoho Books invoices"): read the organisations and taxes,
 * find or make a customer, make an invoice, mark it sent, fetch its PDF.
 *
 * Laravel's HTTP client and nothing else — no SDK, the rule every other
 * integration here follows — so every call is one line an `Http::fake()` can
 * answer, and `ZohoBooksTest` drives all of it without a network.
 *
 * Two things about Zoho worth knowing before reading on:
 *
 *   - The token goes in `Authorization: Zoho-oauthtoken …`, not `Bearer`.
 *   - A refusal carries its reason in the body as `{code, message}` — and
 *     `code: 0` is success. The message is kept: it names the field.
 *
 * A 401 is retried once on a freshly refreshed token, because the cached one
 * may simply have been revoked or rotated; a second 401 is the account's
 * answer and is recorded on the connection (`zoho_books_error`).
 */
final class ZohoBooks
{
    /** @return list<array{id: string, name: string}> */
    public function organizations(): array
    {
        $body = $this->json('get', '/organizations', organization: false);

        return array_values(array_map(
            fn (array $o) => ['id' => (string) ($o['organization_id'] ?? ''), 'name' => (string) ($o['name'] ?? '')],
            array_filter((array) ($body['organizations'] ?? []), 'is_array'),
        ));
    }

    /**
     * The organisation's taxes and tax groups.
     *
     * @return list<array{id: string, name: string, percentage: float, kind: string}>
     */
    public function taxes(): array
    {
        $body = $this->json('get', '/settings/taxes');

        return array_values(array_map(
            fn (array $t) => [
                'id' => (string) ($t['tax_id'] ?? ''),
                'name' => (string) ($t['tax_name'] ?? ''),
                'percentage' => (float) ($t['tax_percentage'] ?? 0),
                // `tax_group` is CGST + SGST together; `igst` and friends arrive as the specific type.
                'kind' => (string) ($t['tax_specific_type'] ?? $t['tax_type'] ?? ''),
            ],
            array_filter((array) ($body['taxes'] ?? []), 'is_array'),
        ));
    }

    /** The customer whose primary contact has this address, or null. */
    public function findContact(string $email): ?string
    {
        $body = $this->json('get', '/contacts', ['email' => $email, 'per_page' => 1]);
        $id = $body['contacts'][0]['contact_id'] ?? null;

        return filled($id) ? (string) $id : null;
    }

    /** @param  array<string, mixed>  $payload */
    public function createContact(array $payload): string
    {
        $body = $this->json('post', '/contacts', json: $payload);
        $id = $body['contact']['contact_id'] ?? null;

        if (blank($id)) {
            throw new ZohoRefused('Zoho Books did not return the customer it was asked to create.');
        }

        return (string) $id;
    }

    /**
     * The invoice already carrying this order number as its reference, or
     * null. Asked before making one: a crash between "Zoho made it" and "we
     * wrote that down" must not become two invoices for one order.
     *
     * @return array<string, mixed>|null
     */
    public function findInvoice(string $reference): ?array
    {
        $body = $this->json('get', '/invoices', ['reference_number' => $reference, 'per_page' => 1]);
        $invoice = $body['invoices'][0] ?? null;

        // The filter is Zoho's; the equality is ours.
        return is_array($invoice) && ($invoice['reference_number'] ?? null) === $reference ? $invoice : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createInvoice(array $payload): array
    {
        $body = $this->json('post', '/invoices', json: $payload);
        $invoice = $body['invoice'] ?? null;

        if (! is_array($invoice) || blank($invoice['invoice_id'] ?? null)) {
            throw new ZohoRefused('Zoho Books did not return the invoice it was asked to create.');
        }

        return $invoice;
    }

    /** A new invoice is a draft; sent is what makes it a receivable in the books. */
    public function markSent(string $invoiceId): void
    {
        $this->json('post', "/invoices/{$invoiceId}/status/sent");
    }

    /** The invoice as Zoho prints it. */
    public function pdf(string $invoiceId): string
    {
        $bytes = $this->send('get', "/invoices/{$invoiceId}", ['accept' => 'pdf'])->body();

        if (! str_starts_with($bytes, '%PDF')) {
            throw new ZohoRefused('Zoho Books did not return a PDF for that invoice.');
        }

        return $bytes;
    }

    /* ------------------------------------ payments and credit notes (0.136.0) */

    /**
     * One invoice as Zoho holds it now: who it is billed to and what is
     * still owed on it — the two things a payment needs and this application
     * does not keep.
     *
     * @return array<string, mixed>
     */
    public function invoice(string $invoiceId): array
    {
        $invoice = $this->json('get', "/invoices/{$invoiceId}")['invoice'] ?? null;

        if (! is_array($invoice) || blank($invoice['customer_id'] ?? null)) {
            throw new ZohoRefused('Zoho Books did not return that invoice.');
        }

        return $invoice;
    }

    /**
     * The accounts money can be put into or paid out of: bank, cash, and the
     * current-asset accounts a gateway's clearing balance is usually kept in.
     *
     * @return list<array{id: string, name: string, type: string}>
     */
    public function accounts(): array
    {
        $body = $this->json('get', '/chartofaccounts', ['filter_by' => 'AccountType.Active', 'per_page' => 200]);

        $accounts = array_filter(
            (array) ($body['chartofaccounts'] ?? []),
            fn ($a) => is_array($a) && in_array($a['account_type'] ?? '', ['bank', 'cash', 'other_current_asset'], true),
        );

        return array_values(array_map(
            fn (array $a) => ['id' => (string) ($a['account_id'] ?? ''), 'name' => (string) ($a['account_name'] ?? ''), 'type' => (string) $a['account_type']],
            $accounts,
        ));
    }

    /** The customer payment already carrying this reference, or null — asked before recording one. */
    public function findPayment(string $reference): ?string
    {
        $body = $this->json('get', '/customerpayments', ['reference_number' => $reference, 'per_page' => 1]);
        $payment = $body['customerpayments'][0] ?? null;

        return is_array($payment) && ($payment['reference_number'] ?? null) === $reference && filled($payment['payment_id'] ?? null)
            ? (string) $payment['payment_id']
            : null;
    }

    /** @param  array<string, mixed>  $payload */
    public function createPayment(array $payload): string
    {
        $id = $this->json('post', '/customerpayments', json: $payload)['payment']['payment_id'] ?? null;

        if (blank($id)) {
            throw new ZohoRefused('Zoho Books did not return the payment it was asked to record.');
        }

        return (string) $id;
    }

    /**
     * The credit note already carrying this reference, or null.
     *
     * @return array<string, mixed>|null
     */
    public function findCreditNote(string $reference): ?array
    {
        $body = $this->json('get', '/creditnotes', ['reference_number' => $reference, 'per_page' => 1]);
        $note = $body['creditnotes'][0] ?? null;

        return is_array($note) && ($note['reference_number'] ?? null) === $reference && filled($note['creditnote_id'] ?? null) ? $note : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createCreditNote(array $payload): array
    {
        $note = $this->json('post', '/creditnotes', json: $payload)['creditnote'] ?? null;

        if (! is_array($note) || blank($note['creditnote_id'] ?? null)) {
            throw new ZohoRefused('Zoho Books did not return the credit note it was asked to create.');
        }

        return $note;
    }

    /**
     * A credit note as it stands: its number and what of it is still unused.
     *
     * @return array<string, mixed>
     */
    public function creditNote(string $creditNoteId): array
    {
        $note = $this->json('get', "/creditnotes/{$creditNoteId}")['creditnote'] ?? null;

        if (! is_array($note)) {
            throw new ZohoRefused('Zoho Books did not return that credit note.');
        }

        return $note;
    }

    /** Set some of a credit note against what is still owed on an invoice. */
    public function applyCreditNote(string $creditNoteId, string $invoiceId, float $amount): void
    {
        $this->json('post', "/creditnotes/{$creditNoteId}/invoices", json: [
            'invoices' => [['invoice_id' => $invoiceId, 'amount_applied' => $amount]],
        ]);
    }

    /**
     * Money paid back out against a credit note.
     *
     * @param  array<string, mixed>  $payload
     */
    public function refundCreditNote(string $creditNoteId, array $payload): string
    {
        $body = $this->json('post', "/creditnotes/{$creditNoteId}/refunds", json: $payload);
        $id = $body['creditnote_refund']['creditnote_refund_id'] ?? null;

        // Zoho has recorded it either way; without an id there is nothing to
        // keep, and the credit note's own balance is what a retry reads.
        return filled($id) ? (string) $id : '';
    }

    /**
     * @param  array<string, mixed>  $query
     * @param  array<string, mixed>|null  $json
     * @return array<string, mixed>
     */
    private function json(string $method, string $path, array $query = [], ?array $json = null, bool $organization = true): array
    {
        $body = $this->send($method, $path, $query, $json, $organization)->json();

        if (! is_array($body) || (int) ($body['code'] ?? -1) !== 0) {
            throw new ZohoRefused((string) ($body['message'] ?? 'Zoho Books answered in a form we could not read.'), 200);
        }

        return $body;
    }

    /**
     * @param  array<string, mixed>  $query
     * @param  array<string, mixed>|null  $json
     */
    private function send(string $method, string $path, array $query = [], ?array $json = null, bool $organization = true): Response
    {
        $oauth = OAuthConnection::zohoBooks();

        if ($organization) {
            $query = ['organization_id' => ZohoSettings::organizationId()] + $query;
        }

        $url = ZohoSettings::apiBase().$path.($query === [] ? '' : '?'.http_build_query($query));

        $call = function (string $token) use ($method, $url, $json): Response {
            $request = Http::withHeaders(['Authorization' => 'Zoho-oauthtoken '.$token])->connectTimeout(5)->timeout(25);

            return $method === 'post' ? $request->post($url, $json ?? []) : $request->get($url);
        };

        try {
            $response = $call($oauth->accessToken());

            if ($response->status() === 401) {
                $response = $call($oauth->refresh());
            }
        } catch (ConnectionException) {
            throw new ZohoRefused('Zoho Books could not be reached. It will be tried again.');
        } catch (RuntimeException $e) {
            // No account connected, or the refresh itself was refused (which
            // `OAuthConnection` has already written to `zoho_books_error`).
            throw new ZohoRefused($e->getMessage(), 401);
        }

        if ($response->failed()) {
            $message = (string) ($response->json('message') ?? "Zoho Books answered HTTP {$response->status()}.");

            if (in_array($response->status(), [401, 403], true)) {
                $oauth->fail($message);
            }

            throw new ZohoRefused($message, $response->status());
        }

        return $response;
    }
}
