<?php

namespace App\Providers;

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
            'product' => \App\Models\Product::class,
            'product_category' => \App\Models\ProductCategory::class,
            'solution' => \App\Models\Solution::class,
            'service' => \App\Models\Service::class,
            'industry' => \App\Models\Industry::class,
            'page' => \App\Models\Page::class,
            'blog_post' => \App\Models\BlogPost::class,
            'case_study' => \App\Models\CaseStudy::class,
            'knowledge_article' => \App\Models\KnowledgeArticle::class,
            'customer' => \App\Models\Customer::class,
            'user' => \App\Models\User::class,
        ]);
    }
}
