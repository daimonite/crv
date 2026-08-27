import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { executeDb } from '../lib/database'
import { signIn, linkBranch } from '../lib/sync'
import { useAuth } from '../lib/hooks'
import { invoke } from '@tauri-apps/api/core'

type OnboardingStep = 'welcome' | 'details' | 'link' | 'create-pin' | 'done'

interface CentreDetails {
  name: string
  address: string
  phone: string
  email: string
}

interface OnboardingProps {
  onComplete?: () => void
}

async function saveCentreDetails(details: CentreDetails) {
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_name', JSON.stringify(details.name.trim())]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_address', JSON.stringify(details.address.trim())]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_phone', JSON.stringify(details.phone.trim())]
  )
  await executeDb(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['centre_email', JSON.stringify(details.email.trim())]
  )
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const navigate = useNavigate()
  const { setOperator } = useAuth()

  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [details, setDetails] = useState<CentreDetails>({ name: '', address: '', phone: '', email: '' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const inputClass = 'w-full h-12 px-4 bg-surface-base border border-ink-deep/20 rounded-none text-body-md text-ink-deep focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-text-muted'
  const btnClass = 'w-full h-12 bg-primary text-white rounded-none font-label-md font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'

  async function handleDetailsSubmit() {
    if (!details.name.trim() || !details.address.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      await saveCentreDetails(details)
      setStep('link')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save details')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      await linkBranch()
      setStep('create-pin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const { createOperator } = await import('../lib/queries')
      const { queryDb: dbQuery } = await import('../lib/database')
      const { generateId } = await import('../lib/database')

      const branchResult = await dbQuery("SELECT value FROM app_settings WHERE key = 'branch_id'")
      let branchId: string
      if (branchResult.length > 0) {
        branchId = JSON.parse(branchResult[0].value) as string
      } else {
        branchId = generateId()
        const { executeDb } = await import('../lib/database')
        await executeDb(
          `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          ['branch_id', JSON.stringify(branchId)]
        )
      }

      const op = await createOperator({
        branch_id: branchId,
        name: 'Admin',
        pin: pin,
        role: 'admin',
      })

      setOperator(op)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PIN')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleOpenSignup() {
    const signupUrl = 'https://cervos.online/auth'
    try {
      // Tauri 2 opener plugin — fallback to window.open if not available
      await invoke('plugin:opener|open_url', { url: signupUrl })
    } catch {
      window.open(signupUrl, '_blank')
    }
  }

  function handleDone() {
    if (onComplete) {
      onComplete()
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: "url('/pharmacist-1.png')", filter: "blur(10px)", transform: "scale(1.1)" }} />
      <div className="fixed inset-0 z-0 bg-surface/80" />

      <div className="fixed bottom-[-8%] left-[-8%] w-[500px] h-[500px] opacity-[0.06] pointer-events-none z-0">
        <img src="/logo.png" alt="" className="w-full h-full object-contain" style={{ mixBlendMode: "multiply" }} />
      </div>

      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[5%] w-16 h-8 bg-primary/10 rounded-full animate-float-slow" />
        <div className="absolute top-[20%] right-[10%] w-12 h-6 bg-secondary/10 rounded-full animate-float-medium" />
        <div className="absolute top-[60%] left-[8%] w-20 h-10 bg-primary/8 rounded-full animate-float-fast" />
        <div className="absolute top-[70%] right-[15%] w-14 h-7 bg-accent/10 rounded-full animate-float-slow" />
        <div className="absolute top-[40%] left-[15%] w-10 h-5 bg-secondary/8 rounded-full animate-float-medium" />
        <div className="absolute bottom-[20%] right-[25%] w-18 h-9 bg-primary/8 rounded-full animate-float-fast" />
      </div>

      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.6; }
          50% { transform: translateY(-20px) rotate(5deg); opacity: 1; }
        }
        @keyframes float-medium {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; }
          50% { transform: translateY(-15px) rotate(-5deg); opacity: 0.9; }
        }
        @keyframes float-fast {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
          50% { transform: translateY(-10px) rotate(3deg); opacity: 0.8; }
        }
        .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
        .animate-float-medium { animation: float-medium 4s ease-in-out infinite; }
        .animate-float-fast { animation: float-fast 3s ease-in-out infinite; }
      `}</style>

      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 relative">
            <img src="/logo.png" alt="Cervos" className="w-full h-full object-contain" />
          </div>
          <span className="font-headline text-headline-md font-bold text-primary tracking-tight">Cervos POS</span>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center lg:justify-end lg:pr-24 p-4 relative z-10 pt-24 pb-16">
        <div className="relative w-full max-w-[460px]">
          <div className="hud-panel absolute inset-0" />
          <div className="hud-border" />
          <div className="hud-notch-line" />

          <div className="relative z-10 p-8 md:p-10">
            {step === 'welcome' && (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 relative">
                  <img src="/logo.png" alt="Cervos" className="w-full h-full object-contain" />
                </div>
                <h1 className="font-headline-lg text-headline-lg text-ink-deep mb-2">Welcome to Cervos POS</h1>
                <p className="font-body-md text-body-md text-on-surface-variant mb-8">
                  Set up your pharmacy in a few steps.
                </p>
                <button onClick={() => setStep('details')} className={btnClass}>
                  Get Started
                </button>
              </div>
            )}

            {step === 'details' && (
              <form onSubmit={(e) => { e.preventDefault(); handleDetailsSubmit(); }} className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep('welcome')} className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <h2 className="font-headline-md text-headline-md text-ink-deep">Centre Details</h2>
                </div>

                <input
                  type="text"
                  value={details.name}
                  onChange={(e) => setDetails({ ...details, name: e.target.value })}
                  placeholder="Centre name (e.g. Green Cross Pharmacy)"
                  required
                  className={inputClass}
                />
                <input
                  type="text"
                  value={details.address}
                  onChange={(e) => setDetails({ ...details, address: e.target.value })}
                  placeholder="Address"
                  required
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="tel"
                    value={details.phone}
                    onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                    placeholder="Phone"
                    className={inputClass}
                  />
                  <input
                    type="email"
                    value={details.email}
                    onChange={(e) => setDetails({ ...details, email: e.target.value })}
                    placeholder="Email"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={!details.name.trim() || !details.address.trim() || isLoading} className={btnClass}>
                  {isLoading ? 'Saving...' : 'Continue'}
                </button>
              </form>
            )}

            {step === 'link' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep('details')} className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <h2 className="font-headline-md text-headline-md text-ink-deep">Link Admin Account</h2>
                </div>

                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Sign in with your Cervos admin account to enable online sync and payments.
                </p>

                <form onSubmit={handleLogin} className="flex flex-col gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className={inputClass}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    className={inputClass}
                  />

                  {error && (
                    <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={isLoading || !email.trim() || !password} className={btnClass}>
                    {isLoading ? 'Signing in...' : 'Sign In & Link'}
                  </button>
                </form>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-ink-deep/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-surface-base px-4 text-sm text-on-surface-variant">or</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenSignup}
                  className="w-full h-12 border border-ink-deep/20 text-ink-deep font-label-md font-bold rounded-none flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">domain_add</span>
                  Create Account at cervos.online
                </button>
              </div>
            )}

            {step === 'create-pin' && (
              <form onSubmit={handleCreatePin} className="flex flex-col gap-4">
                <div className="text-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-[24px] text-primary">lock</span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-ink-deep mb-1">Create Admin PIN</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Set a local PIN to secure this device
                  </p>
                </div>

                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="PIN (4+ digits)"
                  required
                  minLength={4}
                  maxLength={8}
                  className="w-full h-12 px-4 bg-white border border-gray-300 rounded-none text-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                />

                {error && (
                  <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={pin.length < 4 || isLoading} className={btnClass}>
                  {isLoading ? 'Creating...' : 'Create PIN & Finish'}
                </button>
              </form>
            )}

            {step === 'done' && (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-secondary/10 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-secondary">check_circle</span>
                </div>
                <h2 className="font-headline-md text-headline-md text-ink-deep mb-2">You're All Set!</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                  Your centre is configured and ready.
                </p>

                <div className="bg-surface-container rounded p-4 text-left text-sm mb-6">
                  <h3 className="font-medium text-ink-deep mb-2">Centre</h3>
                  <div className="space-y-1 text-on-surface-variant">
                    <p><span className="text-text-muted">Name:</span> {details.name}</p>
                    <p><span className="text-text-muted">Address:</span> {details.address}</p>
                  </div>
                </div>

                <button onClick={handleDone} className={btnClass}>
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
