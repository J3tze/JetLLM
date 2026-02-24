"use client"

import { AccentColorPicker } from "@/components/settings/accent-color-picker"
import { ProviderSettings } from "@/components/settings/provider-settings"

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <AccentColorPicker />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">LLM Providers</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure API keys for the LLM providers you want to use.
        </p>
        <ProviderSettings />
      </section>
    </div>
  )
}
