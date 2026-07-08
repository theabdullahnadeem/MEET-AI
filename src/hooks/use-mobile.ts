import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Media-query subscription for useSyncExternalStore — resize/rotation changes
// notify React, which re-reads the snapshot below.
const subscribe = (onStoreChange: () => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // Server snapshot: matches the old initial `undefined → false` behaviour.
    () => false
  )
}
