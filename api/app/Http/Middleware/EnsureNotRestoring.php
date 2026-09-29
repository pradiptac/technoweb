<?php

namespace App\Http\Middleware;

use App\Support\Backups\RestoreMode;
use App\Support\System\UpdateMode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 503 on every API route while a restore is replacing the database, or an
 * update is replacing the application.
 *
 * During a restore three paths stay open: the backup screens, so the person
 * who started the restore can watch it; the system screens, because an
 * update's rollback drives a restore of its own; and signing in, because a restored
 * `personal_access_tokens` table has usually signed them out. During an
 * update the updater's own steps and the system status stay open instead,
 * for the same reason. Everything else — a checkout, a ticket, a form — would
 * write into tables that are half-rebuilt, or read a site that is half there.
 * The public pages keep rendering from the frontend's cache meanwhile, which
 * is the right thing for a visitor to see.
 */
class EnsureNotRestoring
{
    /*
     * `admin/system/*` as well: a rollback restores the database through the
     * restore engine, and the updater's own steps are what drive it — closed
     * to them, a rollback stops at its own restore and never finishes.
     */
    private const OPEN_RESTORING = ['api/v1/admin/backups', 'api/v1/admin/backups/*', 'api/v1/admin/system/*', 'api/v1/system/updates/continue', 'api/v1/admin/auth/*'];

    private const OPEN_UPDATING = ['api/v1/admin/system/*', 'api/v1/system/updates/continue', 'api/v1/admin/auth/*'];

    public function handle(Request $request, Closure $next): Response
    {
        if (RestoreMode::active() && ! $request->is(...self::OPEN_RESTORING)) {
            return response()->json([
                'message' => 'The site is being restored from a backup. Try again in a few minutes.',
                'restoring' => true,
            ], 503, ['Retry-After' => '60']);
        }

        if (UpdateMode::active() && ! $request->is(...self::OPEN_UPDATING)) {
            return response()->json([
                'message' => 'The site is being updated. Try again in a few minutes.',
                'updating' => true,
            ], 503, ['Retry-After' => '60']);
        }

        return $next($request);
    }
}
