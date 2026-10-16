import type * as EventJournal from "effect/eventlog/EventJournal"

// Field-level last-writer-wins. Each row keeps a hidden `_lww` map from field
// to the id string of the entry that last wrote it. Entry ids are UUID v7, so
// the string order is the entry-time order with the random tail as the
// tiebreak, and every device agrees on it.

export interface LwwFields {
  readonly _lww: Readonly<Record<string, string>>
}

export interface Tombstoned {
  readonly deleted: 0 | 1
}

type Fields<Row> = Omit<Row, "_lww">

const isNewer = (entry: EventJournal.Entry, stamp: string | undefined) =>
  stamp === undefined || entry.idString > stamp

// A create: every field is stamped with the entry.
export const stampAll = <Row extends object>(
  fields: Row,
  entry: EventJournal.Entry,
): Row & LwwFields => {
  const _lww: Record<string, string> = {}
  for (const key of Object.keys(fields)) {
    _lww[key] = entry.idString
  }
  return { ...fields, _lww }
}

// An update: a field changes only if this entry is newer than the one that
// last wrote it. Undefined patch fields are left alone.
export const applyLww = <Row extends LwwFields>(
  row: Row,
  patch: Partial<Fields<Row>>,
  entry: EventJournal.Entry,
): Row => {
  let next: Row | undefined
  const _lww: Record<string, string> = { ...row._lww }
  for (const key of Object.keys(patch) as Array<keyof Fields<Row> & string>) {
    const value = patch[key]
    if (value === undefined || !isNewer(entry, _lww[key])) continue
    next ??= { ...row }
    ;(next as any)[key] = value
    _lww[key] = entry.idString
  }
  return next === undefined ? row : { ...next, _lww }
}

// A set on a reusable key: inserts a live row, or merges into the existing one
// (tombstoned or not) under last-writer-wins.
export const lwwSet = <Row extends LwwFields & Tombstoned>(
  existing: Row | undefined,
  fields: Omit<Fields<Row>, "deleted">,
  entry: EventJournal.Entry,
): Row =>
  existing === undefined
    ? (stampAll({ ...fields, deleted: 0 }, entry) as unknown as Row)
    : applyLww(
        existing,
        { ...fields, deleted: 0 } as unknown as Partial<Fields<Row>>,
        entry,
      )

// A remove on a reusable key keeps the row as a tombstone. When the row is
// missing (the remove arrived first) the tombstone is still written, so an
// older set can't bring it back. `fields` fill the row in that case only, and
// stay unstamped, so an older set still fills them in the same way it would
// have had it arrived first.
export const lwwRemove = <Row extends LwwFields & Tombstoned>(
  existing: Row | undefined,
  fields: Omit<Fields<Row>, "deleted">,
  entry: EventJournal.Entry,
): Row =>
  existing === undefined
    ? ({
        ...fields,
        deleted: 1,
        _lww: { deleted: entry.idString },
      } as unknown as Row)
    : applyLww(existing, { deleted: 1 } as Partial<Fields<Row>>, entry)

export const isLive = (row: Tombstoned): boolean => row.deleted === 0

export const stripLww = <Row extends LwwFields>(row: Row): Fields<Row> => {
  const { _lww, ...fields } = row
  return fields
}
