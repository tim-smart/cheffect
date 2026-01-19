import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  addTimerDurationAtom,
  dismissTimerAtom,
  timerUiStateAtom,
  toggleTimerAtom,
} from "./atoms"
import * as Duration from "effect/Duration"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Pause, Play, Plus, Trash2 } from "lucide-react"
import { Timer } from "@/domain/Timer"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_TIMERS = 4
const RING_SIZE = 56
const RING_STROKE = 5

export function TimerList() {
  const timers = useAtomValue(timerUiStateAtom)

  if (timers.length === 0) return null

  const visibleTimers = timers.slice(0, MAX_VISIBLE_TIMERS)
  const hiddenCount = Math.max(0, timers.length - visibleTimers.length)

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {visibleTimers.map((timerState) => (
        <TimerCircle key={timerState.timer.id} timerState={timerState} />
      ))}
      {hiddenCount > 0 ? (
        <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground shadow-lg ring-1 ring-border">
          +{hiddenCount}
        </div>
      ) : null}
    </div>
  )
}

type TimerUiState = {
  timer: Timer
  status: "running" | "paused" | "completed"
  remaining: Duration.Duration
  progress: number
  label: string
}

export function TimerCircle({
  timerState,
}: {
  readonly timerState: TimerUiState
}) {
  const { timer, status, progress, remaining, label } = timerState
  const dismiss = useAtomSet(dismissTimerAtom)
  const toggle = useAtomSet(toggleTimerAtom)
  const addDuration = useAtomSet(addTimerDurationAtom)

  const remainingLabel = formatRemaining(remaining)
  const ariaLabel = `Open timer menu for ${label}`

  const ringRadius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * ringRadius
  const progressValue = status === "completed" ? 1 : progress
  const dashOffset = circumference * (1 - progressValue)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            status === "completed" ? "text-foreground" : "text-primary",
          )}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="absolute inset-0 -rotate-90"
            role="presentation"
            aria-hidden="true"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={ringRadius}
              className="stroke-border"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={ringRadius}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn(
                "transition-[stroke-dashoffset] duration-700 ease-linear",
                status === "completed"
                  ? "stroke-muted-foreground"
                  : "stroke-primary",
              )}
            />
          </svg>
          <span className="relative z-10 text-xs font-semibold">
            {status === "completed" ? "Done" : remainingLabel}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-52">
        <DropdownMenuLabel className="text-xs">
          <span className="block text-sm font-semibold text-foreground">
            {label}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => addDuration({ timer, durationMs: 60_000 })}
        >
          <Plus />
          Add 1 minute
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => addDuration({ timer, durationMs: 300_000 })}
        >
          <Plus />
          Add 5 minutes
        </DropdownMenuItem>
        {status === "completed" ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toggle(timer)}>
              {status === "paused" ? <Play /> : <Pause />}
              {status === "paused" ? "Resume" : "Pause"}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => dismiss(timer.id)}
        >
          <Trash2 />
          Dismiss
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatRemaining(remaining: Duration.Duration) {
  const totalSeconds = Math.max(0, Math.round(Duration.toSeconds(remaining)))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) {
    return `${hours}h`
  }
  return `${hours}h${minutes}m`
}
