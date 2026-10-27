import React, { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import { AvatarPicker } from '../../components/ui/avatar-picker.tsx';
import { useStaffAccess } from '../lib/useStaffAccess';

// "Edit avatar" pop-up for the signed-in staff member. Open it from anywhere
// with openAvatarPicker(); it saves to users/{uid}.avatar.

const OPEN_EVENT = 'lkgr:open-avatar-picker';

export function openAvatarPicker() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export default function AvatarPickerDialog() {
  const { user } = useStaffAccess();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const show = () => { setError(''); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const save = async seed => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setError('Your session has ended. Please sign in again.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', uid), { avatar: seed });
      setOpen(false);
    } catch (saveError) {
      console.error('Could not save avatar:', saveError);
      setError('Your avatar could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(10,15,10,0.55)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit avatar" style={{ width: '100%', maxWidth: 460, fontFamily: "'Poppins', sans-serif" }}>
        <AvatarPicker
          value={user?.avatar || ''}
          name={user?.name || 'Me'}
          subtitle={user?.avatar ? 'Pick a new avatar' : 'Choose an avatar for your staff profile'}
          saving={saving}
          error={error}
          onSave={save}
          onCancel={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
