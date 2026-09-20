"use client";

import { SignInForm } from "@/components/auth/sign-in-form";
import { loginAction, sendCodeAction, verifyCodeAction } from "./actions";

/**
 * Staff sign-in: the shared form with the console's three actions and its
 * own reset link. No registration — staff accounts are made in the console.
 */
export function LoginForm(props: { otpEnabled?: boolean; passwordEnabled?: boolean; defaultMethod?: "otp" | "password" }) {
  return (
    <SignInForm
      {...props}
      forgotHref="/admin/forgot-password"
      actions={{ login: loginAction, sendCode: sendCodeAction, verifyCode: verifyCodeAction }}
    />
  );
}
