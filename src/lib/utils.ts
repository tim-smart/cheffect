import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Fraction from "fraction.js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const FRACTION_SIMPLIFICATION_TOLERANCE = 0.01

export const quantityFormatter = {
  format(value: number): string {
    // Create a fraction with simplification tolerance
    const fraction = new Fraction(value).simplify(FRACTION_SIMPLIFICATION_TOLERANCE)
    
    // Convert BigInt to number for comparisons
    const numerator = Number(fraction.n)
    const denominator = Number(fraction.d)
    
    // If it's a whole number, just return it
    if (denominator === 1) {
      return numerator.toString()
    }
    
    // If we have a mixed number (numerator >= denominator)
    if (Math.abs(numerator) >= denominator) {
      const whole = Math.trunc(numerator / denominator)
      const remainder = Math.abs(numerator % denominator)
      
      if (remainder === 0) {
        return whole.toString()
      }
      
      return `${whole} ${remainder}/${denominator}`
    }
    
    // Otherwise just show the fraction
    return `${numerator}/${denominator}`
  }
}
