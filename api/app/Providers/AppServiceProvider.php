<?php

namespace App\Providers;

use App\Models\BlogPost;
use App\Models\CaseStudy;
use App\Models\Customer;
use App\Models\Industry;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
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
        ]);
    }
}
