"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Settings2 } from "lucide-react"

type ParameterPopoverProps = {
  temperature: number
  maxTokens: number
  topP: number
  onTemperatureChange: (value: number) => void
  onMaxTokensChange: (value: number) => void
  onTopPChange: (value: number) => void
}

export function ParameterPopover({
  temperature,
  maxTokens,
  topP,
  onTemperatureChange,
  onMaxTokensChange,
  onTopPChange,
}: ParameterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Temperature</Label>
              <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => onTemperatureChange(v)}
              min={0}
              max={2}
              step={0.1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Max Tokens</Label>
              <span className="text-xs text-muted-foreground">{maxTokens}</span>
            </div>
            <Slider
              value={[maxTokens]}
              onValueChange={([v]) => onMaxTokensChange(v)}
              min={256}
              max={16384}
              step={256}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">Top P</Label>
              <span className="text-xs text-muted-foreground">{topP.toFixed(2)}</span>
            </div>
            <Slider
              value={[topP]}
              onValueChange={([v]) => onTopPChange(v)}
              min={0}
              max={1}
              step={0.05}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
