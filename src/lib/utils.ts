import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Fraction from "fraction.js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const quantityFormatter = {
  format(value: number): string {
    // Create a fraction with 0.01 simplification tolerance
    const fraction = new Fraction(value).simplify(0.01)
    
    // Convert BigInt to number for comparisons
    const numerator = Number(fraction.n)
    const denominator = Number(fraction.d)
    
    // If it's a whole number, just return it
    if (denominator === 1) {
      return numerator.toString()
    }
    
    // If we have a mixed number (numerator >= denominator)
    if (Math.abs(numerator) >= denominator) {
      const whole = Math.floor(Math.abs(numerator) / denominator) * Math.sign(numerator)
      const remainder = Math.abs(numerator) % denominator
      
      if (remainder === 0) {
        return whole.toString()
      }
      
      return `${whole} ${remainder}/${denominator}`
    }
    
    // Otherwise just show the fraction
    return `${numerator}/${denominator}`
  }
}
