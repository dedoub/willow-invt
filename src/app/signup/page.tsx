'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LayoutDashboard, Mail, Lock, Eye, EyeOff, Loader2, User, KeyRound } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const { signup, isAuthenticated, isLoading: authLoading } = useAuth()
  const { t } = useI18n()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [signupCode, setSignupCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/')
    }
  }, [authLoading, isAuthenticated, router])

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t.auth.signup.passwordMismatch)
      return
    }

    if (password.length < 8) {
      setError(t.auth.signup.passwordTooShort)
      return
    }

    if (!signupCode.trim()) {
      setError(t.auth.signup.signupCodeRequired)
      return
    }

    setIsLoading(true)

    const result = await signup(email, password, name, signupCode)

    if (result.success) {
      router.push('/login')
    } else {
      setError(result.error || t.auth.signup.error)
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-sky-500/20 backdrop-blur-sm mb-8">
            <LayoutDashboard className="h-10 w-10 text-sky-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            {t.brand.name}
          </h1>
          <p className="text-lg text-sky-100/80">
            {t.brand.tagline}
          </p>

          {/* Decoration */}
          <div className="mt-12 grid grid-cols-3 gap-4 opacity-60">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-full bg-gradient-to-r from-sky-400/40 to-cyan-400/40"
                style={{ width: `${60 + Math.random() * 40}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-sky-500/20 backdrop-blur-sm mb-4">
              <LayoutDashboard className="h-8 w-8 text-sky-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">{t.brand.name}</h1>
          </div>

          {/* Signup Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">{t.auth.signup.title}</h2>
              <p className="text-sky-100/70 mt-2">{t.auth.signup.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sky-100">
                  {t.auth.signup.name}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300/50" />
                  <Input
                    id="name"
                    type="text"
                    placeholder={t.auth.signup.namePlaceholder}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-400 focus:ring-sky-400/20"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sky-100">
                  {t.auth.signup.email}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300/50" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t.auth.signup.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-400 focus:ring-sky-400/20"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sky-100">
                  {t.auth.signup.password}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300/50" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t.auth.signup.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-400 focus:ring-sky-400/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-300/50 hover:text-sky-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sky-100">
                  {t.auth.signup.confirmPassword}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300/50" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder={t.auth.signup.confirmPasswordPlaceholder}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-400 focus:ring-sky-400/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-300/50 hover:text-sky-300"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Signup Code */}
              <div className="space-y-2">
                <Label htmlFor="signupCode" className="text-sky-100">
                  {t.auth.signup.signupCode} <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sky-300/50" />
                  <Input
                    id="signupCode"
                    type="text"
                    placeholder={t.auth.signup.signupCodePlaceholder}
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-sky-100/40 focus:border-sky-400 focus:ring-sky-400/20"
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                  {error}
                </div>
              )}

              {/* Signup Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-2.5 transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.auth.signup.submitting}
                  </>
                ) : (
                  t.auth.signup.submit
                )}
              </Button>
            </form>

            {/* Login Link */}
            <div className="mt-6 text-center">
              <p className="text-sky-100/70">
                {t.auth.signup.hasAccount}{' '}
                <Link
                  href="/login"
                  className="text-sky-400 hover:text-sky-300 font-medium transition-colors"
                >
                  {t.auth.signup.login}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
