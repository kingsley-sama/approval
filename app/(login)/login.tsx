'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';
import { signIn, signUp } from '@/app/actions/auth';
import { ActionState } from '@/lib/auth/middleware';
import { useState } from 'react';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo + heading */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-5 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Company logo"
              width={48}
              height={48}
              className="object-contain h-full w-full"
            />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2 tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-muted-foreground font-body text-sm">
            {mode === 'signin' ? 'Sign in to your account' : 'Get started today'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-background rounded-2xl border border-border p-8">
          <form
            action={formAction}
            className="space-y-5"
            onSubmit={(e) => {
              if (mode === 'signup') {
                const form = e.currentTarget;
                const pw = (form.elements.namedItem('password') as HTMLInputElement).value;
                const cpw = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
                if (pw !== cpw) {
                  e.preventDefault();
                  setConfirmPasswordError('Passwords do not match');
                } else {
                  setConfirmPasswordError('');
                }
              }
            }}
          >
            <input type="hidden" name="redirect" value={redirect || ''} />

            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="font-display font-semibold text-sm">
                  Full Name
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Enter your full name"
                  className="h-11 rounded-lg font-body"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="font-display font-semibold text-sm">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                placeholder="Enter your email"
                className="h-11 rounded-lg font-body"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-display font-semibold text-sm">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  defaultValue={state.password}
                  required
                  minLength={8}
                  maxLength={100}
                  placeholder="Enter your password"
                  className="h-11 rounded-lg font-body pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-display font-semibold text-sm">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={100}
                    placeholder="Confirm your password"
                    className="h-11 rounded-lg font-body pr-10"
                    onChange={() => setConfirmPasswordError('')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPasswordError && (
                  <p className="text-destructive text-sm font-body">{confirmPasswordError}</p>
                )}
              </div>
            )}

            {state?.error && (
              <p className="text-destructive text-sm font-body">{state.error}</p>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 rounded-full font-display font-semibold"
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Loading...
                </>
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Sign up'
              )}
            </Button>
          </form>

          {/* Toggle signin/signup */}
          <div className="mt-6 text-center">
            {mode === 'signin' ? (
              <Link
                href={`/sign-up${redirect ? `?redirect=${redirect}` : ''}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors font-body"
              >
                Don't have an account? <span className="font-semibold text-foreground">Sign up</span>
              </Link>
            ) : (
              <Link
                href={`/sign-in${redirect ? `?redirect=${redirect}` : ''}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors font-body inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to sign in
              </Link>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium font-body">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            — ExposéProfi
          </div>
        </div>
      </motion.div>
    </div>
  );
} 