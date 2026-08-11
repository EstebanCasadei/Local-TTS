/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { signInAnonymously } from 'firebase/auth'
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { getFirebase, firebaseConfigured } from './firebase'

// Opt-in: only hits the real Firebase project when FIREBASE_SMOKE_TEST=1, so
// the default `pnpm test` stays offline and side-effect free.
const SMOKE = process.env.FIREBASE_SMOKE_TEST === '1'

describe.runIf(SMOKE)('Firebase access smoke test', () => {
  it('signs in anonymously and round-trips a doc under users/{uid}', async () => {
    if (!firebaseConfigured) {
      throw new Error(
        'FIREBASE_SMOKE_TEST=1 but Firebase env vars are missing. ' +
          'Copy .env.example to .env and fill in the values from the Firebase console.',
      )
    }

    const fb = getFirebase()
    if (!fb) throw new Error('getFirebase() returned null despite firebaseConfigured')

    // Anonymous auth proves the Auth provider is enabled and the config is valid.
    const cred = await signInAnonymously(fb.auth)
    const uid = cred.user.uid

    // Write/read/delete under users/{uid}/_smoke/{id} proves the firestore rules
    // allow per-user access (and block anything outside that subtree).
    const id = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ref = doc(fb.db, 'users', uid, '_smoke', id)
    const payload = { ok: true, at: new Date().toISOString() }

    await setDoc(ref, payload)
    const snap = await getDoc(ref)
    expect(snap.exists()).toBe(true)
    expect(snap.data()).toMatchObject(payload)

    await deleteDoc(ref)
    const after = await getDoc(ref)
    expect(after.exists()).toBe(false)
  })
})
