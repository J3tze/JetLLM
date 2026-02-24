"use client"

import { useAccentColor } from "@/hooks/use-accent-color"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function AccentColorPicker() {
  const { accent, setAccent, presets } = useAccentColor()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Accent Color</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {presets.map(preset => (
            <button
              key={preset.name}
              className={cn(
                "w-10 h-10 rounded-full border-2 transition-all",
                accent.name === preset.name
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105"
              )}
              style={{ backgroundColor: preset.hex }}
              title={preset.name}
              onClick={() => setAccent(preset)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
