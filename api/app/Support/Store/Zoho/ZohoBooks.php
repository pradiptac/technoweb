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
