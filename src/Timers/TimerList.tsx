import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { activeTimersAtom, dismissTimerAtom, toggleTimerAtom } from "./atoms"
import { nowAtom } from "@/atoms"
import { Timer } from "@/domain/Timer"

export function TimerList() {
  const timers = useAtomValue(activeTimersAtom)

  // TODO: implement timer list UI
  return null
}

function TimerCircle({ timer }: { timer: Timer }) {
  const now = useAtomValue(nowAtom)
  const remaining = timer.remainingAt(now)

  const dismiss = useAtomSet(dismissTimerAtom)
  const toggle = useAtomSet(toggleTimerAtom)

  return null
}
