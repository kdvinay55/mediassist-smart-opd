import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Calendar, Heart, Save, Camera, Pencil, Check, X } from 'lucide-react';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || '');

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/patients/profile');
        setProfile(res.data);
        setForm(res.data);
      } catch (err) {
        setForm({});
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/patients/profile', { ...form, name: nameInput });
      if (res.data.user) {
        updateUser(res.data.user);
      }
      setSaved(true);
      setEditingName(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>

      {/* User Info Card */}
      <div className="card flex items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-primary-100 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary-600">{(editingName ? nameInput : user?.name)?.[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  type="text"
                  className="input-field text-xl font-bold"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  autoFocus
                />
                <button onClick={() => setEditingName(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
                <button onClick={() => { setNameInput(user?.name || ''); setEditingName(true); }} className="p-1 text-gray-400 hover:text-primary-600 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <p className="text-gray-500">{user?.email}</p>
          <p className="text-sm text-gray-400 capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Patient Profile */}
      {user?.role === 'patient' && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-900">Medical Profile</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input type="date" className="input-field" value={form.dateOfBirth?.split('T')[0] || ''} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select className="input-field" value={form.gender || ''} onChange={e => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
              <select className="input-field" value={form.bloodGroup || ''} onChange={e => setForm({ ...form, bloodGroup: e.target.value })}>
                <option value="">Select</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" className="input-field" value={form.address?.city || ''} onChange={e => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Allergies (comma separated)</label>
            <input type="text" className="input-field" value={(form.allergies || []).join(', ')} onChange={e => setForm({ ...form, allergies: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="e.g., Penicillin, Peanuts" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chronic Conditions (comma separated)</label>
            <input type="text" className="input-field" value={(form.chronicConditions || []).join(', ')} onChange={e => setForm({ ...form, chronicConditions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="e.g., Diabetes, Hypertension" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
              <input type="text" className="input-field" value={form.emergencyContact?.name || ''} onChange={e => setForm({ ...form, emergencyContact: { ...form.emergencyContact, name: e.target.value } })} placeholder="Name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
              <input type="tel" className="input-field" value={form.emergencyContact?.phone || ''} onChange={e => setForm({ ...form, emergencyContact: { ...form.emergencyContact, phone: e.target.value } })} placeholder="Phone" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relation</label>
              <input type="text" className="input-field" value={form.emergencyContact?.relation || ''} onChange={e => setForm({ ...form, emergencyContact: { ...form.emergencyContact, relation: e.target.value } })} placeholder="Relation" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
