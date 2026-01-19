import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { dismissTimerAtom, timerUiStateAtom, toggleTimerAtom } from "./atoms"
import * as Duration from "effect/Duration"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Timer } from "@/domain/Timer"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_TIMERS = 4
const RING_SIZE = 44
const RING_STROKE = 5

export function TimerList() {
  const timers = useAtomValue(timerUiStateAtom)

  if (timers.length === 0) return null

  const visibleTimers = timers.slice(0, MAX_VISIBLE_TIMERS)
  const hiddenCount = Math.max(0, timers.length - visibleTimers.length)

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {visibleTimers.map((timerState) => (
          <TimerCircle key={timerState.timer.id} timerState={timerState} />
        ))}
        {hiddenCount > 0 ? (
          <div className="flex h-10 min-w-10 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground shadow-lg ring-1 ring-border">
            +{hiddenCount}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
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

  const remainingLabel = formatRemaining(remaining)
  const ariaLabel =
    status === "completed"
      ? `Dismiss timer ${label}`
      : status === "paused"
        ? `Resume timer ${label}`
        : `Pause timer ${label}`

  const ringRadius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * ringRadius
  const progressValue = status === "completed" ? 1 : progress
  const dashOffset = circumference * (1 - progressValue)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            status === "completed" ? "text-foreground" : "text-primary",
          )}
          onClick={() => {
            if (status === "completed") {
              dismiss(timer.id)
              return
            }
            toggle(timer)
          }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            className="absolute inset-0"
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
          <span className="relative z-10 text-[10px] font-semibold">
            {status === "completed" ? "Done" : remainingLabel}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[220px]">
        <div className="text-left">
          <div className="text-xs font-semibold text-primary-foreground">
            {label}
          </div>
          <div className="text-[11px] text-primary-foreground/80">
            {status === "completed" ? "Completed" : remainingLabel}
            {status === "paused" ? " • Paused" : ""}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
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
