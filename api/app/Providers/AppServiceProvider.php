<?php

namespace App\Providers;

use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\Customer;
use App\Models\DigitalCode;
use App\Models\Enquiry;
use App\Models\Faq;
use App\Models\Form;
use App\Models\Industry;
use App\Models\JobApplication;
use App\Models\JobExperienceLevel;
use App\Models\JobOpening;
use App\Models\JobQualification;
use App\Models\KnowledgeArticle;
use App\Models\LandingPage;
use App\Models\Location;
use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterTemplate;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Page;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Redirect;
use App\Models\Service;
use App\Models\Slider;
use App\Models\Solution;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\QueueHealth;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        /*
         * A worker's pulse, written by the worker itself.
         *
         * "Is anything going to deliver this" has two right answers — the
         * scheduler's minutely `queue:work`, and a bare `queue:work` somebody
         * is running by hand or under supervisor — and a check that knows only
         * about the first tells an operator with a worker running that nothing
         * is delivering mail. That is worse than saying nothing: it sends them
         * to fix a cron entry while the thing they need is already up.
         *
         * `Queue::looping` fires inside the worker process, so this measures
         * the process that actually sends rather than a proxy for it. Throttled
         * on a static rather than by reading the cache first: the event fires
         * on every poll, and a read plus a write every second is a database
         * round trip a second for a fact that changes once a minute.
         */
        Queue::looping(function () {
            static $last = 0;

            if (time() - $last < QueueHealth::PULSE_SECONDS) {
                return;
            }

            $last = time();

            try {
                Cache::put(QueueHealth::WORKER_KEY, $last);
            } catch (\Throwable) {
                // A cache this cannot write is a status panel that says
                // "cannot tell", never a worker that stops delivering mail.
            }
        });

        // Fail loudly in development when a relation is used without eager
        // loading, rather than shipping an N+1 to production unnoticed.
        Model::preventLazyLoading(! app()->isProduction());
        Model::preventSilentlyDiscardingAttributes(! app()->isProduction());

        if (app()->isProduction()) {
            URL::forceScheme('https');
        }

        // Stable morph keys: polymorphic rows store "product", not the FQCN, so
        // moving or renaming a class never breaks existing data.
        Relation::enforceMorphMap([
            'product' => Product::class,
            'product_category' => ProductCategory::class,
            'solution' => Solution::class,
            'service' => Service::class,
            'industry' => Industry::class,
            'page' => Page::class,
            'blog_post' => BlogPost::class,
            'case_study' => CaseStudy::class,
            'knowledge_article' => KnowledgeArticle::class,
            'customer' => Customer::class,
            'user' => User::class,

            /*
             * Everything below is here because it can be the *subject* of an
             * activity log entry, and `enforceMorphMap` throws for a model it
             * does not know. That threw away a deletion the first time one was
             * recorded: the row was dropped, and an audit log that loses the
             * event is worse than one that never claimed to hold it.
             *
             * Anything bindable in an admin route belongs in this list.
             */
            'brand' => Brand::class,
            'landing_page' => LandingPage::class,
            'location' => Location::class,
            'slider' => Slider::class,
            'form' => Form::class,
            'faq' => Faq::class,
            'media' => Media::class,
            'media_folder' => MediaFolder::class,
            'redirect' => Redirect::class,
            'ticket' => Ticket::class,
            'ticket_attachment' => TicketAttachment::class,
            'ticket_category' => TicketCategory::class,
            'enquiry' => Enquiry::class,
            'job_opening' => JobOpening::class,
            'job_application' => JobApplication::class,
            'job_qualification' => JobQualification::class,
            'job_experience_level' => JobExperienceLevel::class,
            'menu' => Menu::class,
            'menu_item' => MenuItem::class,
            'newsletter_subscriber' => NewsletterSubscriber::class,
            'newsletter_group' => NewsletterGroup::class,
            'newsletter_campaign' => NewsletterCampaign::class,
            'newsletter_template' => NewsletterTemplate::class,

            /*
             * The store's own catalogue. `store_product` rather than
             * `product`: they are different tables with their own ids, and a
             * morph key that collided would point a store product's SEO row at
             * a catalogue product with the same number.
             */
            'store_product' => StoreProduct::class,
            'store_category' => StoreCategory::class,
            'store_product_variation' => StoreProductVariation::class,
            'order' => Order::class,
            'order_item' => OrderItem::class,
            'payment' => Payment::class,
            'digital_code' => DigitalCode::class,
        ]);
    }
}
