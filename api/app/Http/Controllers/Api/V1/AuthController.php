<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\ResetsPasswords;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Customer login. Returns a Sanctum token which the Next.js server stores
     * in an httpOnly cookie — it is never handed to browser JavaScript.
     */
    use ResetsPasswords;

    public function forgotPassword(Request $request): JsonResponse
    {
        return $this->sendResetLinkFor($request, 'customers', 'portal');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        return $this->resetPasswordFor($request, 'customers');
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $request->ensureIsNotRateLimited();

        $customer = Customer::where('email', $request->string('email'))->first();

        // Verify the hash even when the customer is missing, so response timing
        // does not reveal whether an email address exists.
        $valid = $customer
            ? Hash::check($request->string('password'), $customer->password)
            : Hash::check($request->string('password'), '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');

        if (! $valid || ! $customer) {
            RateLimiter::hit($request->throttleKey());

            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ])->status(401);
        }

        if (! $customer->is_active) {
            throw ValidationException::withMessages([
                'email' => 'This portal account has been deactivated. Contact your account engineer.',
            ])->status(403);
        }

        RateLimiter::clear($request->throttleKey());

        // One active token per login; old tokens for this device name are replaced.
        $customer->tokens()->where('name', 'portal')->delete();
        $token = $customer->createToken('portal', ['portal'], now()->addDays(14));

        $customer->forceFill(['last_login_at' => now()])->saveQuietly();

        return response()->json([
            'token' => $token->plainTextToken,
            'customer' => new CustomerResource($customer),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => new CustomerResource($request->user())]);
    }

    public function updateProfile(UpdateProfileRequest $request): JsonResponse
    {
        $customer = $request->user();
        $data = $request->safe()->except(['current_password', 'password_confirmation']);

        if ($request->filled('password')) {
            $data['password'] = $request->string('password')->value();
            // Changing a password invalidates every other session.
            $customer->tokens()->where('id', '!=', $customer->currentAccessToken()->id)->delete();
        }

        $customer->update($data);

        return response()->json(['data' => new CustomerResource($customer->fresh())]);
    }
}
