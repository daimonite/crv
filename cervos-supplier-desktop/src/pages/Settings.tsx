import { useState } from 'react'
import { useAuth } from '../lib/hooks'
import { updateSupplierProfile } from '../lib/queries'
import { showToast } from '../components/ToastContainer'

export default function Settings() {
  const { supplier } = useAuth()
  const [formData, setFormData] = useState({
    company_name: supplier?.company_name || '',
    contact_name: supplier?.contact_name || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    city: supplier?.city || '',
    country: supplier?.country || '',
  })
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplier) return

    setLoading(true)
    try {
      await updateSupplierProfile(supplier.id, formData)
      showToast('success', 'Profile updated successfully')
    } catch (error) {
      showToast('error', 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Settings</h2>
        <p className="text-gray-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Company Profile</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Company Name</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Contact Name</label>
              <input
                type="text"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
              <input
                type="email"
                value={supplier?.email || ''}
                disabled
                className="w-full px-4 py-3 bg-surface-200 border border-surface-300 rounded-lg text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Country</label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface border border-surface-300 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-accent hover:bg-accent2 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Subscription</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium capitalize">{supplier?.subscription_tier} Plan</p>
            <p className="text-sm text-gray-400 mt-1">
              Status:{' '}
              <span
                className={`${
                  supplier?.subscription_status === 'active'
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {supplier?.subscription_status}
              </span>
            </p>
          </div>
          <a
            href="https://cervos.online/supplier/subscription"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface-200 border border-surface-300 rounded-lg text-white hover:bg-surface-300 transition-colors inline-block"
          >
            Upgrade Plan
          </a>
        </div>
      </div>
    </div>
  )
}
