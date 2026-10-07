<?php

use App\Http\Controllers\Api\V1\Admin\BlogCategoryController as AdminBlogCategoryController;
use App\Http\Controllers\Api\V1\Admin\BlogCommentController as AdminBlogCommentController;
use App\Http\Controllers\Api\V1\Admin\BlogPostController as AdminBlogPostController;
use App\Http\Controllers\Api\V1\Admin\BrandController as AdminBrandController;
use App\Http\Controllers\Api\V1\Admin\CaseStudyController as AdminCaseStudyController;
use App\Http\Controllers\Api\V1\Admin\CertificationController as AdminCertificationController;
use App\Http\Controllers\Api\V1\Admin\ClientController as AdminClientController;
use App\Http\Controllers\Api\V1\Admin\ContentBlockController as AdminContentBlockController;
use App\Http\Controllers\Api\V1\Admin\ContentTypeController;
use App\Http\Controllers\Api\V1\Admin\CustomFieldGroupController;
use App\Http\Controllers\Api\V1\Admin\EntryController;
use App\Http\Controllers\Api\V1\Admin\EventController as AdminEventController;
use App\Http\Controllers\Api\V1\Admin\FaqController as AdminFaqController;
use App\Http\Controllers\Api\V1\Admin\FormController as AdminFormController;
use App\Http\Controllers\Api\V1\Admin\GalleryController as AdminGalleryController;
use App\Http\Controllers\Api\V1\Admin\IndustryController as AdminIndustryController;
use App\Http\Controllers\Api\V1\Admin\JobOpeningController;
use App\Http\Controllers\Api\V1\Admin\JobReferenceController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeArticleController as AdminKnowledgeArticleController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\MediaFolderController;
use App\Http\Controllers\Api\V1\Admin\MenuController as AdminMenuController;
use App\Http\Controllers\Api\V1\Admin\PageController as AdminPageController;
use App\Http\Controllers\Api\V1\Admin\PopupController as AdminPopupController;
use App\Http\Controllers\Api\V1\Admin\ProductCategoryController as AdminProductCategoryController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\SavedSectionController;
use App\Http\Controllers\Api\V1\Admin\ServiceCategoryController as AdminServiceCategoryController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\SliderController as AdminSliderController;
use App\Http\Controllers\Api\V1\Admin\SolutionController as AdminSolutionController;
use App\Http\Controllers\Api\V1\Admin\TeamMemberController as AdminTeamMemberController;
use Illuminate\Support\Facades\Route;

