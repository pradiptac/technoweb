<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role as RoleEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\Admin\StaffUserResource;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Staff accounts and their roles. Behind auth:sanctum + role:admin.
 *
 * Three guards here exist because this is the one screen that can lock
 * everybody out of the admin:
 *
 *  - You cannot deactivate or delete your own account.
 *  - You cannot remove your own administrator role.
 *  - The last active administrator cannot be deactivated, deleted, or demoted.
 *
 * The first two stop the obvious self-inflicted mistake. The third is the one
 * that matters: without it, two administrators can each demote the other and
 * the install is left with no way in short of a database edit.
 */
class UserAdminController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->with('roles')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%"));
            })
            ->when($request->filled('role'), function ($q) use ($request) {
                $slug = $request->string('role')->value();
                $q->whereHas('roles', fn ($r) => $r->where('slug', $slug));
            })
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return StaffUserResource::collection($users);
    }

    /** The role list for the form, straight from the enum. */
    public function roles(): JsonResponse
    {
        return response()->json([
            'data' => array_map(fn (RoleEnum $r) => [
                'slug' => $r->value,
                'label' => $r->label(),
                'description' => $r->description(),
            ], RoleEnum::cases()),
        ]);
    }

    public function show(User $user): JsonResource
    {
        return new StaffUserResource($user->load('roles'));
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();

        // Generated when the administrator did not set one, so a new account
        // never starts with a password somebody else chose and remembers.
        $generated = empty($data['password']) ? Str::password(16) : null;

        $user = DB::transaction(function () use ($data, $generated) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'password' => $data['password'] ?? $generated,
                'is_active' => $data['is_active'] ?? true,
            ]);

            $user->roles()->sync($this->roleIds($data['roles'] ?? []));

            return $user;
        });

        // The generated password travels back exactly once, on this response.
        // It is hashed in the database and cannot be read again, which is why
        // the UI has to show it immediately.
        return response()->json([
            'data' => (new StaffUserResource($user->load('roles')))->toArray($request)
                + ['generated_password' => $generated],
        ], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResource
    {
        $data = $request->validated();

        DB::transaction(function () use ($data, $user) {
            $user->fill(array_intersect_key($data, array_flip(['name', 'email', 'phone', 'is_active'])));

            if (! empty($data['password'])) {
                $user->password = $data['password'];
                // A password change invalidates every session that account
                // has open, the same rule the customer portal follows.
                $user->tokens()->delete();
            }

            $user->save();

            if (array_key_exists('roles', $data)) {
                $user->roles()->sync($this->roleIds($data['roles']));
            }
        });

        return new StaffUserResource($user->fresh('roles'));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if($user->id === $request->user()->id, 422, 'You cannot delete your own account.');
        abort_if($this->isLastAdministrator($user), 422, 'This is the last administrator — promote someone else first.');

        DB::transaction(function () use ($user) {
            // Tickets keep their history; assigned_to is nullOnDelete, so they
            // fall back to unassigned rather than disappearing with the staff
            // member who owned them.
            $user->roles()->detach();
            $user->tokens()->delete();
            $user->delete();
        });

        return response()->json(['message' => 'Staff account deleted.']);
    }

    /** @param array<int, string> $slugs */
    private function roleIds(array $slugs): array
    {
        return Role::whereIn('slug', $slugs)->pluck('id')->all();
    }

    private function isLastAdministrator(User $user): bool
    {
        if (! $user->hasRole(RoleEnum::Admin)) {
            return false;
        }

        return User::where('is_active', true)
            ->where('id', '!=', $user->id)
            ->whereHas('roles', fn ($r) => $r->where('slug', RoleEnum::Admin->value))
            ->doesntExist();
    }
}
