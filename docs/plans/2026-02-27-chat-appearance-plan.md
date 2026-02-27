# Chat Appearance Customization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add font selection, message bubble styles (flat/minimal/full), and global text color with per-role overrides to the chat UI.

**Architecture:** Extend the existing `ui:chatTheme` settings blob with `font`, `bubbleStyle`, and `textColor` fields. The `useChatTheme` hook manages all state and applies CSS variables. `ChatMessage` receives `bubbleStyle` as a prop and renders different layouts. Fonts load dynamically via Google Fonts `<link>` injection.

**Tech Stack:** React, Tailwind CSS v4, CSS custom properties, Google Fonts API

**Design Doc:** `docs/plans/2026-02-27-chat-appearance-design.md`

---

## Task 1: Extend Theme Types and Hook State

**Files:**
- Modify: `src/hooks/use-chat-theme.ts`

**Step 1: Add `textColor` to `ChatThemeColors` type and `font`/`bubbleStyle` to the hook**

In `src/hooks/use-chat-theme.ts`, update the `ChatThemeColors` type to include `textColor`:

```typescript
export type ChatThemeColors = {
  chatBg: string
  userBubble: string
  userBubbleFg: string
  assistantBubble: string
  assistantBubbleFg: string
  assistantBorder: string
  textColor: string // NEW — global chat text color
}
```

Add a `BubbleStyle` type and `CHAT_FONTS` constant:

```typescript
export type BubbleStyle = "flat" | "minimal" | "full"

export const CHAT_FONTS = [
  { name: "Geist Sans", family: "var(--font-geist-sans)", builtin: true },
  { name: "Geist Mono", family: "var(--font-geist-mono)", builtin: true },
  { name: "Inter", family: "'Inter'", builtin: false },
  { name: "Plus Jakarta Sans", family: "'Plus Jakarta Sans'", builtin: false },
  { name: "Merriweather", family: "'Merriweather'", builtin: false },
  { name: "Lora", family: "'Lora'", builtin: false },
  { name: "JetBrains Mono", family: "'JetBrains Mono'", builtin: false },
  { name: "Nunito", family: "'Nunito'", builtin: false },
] as const

export type ChatFont = (typeof CHAT_FONTS)[number]
```

**Step 2: Add `textColor` to every preset**

Update each preset in `CHAT_THEME_PRESETS` to include `textColor: "#fafafa"`:

```typescript
export const CHAT_THEME_PRESETS: readonly ChatThemePreset[] = [
  {
    name: "AMOLED Black",
    colors: {
      chatBg: "#000000",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#131313",
      assistantBubbleFg: "#fafafa",
      assistantBorder: "#ffffff14",
      textColor: "#fafafa",
    },
  },
  {
    name: "Dark Gray",
    colors: {
      chatBg: "#0a0a0a",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#1c1c1c",
      assistantBubbleFg: "#e5e5e5",
      assistantBorder: "#ffffff1a",
      textColor: "#e5e5e5",
    },
  },
  {
    name: "Midnight Blue",
    colors: {
      chatBg: "#0a0e1a",
      userBubble: USER_BUBBLE_ACCENT,
      userBubbleFg: "#ffffff",
      assistantBubble: "#111827",
      assistantBubbleFg: "#e0e7ff",
      assistantBorder: "#3b82f633",
      textColor: "#e0e7ff",
    },
  },
] as const
```

**Step 3: Add `textColor` to `CSS_VAR_MAP`**

```typescript
const CSS_VAR_MAP: Record<keyof ChatThemeColors, string> = {
  chatBg: "--chat-bg",
  userBubble: "--chat-user-bubble",
  userBubbleFg: "--chat-user-bubble-fg",
  assistantBubble: "--chat-assistant-bubble",
  assistantBubbleFg: "--chat-assistant-bubble-fg",
  assistantBorder: "--chat-assistant-border",
  textColor: "--chat-text-color",
}
```

**Step 4: Add font and bubble style state to the hook**

Add new state variables inside `useChatTheme()`:

```typescript
const [font, setFontState] = useState<string>("Geist Sans")
const [bubbleStyle, setBubbleStyleState] = useState<BubbleStyle>("flat")
```

**Step 5: Add `applyFont` and `applyBubbleStyle` helper functions**

