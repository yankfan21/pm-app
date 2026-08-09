import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'

export const CONTACT_REASONS = ['Technical Issue', 'Subscription', 'General Inquiry']

// Shared submit logic for the Contact Support form - desktop (ContactSupportForm.jsx)
// and mobile (MobileContactSupport.jsx) each render their own purpose-built markup
// around this, same split as every other desktop/mobile pair in this app (see
// MobileSettings.jsx's comment on that convention).
export function useContactSubmit() {
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  async function submit({ name, email, contactReason, message }) {
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('contact_submissions').insert({
      user_id: user?.id ?? null,
      name: name.trim(),
      email: email.trim(),
      contact_reason: contactReason,
      message: message.trim(),
    })

    if (insertError) {
      setSubmitting(false)
      setError(insertError.message)
      return
    }

    // Best-effort: the submission is already saved at this point, so a failure to
    // send the admin notification email shouldn't block the user from seeing success -
    // same reasoning NewProjectFlow.jsx uses for its best-effort phase-seeding step.
    const { error: fnError } = await supabase.functions.invoke('send-contact-notification', {
      body: {
        name: name.trim(),
        email: email.trim(),
        contactReason,
        message: message.trim(),
        submittedByEmail: user?.email ?? null,
      },
    })
    if (fnError) {
      console.error('Failed to send contact notification email:', fnError.message)
    }

    setSubmitting(false)
    setSubmitted(true)
  }

  return { submit, submitting, error, submitted }
}
