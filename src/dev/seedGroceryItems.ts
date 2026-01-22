import { GroceryAisle } from "@/domain/GroceryItem"

export type SeedGroceryItem = {
  name: string
  quantity: string | null
  aisle: GroceryAisle | null
}

export const seedGroceryItems: ReadonlyArray<SeedGroceryItem> = [
  { name: "Chicken thighs", quantity: "1.5 lb", aisle: "Meat & Seafood" },
  { name: "Lemon", quantity: "2", aisle: "Produce" },
  { name: "Garlic", quantity: "1 bulb", aisle: "Produce" },
  { name: "Olive oil", quantity: "1 bottle", aisle: "Pantry" },
  { name: "Soy sauce", quantity: "1 bottle", aisle: "Pantry" },
  { name: "Milk", quantity: "1 carton", aisle: "Dairy & Eggs" },
  { name: "Eggs", quantity: "1 dozen", aisle: "Dairy & Eggs" },
  { name: "Blueberries", quantity: "1 pint", aisle: "Produce" },
  { name: "Maple syrup", quantity: "1 bottle", aisle: "Breakfast" },
  { name: "Parmesan", quantity: "4 oz", aisle: "Dairy & Eggs" },
]
