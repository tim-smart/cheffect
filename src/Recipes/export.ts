import { Recipe, recipeToHtmlFile, recipeToPaprikaFile } from "@/domain/Recipe"

const shareOrDownloadFile = (file: File, title: string) => {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    void navigator.share({ files: [file], title }).catch(() => {})
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

export const exportRecipeAsHtml = (recipe: Recipe) => {
  shareOrDownloadFile(recipeToHtmlFile(recipe), recipe.title)
}

export const exportRecipeAsPaprika = (recipe: Recipe) => {
  shareOrDownloadFile(recipeToPaprikaFile(recipe), recipe.title)
}
