import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { Button } from "../../ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select"
import { Switch } from "../../ui/switch"

export function AgentsWSLTab() {
  const { data: status, refetch } = trpc.wsl.status.useQuery(undefined, {
    refetchInterval: 10000,
  })

  const [selectedDistro, setSelectedDistro] = useState<string>("")
  const [message, setMessage] = useState<string | null>(null)

  // Sync selected distro from saved settings
  useEffect(() => {
    if (status?.settings.distro && !selectedDistro) {
      setSelectedDistro(status.settings.distro)
    }
  }, [status?.settings.distro, selectedDistro])

  const enableMutation = trpc.wsl.enable.useMutation({
    onSuccess: (data) => {
      refetch()
      setMessage(data.success ? data.message ?? "Enabled" : data.error ?? "Failed")
    },
  })

  const disableMutation = trpc.wsl.disable.useMutation({
    onSuccess: (data) => {
      refetch()
      setMessage(data.success ? data.message ?? "Disabled" : data.error ?? "Failed")
    },
  })

  const reinstallMutation = trpc.wsl.reinstall.useMutation({
    onSuccess: (data) => {
      refetch()
      setMessage(data.success ? "Server reinstalled successfully" : data.error ?? "Failed")
    },
  })

  const isEnabled = status?.settings.enabled ?? false
  const isAvailable = status?.available ?? false

  const handleToggle = (checked: boolean) => {
    setMessage(null)
    if (checked) {
      const distro = selectedDistro || status?.distros?.[0]
      if (distro) {
        enableMutation.mutate({ distro })
      }
    } else {
      disableMutation.mutate()
    }
  }

  if (!isAvailable) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">WSL Mode</h3>
          <p className="text-xs text-muted-foreground">
            Run the backend inside Windows Subsystem for Linux for native file
            and terminal access.
          </p>
        </div>
        <div className="bg-background rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            WSL is not available on this system. Install WSL from the Microsoft
            Store or run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
              wsl --install
            </code>{" "}
            in an elevated terminal.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <h3 className="text-sm font-semibold text-foreground">WSL Mode</h3>
        <p className="text-xs text-muted-foreground">
          Run the backend inside Windows Subsystem for Linux for native file and
          terminal access.
        </p>
      </div>

      {/* Enable/Disable + Distro Selection */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Enable WSL Mode
            </span>
            <span className="text-xs text-muted-foreground">
              Route all backend operations through WSL. Requires app restart.
            </span>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={enableMutation.isPending || disableMutation.isPending}
          />
        </div>

        {/* Distro selector */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-foreground">
              Distribution
            </span>
            <span className="text-xs text-muted-foreground">
              Select which WSL distribution to use.
            </span>
          </div>
          <Select
            value={selectedDistro || status?.distros?.[0] || ""}
            onValueChange={setSelectedDistro}
          >
            <SelectTrigger className="w-auto shrink-0">
              <SelectValue placeholder="Select distro" />
            </SelectTrigger>
            <SelectContent>
              {(status?.distros ?? []).map((distro: string) => (
                <SelectItem key={distro} value={distro}>
                  {distro}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Server Status */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Server Status</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Server running status */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  Server
                </span>
                <p className="text-xs text-muted-foreground">
                  {status?.serverRunning
                    ? "WSL server is running"
                    : "WSL server is not running"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {status?.serverRunning ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-emerald-500">Running</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground">
                      Stopped
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Node.js installed */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  Node.js
                </span>
                <p className="text-xs text-muted-foreground">
                  {status?.nodeInstalled
                    ? "Node.js is installed in the selected distribution"
                    : "Node.js is required in the WSL distribution"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {status?.nodeInstalled ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-emerald-500">Installed</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-sm text-amber-500">Missing</span>
                  </>
                )}
              </div>
            </div>

            {/* Server files installed */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  Server Files
                </span>
                <p className="text-xs text-muted-foreground">
                  {status?.serverInstalled
                    ? "Server bundle is installed in WSL"
                    : "Server bundle not yet installed"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {status?.serverInstalled ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-emerald-500">Installed</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground">
                      Not installed
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Reinstall button */}
            {isEnabled && (
              <div className="pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reinstallMutation.mutate()}
                  disabled={reinstallMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 mr-2",
                      reinstallMutation.isPending && "animate-spin"
                    )}
                  />
                  {reinstallMutation.isPending
                    ? "Reinstalling..."
                    : "Reinstall Server"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
          {message}
        </div>
      )}
    </div>
  )
}
