import { Duration } from "effect"
import {
  ExtractedRecipe,
  Ingredient,
  IngredientsComponent,
  Step,
} from "@/domain/Recipe"

const ingredients = (items: ReadonlyArray<Ingredient>) =>
  new IngredientsComponent({
    name: "Ingredients",
    ingredients: items,
  })

const steps = (items: ReadonlyArray<string>) =>
  items.map((text) => new Step({ text, tips: [] }))

export const seedRecipes: ReadonlyArray<ExtractedRecipe> = [
  new ExtractedRecipe({
    title: "Lemon Herb Chicken",
    imageUrl:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    prepTime: Duration.minutes(15),
    cookingTime: Duration.minutes(25),
    servings: 4,
    ingredients: [
      ingredients([
        new Ingredient({ name: "Chicken thighs", quantity: 1.5, unit: "lb" }),
        new Ingredient({ name: "Lemon", quantity: 1, unit: null }),
        new Ingredient({ name: "Olive oil", quantity: 2, unit: "tbsp" }),
        new Ingredient({ name: "Garlic cloves", quantity: 3, unit: null }),
        new Ingredient({ name: "Fresh thyme", quantity: 1, unit: "tbsp" }),
        new Ingredient({ name: "Sea salt", quantity: 0.5, unit: "tsp" }),
      ]),
    ],
    steps: steps([
      "Pat the chicken dry and toss with olive oil, lemon zest, and thyme.",
      "Arrange in a baking dish and roast for 25 min until golden.",
      "Rest for 5 min before serving with the pan juices.",
    ]),
    sourceName: "Cheffect Test Kitchen",
  }),
  new ExtractedRecipe({
    title: "Weeknight Veggie Stir Fry",
    imageUrl:
      "https://images.unsplash.com/photo-1546069901-eacef0df6022?auto=format&fit=crop&w=1200&q=80",
    prepTime: Duration.minutes(10),
    cookingTime: Duration.minutes(12),
    servings: 3,
    ingredients: [
      ingredients([
        new Ingredient({ name: "Broccoli florets", quantity: 2, unit: "cup" }),
        new Ingredient({ name: "Bell pepper", quantity: 1, unit: null }),
        new Ingredient({ name: "Snow peas", quantity: 1, unit: "cup" }),
        new Ingredient({ name: "Soy sauce", quantity: 2, unit: "tbsp" }),
        new Ingredient({ name: "Sesame oil", quantity: 1, unit: "tbsp" }),
        new Ingredient({ name: "Ginger", quantity: 1, unit: "tsp" }),
      ]),
    ],
    steps: steps([
      "Heat a wok over high heat and add sesame oil.",
      "Stir-fry the vegetables for 8 min until crisp-tender.",
      "Finish with soy sauce and grated ginger before serving.",
    ]),
    sourceName: "Cheffect Test Kitchen",
  }),
  new ExtractedRecipe({
    title: "Tomato Basil Pasta",
    imageUrl:
      "https://images.unsplash.com/photo-1521389508051-d7ffb5dc8b41?auto=format&fit=crop&w=1200&q=80",
    prepTime: Duration.minutes(8),
    cookingTime: Duration.minutes(18),
    servings: 2,
    ingredients: [
      ingredients([
        new Ingredient({ name: "Spaghetti", quantity: 8, unit: "oz" }),
        new Ingredient({ name: "Cherry tomatoes", quantity: 2, unit: "cup" }),
        new Ingredient({ name: "Basil leaves", quantity: 0.25, unit: "cup" }),
        new Ingredient({ name: "Parmesan", quantity: 0.25, unit: "cup" }),
        new Ingredient({ name: "Olive oil", quantity: 2, unit: "tbsp" }),
      ]),
    ],
    steps: steps([
      "Boil pasta in salted water until al dente.",
      "Simmer tomatoes with olive oil for 12 min until saucy.",
      "Toss pasta with basil and Parmesan before serving.",
    ]),
    sourceName: "Cheffect Test Kitchen",
  }),
  new ExtractedRecipe({
    title: "Blueberry Pancakes",
    imageUrl:
      "https://images.unsplash.com/photo-1495214783159-3503fd1b572d?auto=format&fit=crop&w=1200&q=80",
    prepTime: Duration.minutes(12),
    cookingTime: Duration.minutes(10),
    servings: 4,
    ingredients: [
      ingredients([
        new Ingredient({
          name: "All-purpose flour",
          quantity: 1.5,
          unit: "cup",
        }),
        new Ingredient({ name: "Baking powder", quantity: 2, unit: "tsp" }),
        new Ingredient({ name: "Milk", quantity: 1.25, unit: "cup" }),
        new Ingredient({ name: "Egg", quantity: 1, unit: null }),
        new Ingredient({ name: "Blueberries", quantity: 1, unit: "cup" }),
        new Ingredient({ name: "Maple syrup", quantity: 0.25, unit: "cup" }),
      ]),
    ],
    steps: steps([
      "Whisk the batter until just combined, then fold in blueberries.",
      "Pour onto a hot griddle and cook for 2 min per side.",
      "Serve warm with maple syrup.",
    ]),
    sourceName: "Cheffect Test Kitchen",
  }),
]
