<?php

/**
 * Phase 17: a deliberately hostile conversation, so the design pass measures
 * stress rather than a two-line demo.
 *
 * Seeded rather than driven through the model: it costs nothing, the content is
 * deterministic (a long product name is long every run), and it is the only way
 * to test a twenty-message conversation without twenty API calls. Deleted
 * afterwards by id.
 */
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\StoreProduct;
use Illuminate\Contracts\Console\Kernel;

$product = StoreProduct::query()->published()->first();

$token = ChatConversation::newToken();

$conversation = ChatConversation::create([
    'session_token' => $token,
    'status' => 'active',
    'source_path' => '/',
    'source_title' => 'Home',
    'message_count' => 0,
    'tokens_used' => 0,
]);

$longName = 'Cisco Catalyst C9300-48UXM-A 48-Port Multigigabit UPOE+ Managed Layer 3 Stackable Enterprise Switch with Network Advantage Licence';
$unbroken = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSPARTNUMBER-C9300-48UXM-A-WITH-NETWORK-ADVANTAGE-0000123456789';

$turns = [
    ['user', 'Hi'],
    ['assistant', 'Hello. Ask me anything about our hardware, services or support and I will answer from what is published on this website.'],
    ['user', 'Do you sell managed switches?'],
    ['assistant', 'We carry managed switching across several ranges. The one below is published on the shop with its current price and availability.'],
    ['user', 'What about '.$unbroken.'?'],
    ['assistant', 'I cannot confirm that exact part from the website. Our team can tell you whether it is something we source.'],
    ['user', 'Tell me about your enterprise wireless offering and how you approach a site survey for a large warehouse with high racking'],
    ['assistant', 'Our Enterprise Wi-Fi work starts with a survey, because density and roaming behaviour in a racked warehouse are not things anybody should guess at. The page below sets out the approach.'],
    ['user', 'ok'],
    ['assistant', 'Is there anything else I can help with?'],
    ['user', 'what are your support hours'],
    ['assistant', 'I cannot confirm that from the information on our website, and I would rather not guess. Our team can answer it properly.'],
    ['user', 'fine, what about AMC'],
    ['assistant', 'We offer an IT infrastructure AMC. The page below covers what a contract includes.'],
    ['user', 'and storage?'],
    ['assistant', 'Storage and NAS is one of our solution areas. The page below has the detail.'],
    ['user', 'thanks'],
    ['assistant', 'You are welcome.'],
];

foreach ($turns as $i => [$role, $content]) {
    ChatMessage::create([
        'chat_conversation_id' => $conversation->id,
        'role' => $role,
        'content' => $content,
        'grounded' => $role === 'assistant' && $i !== 11,
        'intent' => $role === 'user' ? 'general' : null,
        'tokens' => $role === 'assistant' ? 120 : 0,
        'sources' => $role === 'assistant' && $i === 7 ? [
            ['title' => 'Enterprise Wi-Fi', 'url' => '/solutions/enterprise-wifi', 'label' => 'Solution'],
            ['title' => 'A very long knowledge base article title about controller managed wireless roaming behaviour', 'url' => '/knowledge-base/wifi', 'label' => 'Knowledge base'],
        ] : [],
        'actions' => $role === 'assistant' && $i === 13
            ? [['label' => 'Ask for a callback', 'url' => '/contact', 'primary' => true]]
            : [],
        'created_at' => now()->subMinutes(count($turns) - $i),
    ]);
}

// One product card, with a name long enough to break a layout.
if ($product) {
    ChatMessage::create([
        'chat_conversation_id' => $conversation->id,
        'role' => 'assistant',
        'content' => 'Here is the closest match we publish.',
        'grounded' => true,
        'tokens' => 90,
        'sources' => [[
            'title' => $longName,
            'url' => '/store/products/'.$product->slug,
            'label' => 'Store product',
            'product' => [
                'id' => $product->id,
                'slug' => $product->slug,
                'brand' => 'Cisco Systems International Limited',
                'image' => null,
                'price_paise' => 11800000,
                'compare_at_paise' => 14500000,
                'in_stock' => true,
                'returnable' => true,
                'type' => 'physical',
                'has_variations' => false,
                'specifications' => ['Ports' => '48 x 1G', 'Uplinks' => '4 x 10G SFP+'],
            ],
        ]],
        'actions' => [],
        'created_at' => now(),
    ]);
}

$conversation->update(['message_count' => $conversation->messages()->count()]);

echo "conversation_id={$conversation->id}\n";
echo "token={$token}\n";
