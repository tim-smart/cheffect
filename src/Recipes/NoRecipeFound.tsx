export function NoRecipeFound() {
  return (
    <div className="p-4 text-center text-gray-600">
      <h2 className="text-xl font-semibold mb-2">Recipe Not Found</h2>
      <p className="text-sm">
        The recipe you are looking for does not exist or has been removed.
      </p>
    </div>
  )
}
