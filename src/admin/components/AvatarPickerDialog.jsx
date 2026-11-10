import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [name, setName] = useState(null); // null until the person types

  useEffect(() => {
    const show = () => { setError(''); setName(null); setOpen(true); };
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
  // The name field starts with the saved name until the person types.
  const shownName = name ?? user?.name ?? '';

  const save = async seed => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setError('Your session has ended. Please sign in again.'); return; }
    const cleanName = shownName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 80) { setError('Enter a name between 2 and 80 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', uid), { avatar: seed, name: cleanName });
      setOpen(false);
    } catch (saveError) {
      console.error('Could not save profile:', saveError);
      setError(saveError?.code === 'permission-denied'
        ? 'Saving was blocked by the database rules. Ask the admin to publish the latest Firestore rules.'
        : 'Your profile could not be saved. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // Rendered into <body>: inside the sidebar, its animated container would
  // trap the pop-up and the backdrop would only cover the sidebar.
  return createPortal((
    <div
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(10,15,10,0.55)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div role="dialog" aria-modal="true" aria-label="Edit profile" style={{ width: '100%', maxWidth: 460, fontFamily: "'Poppins', sans-serif" }}>
        <AvatarPicker
          value={user?.avatar || ''}
          name={shownName}
          onNameChange={setName}
          subtitle={user?.avatar ? 'Edit your name or pick a new avatar' : 'Choose an avatar for your staff profile'}
          saving={saving}
          error={error}
          onSave={save}
          onCancel={() => setOpen(false)}
        />
      </div>
    </div>
  ), document.body);
}