Add these above the hook function:

```typescript
function applyFont(fontName: string) {
  const fontDef = CHAT_FONTS.find(f => f.name === fontName)
  if (!fontDef) return

  // Load external font via Google Fonts if not builtin
  if (!fontDef.builtin) {
    const linkId = `chat-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link")
      link.id = linkId
      link.rel = "stylesheet"
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }

  document.documentElement.style.setProperty("--chat-font", fontDef.family)
}

function applyBubbleStyle(style: BubbleStyle) {
  document.documentElement.dataset.bubbleStyle = style
}
```

**Step 6: Load font/bubbleStyle from saved settings in the `useEffect`**

Update the fetch handler inside the existing `useEffect` to also read the new fields:

```typescript
// Inside the .then() handler, after existing color/bgImage/glassOpacity loading:
if (saved?.font) {
  setFontState(saved.font)
  applyFont(saved.font)
}
if (saved?.bubbleStyle) {
  setBubbleStyleState(saved.bubbleStyle as BubbleStyle)
  applyBubbleStyle(saved.bubbleStyle as BubbleStyle)
}
```

Also update the type assertion for `saved` to include the new fields:

```typescript
const saved = settings["ui:chatTheme"] as {
  preset?: string
  colors?: ChatThemeColors
  bgImage?: string
  glassOpacity?: number
  font?: string
  bubbleStyle?: string
} | undefined
```

**Step 7: Update `persistTheme` to include font and bubbleStyle**

Change `persistTheme` signature and body to include all fields:

```typescript
const persistTheme = useCallback((
  newColors: ChatThemeColors,
  preset: string | null,
  newBgImage: string,
  newGlassOpacity: number,
  newFont: string,
  newBubbleStyle: BubbleStyle,
) => {
  fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "ui:chatTheme",
      value: {
        preset,
        colors: newColors,
        bgImage: newBgImage,
        glassOpacity: newGlassOpacity,
        font: newFont,
        bubbleStyle: newBubbleStyle,
      },
    }),
  }).catch(() => {})
}, [])
```

**Step 8: Update all callers of `persistTheme`**

Update `saveTheme`, `setBgImage`, and `setGlassOpacity` callbacks to pass `font` and `bubbleStyle`:

```typescript
const saveTheme = useCallback((newColors: ChatThemeColors, preset: string | null) => {
  setColors(newColors)
  setPresetName(preset)
  applyChatTheme(newColors)
  persistTheme(newColors, preset, bgImage, glassOpacity, font, bubbleStyle)
}, [bgImage, glassOpacity, font, bubbleStyle, persistTheme])

const setBgImage = useCallback((url: string) => {
  setBgImageState(url)
  applyBgImage(url)
  persistTheme(colors, presetName, url, glassOpacity, font, bubbleStyle)
}, [colors, presetName, glassOpacity, font, bubbleStyle, persistTheme])

const setGlassOpacity = useCallback((opacity: number) => {
  setGlassOpacityState(opacity)
  applyGlassOpacity(opacity)
  persistTheme(colors, presetName, bgImage, opacity, font, bubbleStyle)
}, [colors, presetName, bgImage, font, bubbleStyle, persistTheme])
```

**Step 9: Add `setFont` and `setBubbleStyle` callbacks**

```typescript
const setFont = useCallback((fontName: string) => {
  setFontState(fontName)
  applyFont(fontName)
  persistTheme(colors, presetName, bgImage, glassOpacity, fontName, bubbleStyle)
}, [colors, presetName, bgImage, glassOpacity, bubbleStyle, persistTheme])

