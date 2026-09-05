import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, getLinkStatus, linkToExistingBranch, runSyncCycle, type RemoteBranch } from '../lib/sync'
import { queryDb } from '../lib/database'
import { open } from '@tauri-apps/plugin-shell'
import { WEB_URL } from '../lib/web'

type OnboardingStep = 'welcome' | 'link' | 'select-branch' | 'done'

interface OnboardingProps {
  onComplete?: () => void
  relinking?: boolean
}

export default function Onboarding({ onComplete, relinking = false }: OnboardingProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [branches, setBranches] = useState<RemoteBranch[]>([])
  const [linkedBranch, setLinkedBranch] = useState<{ name: string; address: string } | null>(null)

  const inputClass = 'w-full h-12 px-4 bg-surface-base border border-ink-deep/20 rounded-none text-body-md text-ink-deep focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-text-muted'
  const btnClass = 'w-full h-12 bg-primary text-white rounded-none font-label-md font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60'

  async function finishLink() {
    const branchRows = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
    const branchId = branchRows.length ? JSON.parse(branchRows[0].value) : null
    const operators = branchId
      ? await queryDb('SELECT id FROM operators WHERE branch_id = ?', [branchId])
      : []
    if (operators.length === 0) {
      throw new Error('No branch operators are available yet. Add an operator and their login PIN in the pharmacy portal, then link this POS again.')
    }
    setStep('done')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      await signIn(email.trim(), password)

      // Real branches only — this never invents a pharmacy location. If the
      // account has none yet, the operator needs to create one in the web
      // portal first; a POS device is not where a branch gets created.
      const status = await getLinkStatus()
      if (status.alreadyLinked) {
        // A Settings-initiated relink only restores the cloud session for the
        // existing branch. It must not send an established terminal through
        // the first-run PIN creation flow again.
        if (relinking) {
          onComplete?.()
          return
        }
        await runSyncCycle()
        await finishLink()
        return
      }
      if (status.branches.length === 0) {
        setError('This account has no branches yet. Create one at cervos.online/dashboard/branches first, then sign in here again.')
        return
      }
      if (status.branches.length === 1) {
        await linkToExistingBranch(status.branches[0].id)
        await finishLink()
        return
      }
      setBranches(status.branches)
      setStep('select-branch')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSelectBranch(branchId: string) {
    setIsLoading(true)
    setError(null)
    try {
      await linkToExistingBranch(branchId)
      await finishLink()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link this branch')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Pull the real linked branch's name/address (written by
    // linkToExistingBranch) for display on the final confirmation screen —
    // never invented, always whatever this device actually got linked to.
    if (step !== 'done') return
    ;(async () => {
      const nameRows = await queryDb("SELECT value FROM app_settings WHERE key = 'centre_name'")
      const addrRows = await queryDb("SELECT value FROM app_settings WHERE key = 'centre_address'")
      setLinkedBranch({
        name: nameRows.length > 0 ? JSON.parse(nameRows[0].value) : 'Unknown branch',
        address: addrRows.length > 0 ? JSON.parse(addrRows[0].value) : '',
      })
    })()
  }, [step])

  async function handleOpenSignup() {
    const signupUrl = `${WEB_URL}/auth?tab=signup&type=pharmacy`
    try {
      await open(signupUrl)
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
                  Sign in with your pharmacy account to link this device to a branch.
                </p>
                <button onClick={() => setStep('link')} className={btnClass}>
                  Sign In & Link This POS
                </button>
                <button
                  type="button"
                  onClick={handleOpenSignup}
                  className="w-full h-12 mt-3 border border-ink-deep/20 text-ink-deep font-label-md font-bold rounded-none flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">domain_add</span>
                  Create Pharmacy Account
                </button>
              </div>
            )}

            {step === 'select-branch' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep('link')} className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">arrow_back</span>
                  </button>
                  <h2 className="font-headline-md text-headline-md text-ink-deep">Select Branch</h2>
                </div>

                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  This account has multiple branches. Which one is this device for?
                </p>

                {error && (
                  <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-sm">
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSelectBranch(b.id)}
                      className="w-full text-left px-4 py-3 border border-ink-deep/20 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-60"
                    >
                      <p className="font-label-md font-bold text-ink-deep">{b.name}</p>
                      {b.address && <p className="text-sm text-on-surface-variant">{b.address}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'link' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={() => setStep('welcome')} className="text-on-surface-variant hover:text-primary">
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

            {step === 'done' && (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-secondary/10 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-secondary">check_circle</span>
                </div>
                <h2 className="font-headline-md text-headline-md text-ink-deep mb-2">You're All Set!</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                  This device is linked to your branch. Operators can now sign in with the PIN assigned in the pharmacy portal.
                </p>

                <div className="bg-surface-container rounded p-4 text-left text-sm mb-6">
                  <h3 className="font-medium text-ink-deep mb-2">Branch</h3>
                  <div className="space-y-1 text-on-surface-variant">
                    <p><span className="text-text-muted">Name:</span> {linkedBranch?.name ?? '—'}</p>
                    <p><span className="text-text-muted">Address:</span> {linkedBranch?.address || '—'}</p>
                  </div>
                </div>

                <button onClick={handleDone} className={btnClass}>
                  Go to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
