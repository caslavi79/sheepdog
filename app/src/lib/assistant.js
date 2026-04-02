import { supabase } from './supabase'

const ASSISTANT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-assistant`

export async function askAssistant({ action, message, context, sessionId, data, imageBase64, imageMediaType }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expired — please log in again')

  const res = await fetch(ASSISTANT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action,
      message,
      context,
      session_id: sessionId,
      data,
      image_base64: imageBase64,
      image_media_type: imageMediaType,
    }),
  })

  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Request failed')
  return result
}
