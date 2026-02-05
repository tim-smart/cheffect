import { Recipe, recipeToHtmlFile } from "@/domain/Recipe"

export const exportRecipeAsHtml = (recipe: Recipe) => {
  const file = recipeToHtmlFile(recipe)

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    void navigator.share({ files: [file], title: recipe.title }).catch(() => {})
    return
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
