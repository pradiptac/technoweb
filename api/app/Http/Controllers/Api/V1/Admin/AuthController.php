<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\ResetsPasswords;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/**
 * Staff login. Entirely separate from AuthController::login, which is
 * hardcoded to the Customer model — a staff user is never a customer and
 * vice versa. Returns a Sanctum token the Next.js admin app stores in its
 * own httpOnly cookie, same as the portal does for customers.
 */
class AuthController extends Controller
{
    use ResetsPasswords;

    /** Staff use their own broker and their own reset form. */
    public function forgotPassword(Request $request): JsonResponse
    {
        return $this->sendResetLinkFor($request, 'users', 'admin');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        return $this->resetPasswordFor($request, 'users');
    }

    /**
     * A staff member changing their own password.
     *
     * Available to every signed-in role, not just administrators. Without it a
     * support engineer had no way to change their own password at all —
     * /admin/staff is role:admin, so they would have had to ask an
     * administrator to do it, who would then know their password.
     *
     * The current password is required. A borrowed unlocked laptop should not
     * be enough to lock the owner out of their own account.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', 'different:current_password', PasswordRule::min(12)],
        ], [
            'password.confirmed' => 'The two passwords do not match.',
            'password.different' => 'That is the password you already have.',
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'That is not your current password.',
            ]);
        }

        $currentToken = $user->currentAccessToken();

        $user->forceFill(['password' => $data['password']])->save();

        // Every other session goes, but not this one — signing someone out of
        // the page they are standing on to tell them it worked is hostile, and
        // they have just proved they know the old password.
        $user->tokens()->where('id', '!=', $currentToken?->id)->delete();

        return response()->json(['message' => 'Password changed. Any other devices have been signed out.']);
    }

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

            // The response says nothing on purpose, so this line is the only
            // record that the attempt happened at all.
            ActivityLogger::signInFailed((string) $request->string('email'), $request);

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ])->status(401);
        }

        if (! $user->is_active) {
            ActivityLogger::signInFailed((string) $request->string('email'), $request, 'account_inactive');

            throw ValidationException::withMessages([
                'email' => 'This staff account has been deactivated.',
            ])->status(403);
        }

        RateLimiter::clear($request->throttleKey());

        $user->tokens()->where('name', 'admin')->delete();
        $token = $user->createToken('admin', ['admin'], now()->addDays(14));

        ActivityLogger::signIn($user, $request);

        return response()->json([
            'token' => $token->plainTextToken,
            'staff' => new UserResource($user->load('roles')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new UserResource($request->user()->load('roles'))]);
    }
}
