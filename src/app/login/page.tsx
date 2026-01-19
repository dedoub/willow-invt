'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isLoading: authLoading } = useAuth()
  const { t } = useI18n()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/')
    }
  }, [authLoading, isAuthenticated, router])

  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-brand-300" />
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const result = await login(email, password)

    if (result.success) {
      router.push('/')
    } else {
      setError(result.error || t.auth.login.error)
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="mb-8">
            <Image src="/willow-text.png" alt="Willow Investments" width={400} height={72} />
          </div>
          <p className="text-lg text-brand-100/80">
            {t.brand.tagline}
          </p>

          {/* Decoration */}
          <div className="mt-12 grid grid-cols-3 gap-4 opacity-60">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-full bg-gradient-to-r from-brand-400/40 to-brand-300/40"
                style={{ width: `${60 + Math.random() * 40}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Image src="/willow-text.png" alt="Willow Investments" width={280} height={50} />
          </div>

          {/* Login Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">{t.auth.login.title}</h2>
              <p className="text-brand-100/70 mt-2">{t.auth.login.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-brand-100">
                  {t.auth.login.email}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-brand-300/50" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t.auth.login.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-brand-100/40 focus:border-brand-400 focus:ring-brand-400/20"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-brand-100">
                  {t.auth.login.password}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-brand-300/50" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t.auth.login.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-brand-100/40 focus:border-brand-400 focus:ring-brand-400/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-300/50 hover:text-brand-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                  {error}
                </div>
              )}

              {/* Login Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 transition-all duration-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.auth.login.submitting}
                  </>
                ) : (
                  t.auth.login.submit
                )}
              </Button>
            </form>

            {/* Contact Info */}
            <div className="mt-6 text-center">
              <p className="text-brand-100/70">
                {t.auth.login.contactInfo}:{' '}
                <a
                  href="mailto:contact@willowinvt.com"
                  className="text-brand-300 hover:text-brand-200 font-medium transition-colors"
                >
                  contact@willowinvt.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
