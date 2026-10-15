"use client";

import type { ReactNode } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { loginAction, sendCodeAction, verifyCodeAction } from "./actions";

/**
 * Customer sign-in: the shared form with the portal's three actions, its
 * own reset link, and the register link when `/portal/register` is open.
 */
export function LoginForm({
  canRegister = false, ...props
}: { otpEnabled?: boolean; passwordEnabled?: boolean; defaultMethod?: "otp" | "password"; canRegister?: boolean; returnTo?: string; before?: ReactNode }) {
  return (
    <SignInForm
      {...props}
      forgotHref="/portal/forgot-password"
      registerHref={canRegister ? "/portal/register" : undefined}
      actions={{ login: loginAction, sendCode: sendCodeAction, verifyCode: verifyCodeAction }}
    />
  );
}
