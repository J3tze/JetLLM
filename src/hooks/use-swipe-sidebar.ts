"use client"

import { useEffect, useRef } from "react"

/**
 * Detects a right-swipe gesture starting from the left edge of the screen
 * and calls `onOpen` to open the sidebar.
 *
 * Usage: call inside a component that lives within `SidebarProvider`, passing
 * `() => setOpenMobile(true)` from the `useSidebar()` hook.
 *
 * The gesture triggers when:
 * - The touch starts within 30px of the left edge
 * - The horizontal distance exceeds 50px
 * - The horizontal distance exceeds the vertical distance (prevents
 *   accidental triggers while scrolling)
 */
export function useSwipeSidebar(onOpen: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      // Only track touches that begin near the left edge
      if (touch.clientX < 30) {
        touchStart.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStart.current.x
      const dy = Math.abs(touch.clientY - touchStart.current.y)
      touchStart.current = null

      // Require a clear horizontal swipe: at least 50px right, and more
      // horizontal than vertical to avoid triggering on vertical scrolls.
      if (dx > 50 && dy < dx) {
        onOpen()
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true })
    document.addEventListener("touchend", handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", handleTouchStart)
      document.removeEventListener("touchend", handleTouchEnd)
    }
  }, [onOpen])
}
