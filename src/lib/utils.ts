import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Fraction from "fraction.js"
import { Unit } from "@/domain/Recipe"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const FRACTION_SIMPLIFICATION_TOLERANCE = 0.01

const formatter = new Intl.NumberFormat("en-US", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const quantityFormatter = {
  format(value: number, unit?: Unit | null): string {
    switch (unit) {
      case "cup":
      case "tsp":
      case "tbsp":
      case null: {
        return new Fraction(value)
          .simplify(FRACTION_SIMPLIFICATION_TOLERANCE)
          .toFraction(true)
      }
      default: {
        return formatter.format(value)
      }
    }
  },
}
