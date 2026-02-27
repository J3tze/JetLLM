# Chat Appearance Customization Design

**Date:** 2026-02-27
**Scope:** Font options, message bubble styles, and text color customization for the chat UI.

---

## Overview

Extend the existing `ui:chatTheme` settings object with three new capabilities: selectable chat fonts, message bubble style presets, and a global text color with per-role overrides. All settings persist in the same JSON blob already used for chat theme colors, background image, and glass opacity.

## 1. Message Bubble Styles

Stored as `bubbleStyle: "flat" | "minimal" | "full"` in the theme object.

### Flat (default, current behavior)
- No bubble shapes
- User messages: full-width, subtle `bg-white/[0.03]` tint, `rounded-2xl`
- Assistant messages: no background, no border
- All messages left-aligned

### Minimal
- Soft rounded rectangles on both roles
- Both get `rounded-2xl` with padding, bubble colors from theme applied as background
- Messages stay left-aligned (no alignment shift)
- User bubble uses accent color (or custom), assistant uses `--chat-assistant-bubble`

### Full
- Classic chat-app bubbles with alignment
- User messages: right-aligned, accent-colored bubble, `rounded-2xl` with bottom-right corner sharper, max-width ~80%
- Assistant messages: left-aligned, dark bubble, `rounded-2xl` with bottom-left corner sharper, max-width ~80%
- Bubble colors from existing theme variables

### Implementation
- `ChatMessage` component reads `bubbleStyle` and applies different Tailwind classes per style
- Style passed via CSS custom property `--chat-bubble-style` or React context (CSS property preferred for consistency with existing theme system, but since Tailwind classes change structurally, a data attribute `data-bubble-style` on the message container is more practical)
- The `message-list.tsx` wrapper sets `data-bubble-style` from settings; `ChatMessage` reads it from a prop

## 2. Font Options

Stored as `font: string` (font family name) in the theme object. Default: `"Geist Sans"`.

### Curated Set

| Font | Category | Already Loaded |
|------|----------|----------------|
| Geist Sans | Sans | Yes (next/font) |
| Geist Mono | Mono | Yes (next/font) |
| Inter | Sans | No |
| Plus Jakarta Sans | Sans | No |
| Merriweather | Serif | No |
| Lora | Serif | No |
| JetBrains Mono | Mono | No |
| Nunito | Sans | No |

### Loading Strategy
- Geist Sans and Geist Mono: already loaded via `next/font/google` in `layout.tsx`, zero cost
- Other fonts: dynamically inject a `<link href="https://fonts.googleapis.com/css2?family=...&display=swap">` into `<head>` when selected
- Font loading happens in `ThemeInitializer` alongside other theme CSS variable application

### Scope
- Font applies to **message content only** via `--chat-font` CSS variable
- App chrome (sidebar, headers, settings, inputs) stays on Geist Sans
- The `message-list.tsx` or `chat-message.tsx` applies `font-family: var(--chat-font)` to the message text container

## 3. Text Color

### New field
- `textColor: string` — Global chat text color (hex). Default: `"#fafafa"`.
- Maps to new CSS variable `--chat-text-color`

### Existing fields (unchanged)
- `userBubbleFg: string` — Per-role override for user messages
- `assistantBubbleFg: string` — Per-role override for assistant messages

### Cascade
```
message color = per-role color ?? global textColor ?? #fafafa
```

In CSS: `color: var(--chat-user-bubble-fg, var(--chat-text-color))` for user messages, and similarly for assistant.

### Settings UI
- New "Chat Text Color" picker added to the Colors section, placed above the per-role text pickers
- Existing "User Text" and "Assistant Text" pickers remain, labeled as per-role overrides
- When a per-role color matches the global, show "Follows global" hint (similar to userBubble "Follows accent" pattern)

## 4. Settings Storage

The `ui:chatTheme` value expands from:
```typescript
{
  preset?: string
  colors: ChatThemeColors
  bgImage?: string
  glassOpacity?: number
}
```

To:
```typescript
{
  preset?: string
  colors: ChatThemeColors  // adds textColor field
  bgImage?: string
  glassOpacity?: number
  font?: string            // new — font family name
  bubbleStyle?: string     // new — "flat" | "minimal" | "full"
}
```

`ChatThemeColors` type adds:
```typescript
textColor: string  // new global text color
```

## 5. Theme Presets Update

Each existing preset gains default values for the new fields:
- All presets: `font: "Geist Sans"`, `bubbleStyle: "flat"`, `textColor: "#fafafa"`
- This preserves current behavior when selecting a preset

## 6. Settings UI Layout

In the Chat Theme card on the General settings tab:

1. **Presets** row (existing)
2. **Bubble Style** selector — three visual option buttons (Flat / Minimal / Full) with small preview icons
3. **Font** selector — dropdown or button group showing font names in their actual typeface
4. **Colors** section (existing, expanded):
   - Chat Background
   - Chat Text Color (new global)
   - User Bubble
   - User Text (shows "Follows global" when matching)
   - Assistant Bubble
   - Assistant Text (shows "Follows global" when matching)
5. **Background Image** (existing)
6. **Panel Transparency** (existing, when wallpaper active)
