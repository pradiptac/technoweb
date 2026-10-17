<?php

namespace App\Support\Health;

use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Models\User;
use App\Support\Revisions;
use BackedEnum;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * The records the health centre checks, and the one list of them
 * (docs/health.md). Built from `Revisions` — the same kinds and owning roles
 * share links and page history already use — less the section library, which
 * is not a page, plus certifications, which are checked for expiry only.
 */
final class Kinds
{
    /** alias => [owning role, label, console segment] for the kinds `Revisions` does not hold. */
    private const EXTRA = [
        'certification' => ['content_manager', 'Certifications', 'certifications'],
    ];

    private const NOT_CHECKED = ['saved_section'];

    /** @return list<string> */
    public static function aliases(): array
    {
        return [...array_values(array_diff(Revisions::aliases(), self::NOT_CHECKED)), ...array_keys(self::EXTRA)];
    }

    /** @return class-string<Model>|null */
    public static function classFor(string $alias): ?string
    {
        return in_array($alias, self::aliases(), true) ? Relation::getMorphedModel($alias) : null;
    }

    public static function roleFor(string $alias): ?string
    {
        return self::EXTRA[$alias][0] ?? Revisions::roleFor($alias);
    }

    /** `EnsureUserHasRole`'s rule: the owning role, or an administrator. */
    public static function allows(User $user, string $alias): bool
    {
        $role = self::roleFor($alias);

        return $role !== null && ($user->isAdmin() || $user->hasRole($role));
    }

    /** @return list<string> */
    public static function aliasesFor(User $user): array
    {
        return array_values(array_filter(self::aliases(), fn (string $a) => self::allows($user, $a)));
    }

    public static function label(string $alias): string
    {
        return self::EXTRA[$alias][1] ?? SeoController::entity($alias)['label'] ?? $alias;
    }

    public static function title(Model $model): string
    {
        return (string) ($model->getAttribute('title') ?? $model->getAttribute('name') ?? $model->getAttribute('reference') ?? '#'.$model->getKey());
    }

    public static function adminPath(Model $model): string
    {
        if (method_exists($model, 'adminPath')) {
            return $model->adminPath();
        }

        $alias = $model->getMorphClass();
        $segment = self::EXTRA[$alias][2] ?? SeoController::entity($alias)['admin_path'] ?? $alias;

        return "/admin/{$segment}/{$model->getKey()}";
    }

    /** IndexNow's rule: no status column, or a status of published. */
    public static function isPublished(Model $model): bool
    {
        $status = $model->getAttribute('status');

        if ($status === null) {
            return true;
        }

        return ($status instanceof BackedEnum ? $status->value : (string) $status) === 'published';
    }

    /** @return list<string> */
    public static function bodyColumns(string $alias): array
    {
        return Revisions::bodyColumns($alias);
    }
}