const setBubbleStyle = useCallback((style: BubbleStyle) => {
  setBubbleStyleState(style)
  applyBubbleStyle(style)
  persistTheme(colors, presetName, bgImage, glassOpacity, font, style)
}, [colors, presetName, bgImage, glassOpacity, font, persistTheme])
```

**Step 10: Add new fields to the return value**

```typescript
return {
  colors,
  presetName,
  presets: CHAT_THEME_PRESETS,
  setThemePreset,
  setCustomColor,
  bgImage,
  setBgImage,
  glassOpacity,
  setGlassOpacity,
  font,
  setFont,
  fonts: CHAT_FONTS,
  bubbleStyle,
  setBubbleStyle,
}
```

**Step 11: Run lint to verify**

Run: `npx eslint src/hooks/use-chat-theme.ts`
Expected: No errors.

**Step 12: Commit**

```bash
git add src/hooks/use-chat-theme.ts
git commit -m "feat: extend chat theme hook with font, bubbleStyle, textColor"
```

---

## Task 2: Update ThemeInitializer to Apply New Settings on Load

**Files:**
- Modify: `src/components/theme-initializer.tsx`

**Step 1: Add font and bubble style application to ThemeInitializer**

In the `.then()` handler, after the existing chat theme color application block, add:

```typescript
// Apply textColor CSS variable
if (chatTheme?.colors?.textColor) {
  el.style.setProperty("--chat-text-color", chatTheme.colors.textColor)
}

// Apply font
if (chatTheme?.font) {
  const fontDef = CHAT_FONTS.find((f: { name: string }) => f.name === chatTheme.font)
  if (fontDef && !fontDef.builtin) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(chatTheme.font)}:wght@300;400;500;600;700&display=swap`
    document.head.appendChild(link)
  }
  if (fontDef) {
    document.documentElement.style.setProperty("--chat-font", fontDef.family)
  }
}

// Apply bubble style
if (chatTheme?.bubbleStyle) {
  document.documentElement.dataset.bubbleStyle = chatTheme.bubbleStyle
}
```

Import `CHAT_FONTS` at the top:

```typescript
import { CHAT_FONTS } from "@/hooks/use-chat-theme"
```

Also add `textColor` to the `CHAT_THEME_VARS` map in `theme-initializer.tsx`:

```typescript
const CHAT_THEME_VARS: Record<string, string> = {
  chatBg: "--chat-bg",
  userBubble: "--chat-user-bubble",
  userBubbleFg: "--chat-user-bubble-fg",
  assistantBubble: "--chat-assistant-bubble",
  assistantBubbleFg: "--chat-assistant-bubble-fg",
  assistantBorder: "--chat-assistant-border",
  textColor: "--chat-text-color",
}
```

**Step 2: Add default `--chat-font` and `--chat-text-color` to globals.css**

In `src/app/globals.css`, add to the `:root` block:

```css
--chat-font: var(--font-geist-sans);
--chat-text-color: #fafafa;
```

**Step 3: Run lint**

Run: `npx eslint src/components/theme-initializer.tsx`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/theme-initializer.tsx src/app/globals.css
git commit -m "feat: apply font, bubbleStyle, textColor on theme initialization"
```

---

## Task 3: Update ChatMessage Component for Bubble Styles

**Files:**
- Modify: `src/components/chat/chat-message.tsx`
- Modify: `src/components/chat/message-list.tsx`

**Step 1: Add `bubbleStyle` prop and style variants to ChatMessage**

Replace the entire `chat-message.tsx` with:

```typescript
"use client"

import { cn } from "@/lib/utils"
import type { BubbleStyle } from "@/hooks/use-chat-theme"

type ChatMessageProps = {
  role: "user" | "assistant"
  bubbleStyle?: BubbleStyle
  children: React.ReactNode
}

