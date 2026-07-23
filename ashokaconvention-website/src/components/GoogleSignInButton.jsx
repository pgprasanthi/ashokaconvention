import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth()
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    // The GSI script tag loads async/defer, so it may not be ready yet when
    // this effect first runs — poll until window.google shows up.
    function renderWhenReady() {
      if (cancelled || !buttonRef.current) return
      if (!window.google?.accounts?.id) {
        setTimeout(renderWhenReady, 100)
        return
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: ({ credential }) => loginWithGoogle(credential)
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'medium',
        text: 'signin_with'
      })
    }

    renderWhenReady()
    return () => { cancelled = true }
  }, [loginWithGoogle])

  if (!CLIENT_ID) {
    return <span className="google-signin-missing">Set VITE_GOOGLE_CLIENT_ID to enable sign-in</span>
  }

  return <div ref={buttonRef} className="google-signin-button" />
}
