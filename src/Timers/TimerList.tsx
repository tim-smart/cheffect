import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  addTimerDurationAtom,
  dismissTimerAtom,
  TimerUiState,
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

export function TimerCircle({
  timerState,
}: {
  readonly timerState: TimerUiState
}) {
  const { timer, status, progress } = timerState
  const dismiss = useAtomSet(dismissTimerAtom)
  const toggle = useAtomSet(toggleTimerAtom)
  const addDuration = useAtomSet(addTimerDurationAtom)

  const ariaLabel = `Open timer menu for ${timer.label}`

  const ringRadius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * ringRadius
  const dashOffset = circumference * (1 - progress)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            status._tag === "Completed" ? "text-foreground" : "text-primary",
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
                "transition-[stroke-dashoffset] duration-200 ease-linear",
                status._tag === "Completed"
                  ? "animate-timer-pulse stroke-red-500"
                  : "stroke-primary",
              )}
            />
          </svg>
          <span className="relative z-10 text-sm font-semibold">
            {status._tag === "Completed"
              ? "Done"
              : formatRemaining(status.remaining)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-52">
        <DropdownMenuLabel className="text-xs">
          <span className="block text-sm font-semibold text-foreground">
            {timer.label}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault()
            addDuration({ timer, duration: Duration.minutes(1) })
          }}
        >
          <Plus />
          Add 1 minute
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault()
            addDuration({ timer, duration: Duration.minutes(5) })
          }}
        >
          <Plus />
          Add 5 minutes
        </DropdownMenuItem>
        {status._tag !== "Completed" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toggle(timer)}>
              {status._tag === "Paused" ? <Play /> : <Pause />}
              {status._tag === "Paused" ? "Resume" : "Pause"}
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
