import { Recipe, recipeToHtmlFile, recipeToYamlFile } from "@/domain/Recipe"

const downloadFile = (file: File) => {
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const shareOrDownloadFile = (file: File, title: string) => {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    void navigator.share({ files: [file], title }).catch(() => {})
    return
  }

  downloadFile(file)
}

export const exportRecipeAsHtml = (recipe: Recipe) => {
  shareOrDownloadFile(recipeToHtmlFile(recipe), recipe.title)
}

export const exportRecipeAsYaml = (recipe: Recipe) => {
  shareOrDownloadFile(recipeToYamlFile(recipe), recipe.title)
}
