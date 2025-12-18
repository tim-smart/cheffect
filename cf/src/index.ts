import { makeDurableObject, makeWorker } from "@livestore/sync-cf/cf-worker"

export class SyncBackendDO extends makeDurableObject({
  onPush: async (message, { storeId }) => {
    // Log all sync events
    console.log(`Store ${storeId} received ${message.batch.length} events`)
  },
}) {}

export default makeWorker({
  syncBackendBinding: "SYNC_BACKEND_DO",
  enableCORS: true,
})
