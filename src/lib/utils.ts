import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export { quantityFormatter } from "./quantity"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
