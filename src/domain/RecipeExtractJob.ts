import * as Schema from "effect/Schema"
import * as Model from "effect/schema/Model"
import { UuidBytes, UuidFromString } from "@/lib/Id"

export const RecipeExtractJobId = UuidBytes("RecipeExtractJobId")
export type RecipeExtractJobId = typeof RecipeExtractJobId.Type
export const RecipeExtractJobIdFromString = UuidFromString(RecipeExtractJobId)

// A queued "extract a recipe from this URL" job. Local to the device: jobs
// never sync, because only the device that queued one should work on it.
export class RecipeExtractJob extends Model.Class<RecipeExtractJob>(
  "RecipeExtractJob",
)({
  id: Model.UuidV4BytesInsert(RecipeExtractJobId),
  url: Schema.String,
  completedAt: Schema.NullOr(Schema.DateTimeUtcFromMillis),
}) {}
