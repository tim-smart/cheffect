import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { activeTimersAtom, dismissTimerAtom, toggleTimerAtom } from "./atoms"
import { nowAtom } from "@/atoms"
import { Timer } from "@/domain/Timer"

export function TimerList() {
  useAtomValue(activeTimersAtom)

  // TODO: implement timer list UI
  return null
}

export function TimerCircle({ timer }: { timer: Timer }) {
  const now = useAtomValue(nowAtom)
  timer.remainingAt(now)

  const dismiss = useAtomSet(dismissTimerAtom)
  const toggle = useAtomSet(toggleTimerAtom)
  void dismiss
  void toggle

  return null
}
