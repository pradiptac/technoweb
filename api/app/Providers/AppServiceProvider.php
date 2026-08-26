<?php

namespace App\Providers;

use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\CaseStudy;
use App\Models\Customer;
use App\Models\Enquiry;
use App\Models\Faq;
use App\Models\Form;
use App\Models\Industry;
use App\Models\JobApplication;
use App\Models\JobExperienceLevel;
use App\Models\JobOpening;
use App\Models\JobQualification;
use App\Models\KnowledgeArticle;
use App\Models\Media;
use App\Models\MediaFolder;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Redirect;
use App\Models\Service;
use App\Models\Slider;
use App\Models\Solution;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\TicketCategory;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
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
        ]);
    }
}
