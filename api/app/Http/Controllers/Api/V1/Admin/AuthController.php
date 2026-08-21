<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Staff login. Entirely separate from AuthController::login, which is
 * hardcoded to the Customer model — a staff user is never a customer and
 * vice versa. Returns a Sanctum token the Next.js admin app stores in its
 * own httpOnly cookie, same as the portal does for customers.
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited();

        $user = User::where('email', $request->string('email'))->first();

        // Verify the hash even when the user is missing, so response timing
        // does not reveal whether an email address exists.
        $valid = $user
            ? Hash::check($request->string('password'), $user->password)
            : Hash::check($request->string('password'), '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');

        if (! $valid || ! $user) {
            RateLimiter::hit($request->throttleKey());

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ])->status(401);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => 'This staff account has been deactivated.',
            ])->status(403);
        }

        RateLimiter::clear($request->throttleKey());

        $user->tokens()->where('name', 'admin')->delete();
        $token = $user->createToken('admin', ['admin'], now()->addDays(14));

        return response()->json([
            'token' => $token->plainTextToken,
            'staff' => new UserResource($user->load('roles')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        abort_unless($request->user() instanceof User, 403, 'Staff access only.');

        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        abort_unless($request->user() instanceof User, 403, 'Staff access only.');

        return response()->json(['data' => new UserResource($request->user()->load('roles'))]);
    }
}