/*
 * The CMS: every entity with a page, plus menus, sliders, galleries, forms, popups, FAQs and the media library. Everything here is behind `role:content_manager`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:content_manager')->group(function () {

    /*
     * Events (0.118.0, docs/events.md). An event is a page with a date, so
     * it is content; the people who register for one are not, and their
     * routes are in `admin-events.php` under a wider role.
     *
     * Bound by **id**, not slug — the edit form changes the slug it is
     * addressed by. `duplicate` makes a draft copy, which is how a series
     * is made: nothing recurs.
     */
    Route::get('events', [AdminEventController::class, 'index'])->name('events.index');
    Route::post('events', [AdminEventController::class, 'store'])->name('events.store');
    Route::get('events/{event:id}', [AdminEventController::class, 'show'])->name('events.show');
    Route::patch('events/{event:id}', [AdminEventController::class, 'update'])->name('events.update');
    Route::delete('events/{event:id}', [AdminEventController::class, 'destroy'])->name('events.destroy');
    Route::post('events/{event:id}/duplicate', [AdminEventController::class, 'duplicate'])->name('events.duplicate');

    /*
     * Vacancies are content: a careers page is a page. The people
     * who apply are not, and live under role:support_engineer.
     *
     * Bound by **id**, not slug. Sluggable::getRouteKeyName()
     * returns the slug, so {job_opening} looks a vacancy up by slug
     * -- and the edit form is the thing that changes the slug it is
     * addressed by. Every other CMS entity here spells :id out for
     * that reason; this one did not, and every update 404'd.
     */
    Route::get('job-openings', [JobOpeningController::class, 'index'])->name('job-openings.index');
    Route::post('job-openings', [JobOpeningController::class, 'store'])->name('job-openings.store');
    Route::get('job-openings/{job_opening:id}', [JobOpeningController::class, 'show'])->name('job-openings.show');
    Route::patch('job-openings/{job_opening:id}', [JobOpeningController::class, 'update'])->name('job-openings.update');
    Route::delete('job-openings/{job_opening:id}', [JobOpeningController::class, 'destroy'])->name('job-openings.destroy');

    Route::get('job-qualifications', [JobReferenceController::class, 'qualifications'])->name('job-qualifications.index');
    Route::post('job-qualifications', [JobReferenceController::class, 'storeQualification'])->name('job-qualifications.store');
    Route::patch('job-qualifications/{job_qualification}', [JobReferenceController::class, 'updateQualification'])->name('job-qualifications.update');
    Route::delete('job-qualifications/{job_qualification}', [JobReferenceController::class, 'destroyQualification'])->name('job-qualifications.destroy');
    Route::get('job-experience-levels', [JobReferenceController::class, 'experienceLevels'])->name('job-experience-levels.index');
    Route::post('job-experience-levels', [JobReferenceController::class, 'storeExperienceLevel'])->name('job-experience-levels.store');
    Route::patch('job-experience-levels/{job_experience_level}', [JobReferenceController::class, 'updateExperienceLevel'])->name('job-experience-levels.update');
    Route::delete('job-experience-levels/{job_experience_level}', [JobReferenceController::class, 'destroyExperienceLevel'])->name('job-experience-levels.destroy');
    // Bound by id, not slug. Sluggable::getRouteKeyName() returns
    // 'slug', which breaks the moment the edit form changes the
    // slug it is addressed by.
    Route::get('blog-posts', [AdminBlogPostController::class, 'index'])->name('blog-posts.index');
    Route::post('blog-posts', [AdminBlogPostController::class, 'store'])->name('blog-posts.store');
    Route::get('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'show'])->name('blog-posts.show');
    Route::patch('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'update'])->name('blog-posts.update');
    Route::delete('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'destroy'])->name('blog-posts.destroy');

    /*
     * Blog categories. Bound by id like every CMS entity, because
     * the edit form can change the slug it is addressed by.
     */
    Route::get('blog-categories', [AdminBlogCategoryController::class, 'index'])->name('blog-categories.index');
    Route::post('blog-categories', [AdminBlogCategoryController::class, 'store'])->name('blog-categories.store');
    Route::get('blog-categories/{blog_category:id}', [AdminBlogCategoryController::class, 'show'])->name('blog-categories.show');
    Route::patch('blog-categories/{blog_category:id}', [AdminBlogCategoryController::class, 'update'])->name('blog-categories.update');
    Route::delete('blog-categories/{blog_category:id}', [AdminBlogCategoryController::class, 'destroy'])->name('blog-categories.destroy');

    /*
     * The moderation queue.
     *
     * `content_manager`: comments are published on the blog beside
     * the articles the same person wrote, which makes deciding what
     * appears there the same job. One endpoint moderates one comment
     * or fifty, because a bulk path separate from the single path is
     * two rules about what a status change does.
     */
    Route::get('blog-comments', [AdminBlogCommentController::class, 'index'])->name('blog-comments.index');
    Route::post('blog-comments/moderate', [AdminBlogCommentController::class, 'moderate'])->name('blog-comments.moderate');
    Route::delete('blog-comments/{comment}', [AdminBlogCommentController::class, 'destroy'])->name('blog-comments.destroy');

    // This index is the CRUD list and the picker other forms use.
    // One endpoint per resource — the same call made for industries.
    Route::get('products', [AdminProductController::class, 'index'])->name('products.index');
    Route::post('products', [AdminProductController::class, 'store'])->name('products.store');
    Route::get('products/{product:id}', [AdminProductController::class, 'show'])->name('products.show');
    Route::patch('products/{product:id}', [AdminProductController::class, 'update'])->name('products.update');
    Route::delete('products/{product:id}', [AdminProductController::class, 'destroy'])->name('products.destroy');

    Route::get('solutions', [AdminSolutionController::class, 'index'])->name('solutions.index');
    Route::post('solutions', [AdminSolutionController::class, 'store'])->name('solutions.store');
    Route::get('solutions/{solution:id}', [AdminSolutionController::class, 'show'])->name('solutions.show');
    Route::patch('solutions/{solution:id}', [AdminSolutionController::class, 'update'])->name('solutions.update');
    Route::delete('solutions/{solution:id}', [AdminSolutionController::class, 'destroy'])->name('solutions.destroy');
    Route::get('case-studies', [AdminCaseStudyController::class, 'index'])->name('case-studies.index');
    Route::post('case-studies', [AdminCaseStudyController::class, 'store'])->name('case-studies.store');
    Route::get('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'show'])->name('case-studies.show');
    Route::patch('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'update'])->name('case-studies.update');
    Route::delete('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'destroy'])->name('case-studies.destroy');

    Route::get('knowledge-categories', [AdminKnowledgeArticleController::class, 'categories'])
        ->name('knowledge-categories.index');
    Route::get('knowledge-articles', [AdminKnowledgeArticleController::class, 'index'])->name('knowledge-articles.index');
    Route::post('knowledge-articles', [AdminKnowledgeArticleController::class, 'store'])->name('knowledge-articles.store');
    Route::get('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'show'])->name('knowledge-articles.show');
    Route::patch('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'update'])->name('knowledge-articles.update');
    Route::delete('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'destroy'])->name('knowledge-articles.destroy');

    Route::get('services', [AdminServiceController::class, 'index'])->name('services.index');
    Route::post('services', [AdminServiceController::class, 'store'])->name('services.store');
    Route::get('services/{service:id}', [AdminServiceController::class, 'show'])->name('services.show');
    Route::patch('services/{service:id}', [AdminServiceController::class, 'update'])->name('services.update');
    Route::delete('services/{service:id}', [AdminServiceController::class, 'destroy'])->name('services.destroy');

    Route::get('industries', [AdminIndustryController::class, 'index'])->name('industries.index');
    Route::post('industries', [AdminIndustryController::class, 'store'])->name('industries.store');
    Route::get('industries/{industry:id}', [AdminIndustryController::class, 'show'])->name('industries.show');
    Route::patch('industries/{industry:id}', [AdminIndustryController::class, 'update'])->name('industries.update');
    Route::delete('industries/{industry:id}', [AdminIndustryController::class, 'destroy'])->name('industries.destroy');

    Route::get('pages', [AdminPageController::class, 'index'])->name('pages.index');
    Route::post('pages', [AdminPageController::class, 'store'])->name('pages.store');
    // The section builder (2026-09-26): its pickers, and the unsaved-draft
    // preview. Declared above `pages/{page:id}`, or the id binding reads
    // "builder" as a page and 404s.
    Route::get('pages/builder', [AdminPageController::class, 'builder'])->name('pages.builder');
    Route::post('pages/preview', [AdminPageController::class, 'preview'])->middleware('throttle:60,1')->name('pages.preview');
    Route::post('pages/sections-from-body', [AdminPageController::class, 'sectionsFromBody'])->middleware('throttle:30,1')->name('pages.sections-from-body');
    // A draft builder page laid out by the assistant from a brief (0.116.0).
    Route::post('pages/ai-draft', [AdminPageController::class, 'aiDraft'])->middleware('throttle:6,1')->name('pages.ai-draft');
    // The assistant on one section of the builder (0.127.0): answers new
    // wording for the console's form and writes nothing.
    Route::post('pages/ai-section', [AdminPageController::class, 'aiSection'])->middleware('throttle:20,1')->name('pages.ai-section');
    // The section library and page templates (2026-10-05, docs/page-builder.md).
    Route::get('saved-sections', [SavedSectionController::class, 'index'])->name('saved-sections.index');
    Route::post('saved-sections', [SavedSectionController::class, 'store'])->name('saved-sections.store');
    Route::get('saved-sections/{savedSection}', [SavedSectionController::class, 'show'])->name('saved-sections.show');
    Route::patch('saved-sections/{savedSection}', [SavedSectionController::class, 'update'])->name('saved-sections.update');
    Route::delete('saved-sections/{savedSection}', [SavedSectionController::class, 'destroy'])->name('saved-sections.destroy');
    Route::get('pages/{page:id}', [AdminPageController::class, 'show'])->name('pages.show');
    Route::patch('pages/{page:id}', [AdminPageController::class, 'update'])->name('pages.update');
    Route::delete('pages/{page:id}', [AdminPageController::class, 'destroy'])->name('pages.destroy');

    Route::get('brands', [AdminBrandController::class, 'index'])->name('brands.index');
    Route::post('brands', [AdminBrandController::class, 'store'])->name('brands.store');
    Route::get('brands/{brand:id}', [AdminBrandController::class, 'show'])->name('brands.show');
    Route::patch('brands/{brand:id}', [AdminBrandController::class, 'update'])->name('brands.update');
    Route::delete('brands/{brand:id}', [AdminBrandController::class, 'destroy'])->name('brands.destroy');

    /*
     * The company profile — team, clients, certifications. Index
     * pages only, so no slug and bound by id like everything here.
     * The console's path segments match these exactly, which is
     * what lets `AdminNavRolesTest` check them without a rename.
     */
    Route::get('certifications', [AdminCertificationController::class, 'index'])->name('certifications.index');
    Route::post('certifications', [AdminCertificationController::class, 'store'])->name('certifications.store');
    Route::get('certifications/{certification:id}', [AdminCertificationController::class, 'show'])->name('certifications.show');
    Route::patch('certifications/{certification:id}', [AdminCertificationController::class, 'update'])->name('certifications.update');
    Route::delete('certifications/{certification:id}', [AdminCertificationController::class, 'destroy'])->name('certifications.destroy');

    Route::get('clients', [AdminClientController::class, 'index'])->name('clients.index');
    Route::post('clients', [AdminClientController::class, 'store'])->name('clients.store');
    Route::get('clients/{client:id}', [AdminClientController::class, 'show'])->name('clients.show');
    Route::patch('clients/{client:id}', [AdminClientController::class, 'update'])->name('clients.update');
    Route::delete('clients/{client:id}', [AdminClientController::class, 'destroy'])->name('clients.destroy');

    Route::get('team-members', [AdminTeamMemberController::class, 'index'])->name('team-members.index');
    Route::post('team-members', [AdminTeamMemberController::class, 'store'])->name('team-members.store');
    Route::get('team-members/{team_member:id}', [AdminTeamMemberController::class, 'show'])->name('team-members.show');
    Route::patch('team-members/{team_member:id}', [AdminTeamMemberController::class, 'update'])->name('team-members.update');
    Route::delete('team-members/{team_member:id}', [AdminTeamMemberController::class, 'destroy'])->name('team-members.destroy');

    // Content blocks (2026-09-24): CTA banners, stat bars, pricing and
    // technology stacks, one entity filtered by `?type=`. Bound by id, the
    // slug being the shortcode's contract that the form may change.
    Route::get('blocks', [AdminContentBlockController::class, 'index'])->name('blocks.index');
    Route::post('blocks', [AdminContentBlockController::class, 'store'])->name('blocks.store');
    Route::get('blocks/{content_block:id}', [AdminContentBlockController::class, 'show'])->name('blocks.show');
    Route::patch('blocks/{content_block:id}', [AdminContentBlockController::class, 'update'])->name('blocks.update');
    Route::post('blocks/{content_block:id}/duplicate', [AdminContentBlockController::class, 'duplicate'])->name('blocks.duplicate');
    Route::delete('blocks/{content_block:id}', [AdminContentBlockController::class, 'destroy'])->name('blocks.destroy');

    // Bound by id, not slug: the edit form can change the slug it
    // is addressed by, the same reason every other CMS entity does.
    Route::get('sliders', [AdminSliderController::class, 'index'])->name('sliders.index');
    Route::post('sliders', [AdminSliderController::class, 'store'])->name('sliders.store');
    Route::get('sliders/{slider:id}', [AdminSliderController::class, 'show'])->name('sliders.show');
    Route::patch('sliders/{slider:id}', [AdminSliderController::class, 'update'])->name('sliders.update');
    Route::delete('sliders/{slider:id}', [AdminSliderController::class, 'destroy'])->name('sliders.destroy');

    // Popups. Bound by id like every other CMS entity, and
    // `content_manager` rather than `admin`: deciding what a
    // visitor is shown is editorial work, the same call Sliders
    // and Galleries beside it already make.
    Route::get('popups', [AdminPopupController::class, 'index'])->name('popups.index');
    Route::post('popups', [AdminPopupController::class, 'store'])->name('popups.store');
    Route::get('popups/{popup:id}', [AdminPopupController::class, 'show'])->name('popups.show');
    Route::patch('popups/{popup:id}', [AdminPopupController::class, 'update'])->name('popups.update');
    Route::delete('popups/{popup:id}', [AdminPopupController::class, 'destroy'])->name('popups.destroy');

    Route::get('galleries', [AdminGalleryController::class, 'index'])->name('galleries.index');
    Route::post('galleries', [AdminGalleryController::class, 'store'])->name('galleries.store');
    Route::get('galleries/{gallery:id}', [AdminGalleryController::class, 'show'])->name('galleries.show');
    Route::patch('galleries/{gallery:id}', [AdminGalleryController::class, 'update'])->name('galleries.update');
    Route::delete('galleries/{gallery:id}', [AdminGalleryController::class, 'destroy'])->name('galleries.destroy');

    /*
     * Menus. Bound by id like every other CMS entity, and under
     * `content_manager` rather than `admin`: deciding what the
     * navigation says is editorial work, and it is the same role
     * that already owns what every one of those links points at.
     */
    // Above `menus/{menu}`: Laravel matches in declaration order, so
    // underneath it this binds {menu} to the literal "targets" and
    // 404s from model binding — the trap `media/move` documents.

    Route::get('menu-targets', [AdminMenuController::class, 'targets'])->name('menus.targets');

    /*
     * Rebuild a location's menu from the catalogue.
     *
     * **Declared above `menus/{menu:id}`** — Laravel matches in
     * declaration order, and underneath it "rebuild" would bind as
     * an id and 404 from model binding, which reads as a missing
     * record. The trap `media/move` already has a test for.
     *
     * Destructive: it discards whatever an editor arranged for that
     * location. The console asks first.
     */
    Route::post('menus/rebuild/{location}', [AdminMenuController::class, 'rebuild'])->name('menus.rebuild');
    Route::get('menus', [AdminMenuController::class, 'index'])->name('menus.index');
    Route::post('menus', [AdminMenuController::class, 'store'])->name('menus.store');
    Route::get('menus/{menu:id}', [AdminMenuController::class, 'show'])->name('menus.show');
    Route::patch('menus/{menu:id}', [AdminMenuController::class, 'update'])->name('menus.update');
    Route::delete('menus/{menu:id}', [AdminMenuController::class, 'destroy'])->name('menus.destroy');

    Route::get('forms', [AdminFormController::class, 'index'])->name('forms.index');
    Route::post('forms', [AdminFormController::class, 'store'])->name('forms.store');
    Route::get('forms/{form:id}', [AdminFormController::class, 'show'])->name('forms.show');
    Route::patch('forms/{form:id}', [AdminFormController::class, 'update'])->name('forms.update');
    Route::delete('forms/{form:id}', [AdminFormController::class, 'destroy'])->name('forms.destroy');
    Route::get('forms/{form:id}/submissions', [AdminFormController::class, 'submissions'])->name('forms.submissions');
    // Above `submissions/{submission}`, or `{submission}` binds the literal
    // "export" and answers 404 from model binding — the `media/move` trap.
    Route::get('forms/{form:id}/submissions/export', [AdminFormController::class, 'export'])->name('forms.submissions.export');
    // An upload has no URL; this is the only way to read one. `{field}` is
    // held to the shape of a field key so it can never be read as a path.
    Route::get('forms/{form:id}/submissions/{submission}/files/{field}', [AdminFormController::class, 'file'])
        ->whereNumber('submission')
        ->where('field', '[a-z][a-z0-9_]*')
        ->name('forms.submissions.file');
    Route::delete('forms/{form:id}/submissions/{submission}', [AdminFormController::class, 'destroySubmission'])
        ->whereNumber('submission')
        ->name('forms.submissions.destroy');

    /*
     * Custom field groups (docs/custom-content.md). The console calls the
     * screen "Custom fields" (`/admin/custom-fields`); the API names what it
     * writes, which is a group of them — `AdminNavRolesTest::RENAMED` maps
     * one to the other.
     */
    Route::get('custom-field-groups', [CustomFieldGroupController::class, 'index'])->name('custom-field-groups.index');
    Route::post('custom-field-groups', [CustomFieldGroupController::class, 'store'])->name('custom-field-groups.store');
    Route::get('custom-field-groups/{custom_field_group:id}', [CustomFieldGroupController::class, 'show'])->name('custom-field-groups.show');
    Route::patch('custom-field-groups/{custom_field_group:id}', [CustomFieldGroupController::class, 'update'])->name('custom-field-groups.update');
    Route::delete('custom-field-groups/{custom_field_group:id}', [CustomFieldGroupController::class, 'destroy'])->name('custom-field-groups.destroy');

    /*
     * Custom content types and their entries (docs/custom-content.md). A type
     * is bound by id — its edit form changes its slug. Its entries are nested
     * under its **slug**, the console's own URL (`/admin/content/{type}`),
     * which nothing on an entry's form can change; an entry is bound by id
     * and scoped to its type, so another type's entry id answers 404.
     */
    Route::get('content-types', [ContentTypeController::class, 'index'])->name('content-types.index');
    Route::post('content-types', [ContentTypeController::class, 'store'])->name('content-types.store');
    Route::get('content-types/{content_type:id}', [ContentTypeController::class, 'show'])->name('content-types.show');
    Route::patch('content-types/{content_type:id}', [ContentTypeController::class, 'update'])->name('content-types.update');
    Route::delete('content-types/{content_type:id}', [ContentTypeController::class, 'destroy'])->name('content-types.destroy');

    Route::scopeBindings()->group(function () {
        Route::get('content-types/{content_type:slug}/entries', [EntryController::class, 'index'])->name('entries.index');
        Route::post('content-types/{content_type:slug}/entries', [EntryController::class, 'store'])->name('entries.store');
        Route::get('content-types/{content_type:slug}/entries/{entry:id}', [EntryController::class, 'show'])->name('entries.show');
        Route::patch('content-types/{content_type:slug}/entries/{entry:id}', [EntryController::class, 'update'])->name('entries.update');
        Route::delete('content-types/{content_type:slug}/entries/{entry:id}', [EntryController::class, 'destroy'])->name('entries.destroy');
    });

    // Index doubles as the parent picker and the product form's
    // category select — one endpoint per resource, as with industries.
    Route::get('product-categories', [AdminProductCategoryController::class, 'index'])->name('product-categories.index');
    Route::post('product-categories', [AdminProductCategoryController::class, 'store'])->name('product-categories.store');
    Route::get('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'show'])->name('product-categories.show');
    Route::patch('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'update'])->name('product-categories.update');
    Route::delete('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'destroy'])->name('product-categories.destroy');

    // The tabs the Services section draws (docs/catalogue.md). The index
    // doubles as the service form's category select.
    Route::get('service-categories', [AdminServiceCategoryController::class, 'index'])->name('service-categories.index');
    Route::post('service-categories', [AdminServiceCategoryController::class, 'store'])->name('service-categories.store');
    Route::get('service-categories/{service_category:id}', [AdminServiceCategoryController::class, 'show'])->name('service-categories.show');
    Route::patch('service-categories/{service_category:id}', [AdminServiceCategoryController::class, 'update'])->name('service-categories.update');
    Route::delete('service-categories/{service_category:id}', [AdminServiceCategoryController::class, 'destroy'])->name('service-categories.destroy');

    // Owners first: the picker needs it before the form can save.
    Route::get('faq-owners', [AdminFaqController::class, 'owners'])->name('faq-owners.index');
    Route::get('faqs', [AdminFaqController::class, 'index'])->name('faqs.index');
    Route::post('faqs', [AdminFaqController::class, 'store'])->name('faqs.store');
    Route::get('faqs/{faq:id}', [AdminFaqController::class, 'show'])->name('faqs.show');
    Route::patch('faqs/{faq:id}', [AdminFaqController::class, 'update'])->name('faqs.update');
    Route::delete('faqs/{faq:id}', [AdminFaqController::class, 'destroy'])->name('faqs.destroy');

    Route::get('media-folders', [MediaFolderController::class, 'index'])->name('media-folders.index');
    Route::post('media-folders', [MediaFolderController::class, 'store'])->name('media-folders.store');
    Route::delete('media-folders/{mediaFolder:id}', [MediaFolderController::class, 'destroy'])->name('media-folders.destroy');

    Route::get('media', [MediaController::class, 'index'])->name('media.index');
    Route::post('media', [MediaController::class, 'store'])->name('media.store');
    // Before the {medium} routes, or "download" is read as an id.
    /*
     * The bulk routes sit *above* `media/{medium:id}` on purpose.
     *
     * Laravel matches in declaration order, so `media/move` under
     * the parameterised route would bind `{medium:id}` to the
     * literal string "move" and answer 404 from model binding —
     * a routing bug that reads as a missing record.
     */
    Route::post('media/move', [MediaController::class, 'move'])->name('media.move');
    Route::post('media/copy', [MediaController::class, 'copy'])->name('media.copy');
    Route::post('media/delete', [MediaController::class, 'bulkDestroy'])->name('media.bulk-destroy');

    Route::get('media/{medium:id}/download', [MediaController::class, 'download'])->name('media.download');
    Route::post('media/{medium:id}/resize', [MediaController::class, 'resize'])->name('media.resize');
    Route::post('media/{medium:id}/crop', [MediaController::class, 'crop'])->name('media.crop');
    Route::post('media/{medium:id}/transform', [MediaController::class, 'transform'])->name('media.transform');
    Route::post('media/{medium:id}/replace', [MediaController::class, 'replace'])->name('media.replace');
    // Alt text proposed by the AI SEO assistant; suggest-only, its cap and a per-editor throttle.
    Route::post('media/{medium:id}/alt-suggest', [MediaController::class, 'suggestAlt'])
        ->middleware('throttle:10,1')->name('media.alt-suggest');
    Route::get('media/{medium:id}/versions', [MediaController::class, 'versions'])->name('media.versions');
    Route::post('media/{medium:id}/versions/{version}/restore', [MediaController::class, 'restoreVersion'])->name('media.versions.restore');

    /*
     * The bin. `restore` and `purge` take a plain {id} rather than
     * a bound model, because route-model binding cannot find a
     * soft-deleted row — it applies the default scope and answers
     * 404 for every file in the bin, which is every file these two
     * routes exist for.
     */
    Route::post('media/trash/empty', [MediaController::class, 'emptyTrash'])->name('media.trash.empty');
    Route::post('media/{id}/restore', [MediaController::class, 'restore'])->name('media.restore');
    Route::delete('media/{id}/purge', [MediaController::class, 'purge'])->name('media.purge');

    Route::patch('media/{medium:id}', [MediaController::class, 'update'])->name('media.update');
    Route::delete('media/{medium:id}', [MediaController::class, 'destroy'])->name('media.destroy');
});
