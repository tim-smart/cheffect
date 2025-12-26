import { cn } from "@/lib/utils"
import { ChefHat } from "lucide-react"

export function Placeholder({ className }: { className?: string }) {
  return (
    <div className={cn("bg-border w-full h-full p-[15%]", className)}>
      <ChefHat className="w-full h-full opacity-20" />
    </div>
  )
}
