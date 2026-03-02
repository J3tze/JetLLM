"use client"

import { useEffect, useRef } from "react"

const EDGE_OPEN_ZONE_PX = 30
const CLOSE_ZONE_MAX_PX = 360
const SWIPE_THRESHOLD_PX = 50

type SwipeIntent = "open" | "close"

type SwipeSidebarOptions = {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

export function useSwipeSidebar({ isOpen, onOpen, onClose }: SwipeSidebarOptions) {
  const touchStart = useRef<{ x: number; y: number; intent: SwipeIntent } | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) {
        touchStart.current = null
        return
      }

      if (!isOpen && touch.clientX <= EDGE_OPEN_ZONE_PX) {
        touchStart.current = { x: touch.clientX, y: touch.clientY, intent: "open" }
        return
      }

      if (isOpen && touch.clientX <= Math.min(window.innerWidth, CLOSE_ZONE_MAX_PX)) {
        touchStart.current = { x: touch.clientX, y: touch.clientY, intent: "close" }
        return
      }

      touchStart.current = null
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return
      const touch = e.changedTouches[0]
      if (!touch) {
        touchStart.current = null
        return
      }

      const { x, y, intent } = touchStart.current
      const dx = touch.clientX - x
      const dy = Math.abs(touch.clientY - y)
      const absDx = Math.abs(dx)
      touchStart.current = null

      if (absDx < SWIPE_THRESHOLD_PX || dy >= absDx) {
        return
      }

      if (intent === "open" && dx > 0) {
        onOpen()
        return
      }

      if (intent === "close" && dx < 0) {
        onClose()
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true })
    document.addEventListener("touchend", handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", handleTouchStart)
      document.removeEventListener("touchend", handleTouchEnd)
    }
  }, [isOpen, onOpen, onClose])
}
