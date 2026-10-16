import { RecipeExtractJob } from "@/domain/RecipeExtractJob"
import * as IndexedDbTable from "@effect/platform-browser/IndexedDbTable"

// Local-only, written straight through the query builder rather than the
// EventLog. Writers invalidate the `recipeExtractJobs` reactivity key by hand.
export class RecipeExtractJobsTable extends IndexedDbTable.make({
  name: "recipeExtractJobs",
  schema: RecipeExtractJob,
  keyPath: "id",
}) {}
