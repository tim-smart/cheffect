import { test } from "node:test"
import * as assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  findRecipeJsonLd,
  pageText,
  pageTextLimit,
} from "@/Recipes/extractFromHtml"

// A URL import reads the page's schema.org Recipe JSON-LD when it has one and
// falls back to the visible page text otherwise.

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/recipes/${name}`, import.meta.url), "utf8")

const page = (head: string, body = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

const ldJson = (value: unknown) =>
  `<script type="application/ld+json">${typeof value === "string" ? value : JSON.stringify(value)}</script>`

test("real pages give their recipe as compact JSON-LD", () => {
  const bbc = findRecipeJsonLd(
    fixture("bbcgoodfood.html"),
    "https://www.bbcgoodfood.com/recipes/easy-chicken-curry",
  )
  assert.equal(bbc?.name, "Easy chicken curry")
  assert.equal(bbc?.recipeYield, "4")
  assert.equal(bbc?.prepTime, "PT5M")
  assert.equal(bbc?.ingredients.length, 11)
  assert.equal(bbc?.ingredients[0], "2 tbsp sunflower oil")
  assert.equal(bbc?.instructions.length, 4)
  assert.equal(
    bbc?.image,
    "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/easy-chicken-curry-aa22a0b.jpg?resize=440,400",
  )
  assert.equal(bbc?.siteName, "Good Food")

  // Plain string instructions and a yield given as ["36", "36 cookies"].
  const kingArthur = findRecipeJsonLd(
    fixture("kingarthurbaking.html"),
    "https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe",
  )
  assert.equal(kingArthur?.recipeYield, "36 cookies")
  assert.equal(kingArthur?.ingredients.length, 12)
  assert.equal(kingArthur?.instructions.length, 9)
  assert.equal(kingArthur?.instructions[3], "Mix in the flour, then the chips.")
})

test("JSON-LD is found past broken blocks, inside @graph, and normalised", () => {
  const html = page(
    [
      ldJson('{"@type": "Recipe", "name": "broken",}'),
      ldJson({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", "@id": "https://example.com/stew" },
          { "@type": "Recipe", name: "Some other recipe" },
          {
            "@type": ["Recipe", "NewsArticle"],
            name: "Mac &amp; cheese",
            mainEntityOfPage: { "@id": "https://example.com/stew/" },
            image: [{ "@type": "ImageObject", url: "/img/mac.jpg" }],
            publisher: { "@type": "Organization", name: "Example Kitchen" },
            recipeYield: 6,
            recipeIngredient: ["200g macaroni", "1 cup <b>cheddar</b>"],
            recipeInstructions: [
              {
                "@type": "HowToSection",
                name: "Sauce",
                itemListElement: [
                  { "@type": "HowToStep", text: "Melt the butter." },
                  { "@type": "HowToStep", text: "Whisk in milk &amp; flour." },
                ],
              },
              { "@type": "HowToStep", text: "Bake for 20 minutes." },
            ],
            nutrition: { "@type": "NutritionInformation", calories: "500" },
          },
        ],
      }),
    ].join(""),
  )

  assert.deepEqual(findRecipeJsonLd(html, "https://example.com/stew"), {
    name: "Mac & cheese",
    description: null,
    recipeYield: "6",
    prepTime: null,
    cookTime: null,
    ingredients: ["200g macaroni", "1 cup cheddar"],
    instructions: [
      "Sauce:",
      "Melt the butter.",
      "Whisk in milk & flour.",
      "Bake for 20 minutes.",
    ],
    image: "https://example.com/img/mac.jpg",
    siteName: "Example Kitchen",
  })
})

test("several recipes with no match for the page give the first", () => {
  const html = page(
    ldJson([
      { "@type": "Recipe", name: "First", image: "https://cdn.test/a.jpg" },
      { "@type": "Recipe", name: "Second" },
    ]),
  )
  const recipe = findRecipeJsonLd(html, "https://example.com/roundup")
  assert.equal(recipe?.name, "First")
  assert.equal(recipe?.image, "https://cdn.test/a.jpg")
  assert.equal(findRecipeJsonLd(page(""), "https://example.com/"), null)
})

test("page text keeps visible content, one block per line, capped", () => {
  const html = page(
    `<title>Stew | Example</title><meta property="og:image" content="/stew.jpg">`,
    `<header>Site name</header><nav>Home</nav>
     <script>var x = 1</script><style>p{}</style>
     <main><h1>Beef stew</h1><ul><li>500g beef</li><li>2 carrots</li></ul>
     <p>Brown the beef.<br>Add the carrots.</p></main>
     <aside>Popular now</aside><footer>Copyright</footer>`,
  )
  assert.deepEqual(pageText(html, "https://example.com/recipes/stew"), {
    title: "Stew | Example",
    image: "https://example.com/stew.jpg",
    text: "Beef stew\n500g beef\n2 carrots\nBrown the beef.\nAdd the carrots.",
  })

  const long = pageText(
    page("", `<p>${"a".repeat(pageTextLimit * 2)}</p>`),
    "https://example.com/",
  )
  assert.equal(long.text.length, pageTextLimit)
})