export function ChatMessage({ role, bubbleStyle = "flat", children }: ChatMessageProps) {
  const isUser = role === "user"

  // Flat: current behavior — subtle tint on user, nothing on assistant
  if (bubbleStyle === "flat") {
    return (
      <div
        className={cn(
          "px-4 py-4",
          isUser && "bg-white/[0.03] rounded-2xl"
        )}
        style={{ color: isUser
          ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
          : "var(--chat-assistant-bubble-fg, var(--chat-text-color))"
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    )
  }

  // Minimal: rounded rectangles, left-aligned, theme colors applied
  if (bubbleStyle === "minimal") {
    return (
      <div
        className="px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: isUser
            ? "var(--chat-user-bubble)"
            : "var(--chat-assistant-bubble)",
          color: isUser
            ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
            : "var(--chat-assistant-bubble-fg, var(--chat-text-color))",
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    )
  }

  // Full: classic chat bubbles with alignment
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "px-4 py-3 max-w-[80%]",
          isUser
            ? "rounded-2xl rounded-br-md"
            : "rounded-2xl rounded-bl-md",
        )}
        style={{
          backgroundColor: isUser
            ? "var(--chat-user-bubble)"
            : "var(--chat-assistant-bubble)",
          color: isUser
            ? "var(--chat-user-bubble-fg, var(--chat-text-color))"
            : "var(--chat-assistant-bubble-fg, var(--chat-text-color))",
        }}
      >
        <div className="text-sm leading-relaxed" style={{ fontFamily: "var(--chat-font)" }}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Pass `bubbleStyle` from MessageList to ChatMessage**

In `src/components/chat/message-list.tsx`, add a `bubbleStyle` prop to `MessageListProps`:

```typescript
import type { BubbleStyle } from "@/hooks/use-chat-theme"

type MessageListProps = {
  messages: UIMessage[]
  isLoading?: boolean
  bubbleStyle?: BubbleStyle
}
```

Update the function signature:

```typescript
export function MessageList({ messages, isLoading, bubbleStyle = "flat" }: MessageListProps) {
```

Pass it through to every `<ChatMessage>` usage:

```tsx
<ChatMessage key={message.id} role={message.role as "user" | "assistant"} bubbleStyle={bubbleStyle}>
```

And the thinking placeholder:

```tsx
<ChatMessage role="assistant" bubbleStyle={bubbleStyle}>
```

**Step 3: Pass `bubbleStyle` from ChatPanel to MessageList**

In `src/components/chat/chat-panel.tsx`, add state that reads from the `data-bubble-style` attribute or use a simpler approach — read it from settings alongside defaults.

Add a `bubbleStyle` state:

```typescript
import type { BubbleStyle } from "@/hooks/use-chat-theme"
```

```typescript
const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>("flat")
```

In the existing `useEffect` that loads settings (the one that fetches `/api/settings`), add:

```typescript
const chatTheme = settings["ui:chatTheme"] as { bubbleStyle?: string } | undefined
if (chatTheme?.bubbleStyle) {
  setBubbleStyle(chatTheme.bubbleStyle as BubbleStyle)
}
```

Pass it to `MessageList`:

```tsx
<MessageList messages={messages} isLoading={isLoading} bubbleStyle={bubbleStyle} />
```

**Step 4: Run lint**

Run: `npx eslint src/components/chat/chat-message.tsx src/components/chat/message-list.tsx src/components/chat/chat-panel.tsx`
Expected: No errors.

**Step 5: Visually verify all three styles work**

Run: `npm run dev`

1. Open http://localhost:3000/settings
2. The bubble style selector isn't in the UI yet (Task 4), so manually test by opening browser devtools and running:
   - `document.documentElement.dataset.bubbleStyle = "flat"` — verify current look
   - `document.documentElement.dataset.bubbleStyle = "minimal"` — verify rounded bubbles
   - `document.documentElement.dataset.bubbleStyle = "full"` — verify aligned bubbles

Note: The visual verification via devtools won't work since bubbleStyle is passed as a React prop, not a data attribute. Instead, temporarily hardcode `bubbleStyle="minimal"` and then `bubbleStyle="full"` in `chat-panel.tsx` to verify, then revert to `bubbleStyle={bubbleStyle}`.

**Step 6: Commit**

```bash
git add src/components/chat/chat-message.tsx src/components/chat/message-list.tsx src/components/chat/chat-panel.tsx
git commit -m "feat: implement flat/minimal/full bubble style rendering"
```

---

## Task 4: Update Settings UI — Bubble Style Selector

**Files:**
- Modify: `src/components/settings/chat-theme-picker.tsx`

**Step 1: Update `ChatThemeState` type to include new fields**

Add the new fields to the `ChatThemeState` type:

```typescript
import { type BubbleStyle, type ChatFont, CHAT_FONTS } from "@/hooks/use-chat-theme"
```

```typescript
type ChatThemeState = {
  colors: ChatThemeColors
  presetName: string | null
  presets: readonly ChatThemePreset[]
  setThemePreset: (preset: ChatThemePreset) => void
  setCustomColor: (key: keyof ChatThemeColors, hex: string) => void
  bgImage: string
  setBgImage: (url: string) => void
  glassOpacity: number
  setGlassOpacity: (opacity: number) => void
  font: string
  setFont: (fontName: string) => void
  fonts: readonly ChatFont[]
  bubbleStyle: BubbleStyle
  setBubbleStyle: (style: BubbleStyle) => void
}
```

**Step 2: Add bubble style selector section**

Destructure the new fields:

```typescript
const { colors, presetName, presets, setThemePreset, setCustomColor, bgImage, setBgImage, glassOpacity, setGlassOpacity, font, setFont, fonts, bubbleStyle, setBubbleStyle } = chatThemeState
```

Add bubble style selector after the Presets section and before Colors:

```tsx
<div className="space-y-2">
  <Label className="text-xs text-muted-foreground">Bubble Style</Label>
  <div className="flex flex-wrap gap-2">
    {(["flat", "minimal", "full"] as const).map(style => (
      <button
        key={style}
        onClick={() => setBubbleStyle(style)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border capitalize",
          bubbleStyle === style
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
        )}
      >
        {style === "flat" && "Flat"}
        {style === "minimal" && "Minimal"}
        {style === "full" && "Full Bubbles"}
      </button>
    ))}
  </div>
</div>
```

**Step 3: Add `textColor` to `COLOR_ROWS`**

Update the `COLOR_ROWS` array to include textColor above the per-role text colors:

```typescript
const COLOR_ROWS: { key: keyof ChatThemeColors; label: string }[] = [
  { key: "chatBg", label: "Chat Background" },
  { key: "textColor", label: "Chat Text Color" },
  { key: "userBubble", label: "User Bubble" },
  { key: "userBubbleFg", label: "User Text" },
  { key: "assistantBubble", label: "Assistant Bubble" },
  { key: "assistantBubbleFg", label: "Assistant Text" },
]
```

Update the hint logic in the `COLOR_ROWS.map()` to add "Follows global" hints:

```tsx
{COLOR_ROWS.map(({ key, label }) => (
  <ColorRow
    key={key}
    label={label}
    value={displayColors[key]}
    hint={
      key === "userBubble" && colors.userBubble === USER_BUBBLE_ACCENT
        ? "Follows accent"
        : key === "userBubbleFg" && colors.userBubbleFg === colors.textColor
          ? "Follows global"
          : key === "assistantBubbleFg" && colors.assistantBubbleFg === colors.textColor
            ? "Follows global"
            : undefined
    }
    onChange={(hex) => setCustomColor(key, hex)}
  />
))}
```

**Step 4: Run lint**

Run: `npx eslint src/components/settings/chat-theme-picker.tsx`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/settings/chat-theme-picker.tsx
git commit -m "feat: add bubble style selector and textColor to settings UI"
```

---

## Task 5: Update Settings UI — Font Selector

**Files:**
- Modify: `src/components/settings/chat-theme-picker.tsx`

**Step 1: Add font selector section**

Add the font selector after the bubble style section and before Colors:

```tsx
<div className="space-y-2">
  <Label className="text-xs text-muted-foreground">Chat Font</Label>
  <div className="flex flex-wrap gap-2">
    {fonts.map(f => (
      <button
        key={f.name}
        onClick={() => setFont(f.name)}
        className={cn(
          "px-3 py-1.5 rounded-lg text-sm transition-all border",
          font === f.name
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border bg-card text-muted-foreground hover:border-muted-foreground"
        )}
        style={{ fontFamily: f.family }}
      >
        {f.name}
      </button>
    ))}
  </div>
</div>
```

**Step 2: Load external fonts in the settings page so previews render correctly**

The font buttons use `style={{ fontFamily: f.family }}` but external fonts haven't been loaded yet. Add a one-time effect to load all external font stylesheets when the picker mounts.

Add a `useEffect` inside `ChatThemePicker`:

```typescript
useEffect(() => {
  // Preload all external fonts so the font selector shows proper previews
  CHAT_FONTS.filter(f => !f.builtin).forEach(f => {
    const linkId = `chat-font-preview-${f.name.replace(/\s+/g, "-").toLowerCase()}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link")
      link.id = linkId
      link.rel = "stylesheet"
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.name)}:wght@400;500&display=swap`
      document.head.appendChild(link)
    }
  })
}, [])
```

Add `useEffect` to the import at the top if not already there.

**Step 3: Run lint**

Run: `npx eslint src/components/settings/chat-theme-picker.tsx`
Expected: No errors.

**Step 4: Visually verify**

Run: `npm run dev`

1. Open http://localhost:3000/settings
2. Verify bubble style buttons appear and switch between flat/minimal/full
3. Verify font buttons appear in their actual typefaces
4. Select a font (e.g., "Inter") and go to chat — messages should render in Inter
5. Select "Full Bubbles" — messages should be aligned left/right with colored bubbles
6. Verify "Chat Text Color" picker appears in the colors section
7. Change it and verify message text color updates

**Step 5: Commit**

```bash
git add src/components/settings/chat-theme-picker.tsx
git commit -m "feat: add font selector with live previews to settings"
```

---

## Task 6: Sync ChatPanel bubbleStyle with Live Settings Changes

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`

