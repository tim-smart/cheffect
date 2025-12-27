import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Fraction from "fraction.js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const FRACTION_SIMPLIFICATION_TOLERANCE = 0.01

export const quantityFormatter = {
  format(value: number): string {
    // Create a fraction with simplification tolerance and convert to mixed fraction
    return new Fraction(value).simplify(FRACTION_SIMPLIFICATION_TOLERANCE).toFraction(true)
  }
}
