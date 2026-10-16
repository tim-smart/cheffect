import { useAtomValue } from "@effect/atom-react"
import { databaseBlockedAtom } from "@/IndexedDb"

// Shown while another Cheffect tab holds the database open on an older
// version, which blocks this tab's upgrade. Clears itself once the other tabs
// close and the upgrade goes through.
export function DatabaseBlockedScreen() {
  const blocked = useAtomValue(databaseBlockedAtom)
  if (!blocked) return null
  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">
        Close other Cheffect tabs to finish updating
      </h1>
      <p className="text-muted-foreground max-w-sm">
        This tab is waiting for the others to close. It will carry on by itself
        once they have.
      </p>
    </div>
  )
}
