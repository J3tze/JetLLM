"use client"

import { useCallback } from "react"
import { useAccentColor, type AccentPreset } from "@/hooks/use-accent-color"
import { useChatTheme, USER_BUBBLE_ACCENT } from "@/hooks/use-chat-theme"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccentColorPicker } from "@/components/settings/accent-color-picker"
import { ChatThemePicker } from "@/components/settings/chat-theme-picker"
import { ProviderSettings } from "@/components/settings/provider-settings"
import { MemorySettings } from "@/components/settings/memory-settings"
import { MemoryList } from "@/components/settings/memory-list"
import { RagSettings } from "@/components/settings/rag-settings"
import { ChatSettings } from "@/components/settings/chat-settings"
import { Palette, Key, Brain } from "lucide-react"

export default function SettingsPage() {
  const accentState = useAccentColor()
  const chatThemeState = useChatTheme()

  const handleAccentChange = useCallback((preset: AccentPreset) => {
    accentState.setAccent(preset)
    if (chatThemeState.colors.userBubble !== USER_BUBBLE_ACCENT) {
      chatThemeState.setCustomColor("userBubble", USER_BUBBLE_ACCENT)
    }
  }, [accentState, chatThemeState])

  return (
    <Tabs defaultValue="general" className="space-y-6">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="general" className="gap-1.5">
          <Palette className="h-3.5 w-3.5" />
          General
        </TabsTrigger>
        <TabsTrigger value="providers" className="gap-1.5">
          <Key className="h-3.5 w-3.5" />
          Providers
        </TabsTrigger>
        <TabsTrigger value="memory" className="gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          Memory
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-6">
        <ChatSettings />
        <AccentColorPicker accent={accentState.accent} setAccent={handleAccentChange} presets={accentState.presets} />
        <ChatThemePicker accentHex={accentState.accent.hex} chatThemeState={chatThemeState} />
      </TabsContent>

      <TabsContent value="providers" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">LLM Providers</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure API keys for the LLM providers you want to use.
          </p>
        </div>
        <ProviderSettings />
      </TabsContent>

      <TabsContent value="memory" className="space-y-4">
        <MemorySettings />
        <RagSettings />
        <MemoryList />
      </TabsContent>
    </Tabs>
  )
}