**Step 1: Listen for bubble style changes from settings**

Currently `ChatPanel` loads `bubbleStyle` once from settings on mount. If the user changes it in settings (which is a separate page), the chat panel won't update until page reload. This is acceptable since settings is a separate page.

However, if in the future settings is a modal/drawer, we'd want reactivity. For now, we can use a simpler approach: read from the DOM data attribute that `applyBubbleStyle()` sets.

Add a `useEffect` that watches for `data-bubble-style` attribute changes:

```typescript
// Sync bubbleStyle from DOM attribute (set by useChatTheme hook)
useEffect(() => {
  const observer = new MutationObserver(() => {
    const style = document.documentElement.dataset.bubbleStyle as BubbleStyle | undefined
    if (style) setBubbleStyle(style)
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bubble-style"] })
  // Also read initial value
  const initial = document.documentElement.dataset.bubbleStyle as BubbleStyle | undefined
  if (initial) setBubbleStyle(initial)
  return () => observer.disconnect()
}, [])
```

Remove the bubbleStyle loading from the settings fetch `useEffect` (from Task 3 Step 3) since the MutationObserver handles it now. This also means the `ThemeInitializer` sets the data attribute on load, and the MutationObserver picks it up.

**Step 2: Run lint**

Run: `npx eslint src/components/chat/chat-panel.tsx`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/chat/chat-panel.tsx
git commit -m "feat: sync bubbleStyle reactively via DOM attribute observer"
```

---

## Task 7: Final Polish and Visual Verification

**Files:**
- Possibly modify: `src/components/chat/chat-message.tsx`, `src/app/globals.css`

**Step 1: Run full lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings).

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 3: Full visual verification**

Open http://localhost:3000 and verify:

1. **Flat style** (default): Messages look like before — subtle user tint, no bubbles
2. **Minimal style**: Both roles have rounded bubble backgrounds with theme colors
3. **Full style**: User messages right-aligned, assistant left-aligned, max-width 80%, asymmetric corners
4. **Font switching**: Changing font in settings updates message text immediately on next page load
5. **Text color**: Global text color applies to both roles; per-role overrides work
6. **Presets**: Selecting a preset resets textColor appropriately
7. **Wallpaper mode**: All three bubble styles look good over a background image
8. **Mobile**: Verify on narrow viewport (DevTools responsive mode)

**Step 4: Fix any visual issues found**

Address spacing, padding, or color issues for each bubble style. Common things to check:
- `full` style: Ensure markdown content (code blocks, lists) doesn't overflow the 80% max-width
- `minimal` style: Ensure spacing between messages looks good (may need `space-y-2` instead of `space-y-1`)
- Font: Ensure selected font cascades into markdown-rendered content (prose plugin might need override)

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: chat appearance customization — fonts, bubble styles, text color"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Extend theme types and hook state | `use-chat-theme.ts` |
| 2 | Update ThemeInitializer for new settings | `theme-initializer.tsx`, `globals.css` |
| 3 | ChatMessage bubble style rendering | `chat-message.tsx`, `message-list.tsx`, `chat-panel.tsx` |
| 4 | Settings UI — bubble style selector + textColor | `chat-theme-picker.tsx` |
| 5 | Settings UI — font selector | `chat-theme-picker.tsx` |
| 6 | Reactive bubbleStyle sync via DOM observer | `chat-panel.tsx` |
| 7 | Polish and visual verification | Various |

**Total: 7 tasks**
