/**
 * Schema-driven forms on top of react-hook-form.
 *
 * Port of the parts of `@inato-form/*` that cheffect uses (`@inato-form` only
 * supports Effect 3). Components are bound to field kinds directly instead of
 * through an Effect Layer, and the behaviour of the old
 * `patches/@inato-form__react-hook-form.patch` is built in: initial values
 * become the form's default values, and `onSubmit` receives the form methods
 * as its second argument.
 */
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import React, { createContext, useContext, useMemo } from "react"
import * as RHF from "react-hook-form"

// -----------------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------------

type Token =
  | { readonly _tag: "String"; readonly value: string }
  | { readonly _tag: "Index" }

class Path {
  private constructor(private readonly tokens: ReadonlyArray<Token>) {}

  static empty = new Path([])

  get isEmpty() {
    return this.tokens.length === 0
  }

  appendString(value: string): Path {
    return new Path([...this.tokens, { _tag: "String", value }])
  }

  appendIndex(): Path {
    return new Path([...this.tokens, { _tag: "Index" }])
  }

  toString(indexes: ReadonlyArray<number>): string {
    let i = 0
    const parts: Array<string> = []
    for (const token of this.tokens) {
      if (token._tag === "String") {
        parts.push(token.value)
      } else {
        const index = indexes[i]
        if (index === undefined) {
          throw new Error(`Missing array index ${i} for form field`)
        }
        parts.push(String(index))
        i += 1
      }
    }
    return parts.join(".")
  }
}

const ArrayIndexesContext = createContext<ReadonlyArray<number>>([])

const ArrayIndexProvider: React.FC<{
  children: React.ReactNode
  index: number
}> = ({ children, index }) => {
  const indexes = useContext(ArrayIndexesContext)
  return (
    <ArrayIndexesContext.Provider value={[...indexes, index]}>
      {children}
    </ArrayIndexesContext.Provider>
  )
}

const usePath = (path: Path): string =>
  path.toString(useContext(ArrayIndexesContext))

const useIndex = (): number => {
  const indexes = useContext(ArrayIndexesContext)
  const index = indexes[indexes.length - 1]
  if (index === undefined) {
    throw new Error("useIndex() must be rendered under a <Fields> element")
  }
  return index
}

// -----------------------------------------------------------------------------
// Fields
// -----------------------------------------------------------------------------

const FieldTypeId: unique symbol = Symbol.for("cheffect/Form/Field")

/**
 * Props passed to an uncontrolled field component, in addition to the props
 * the form author passes in.
 */
export type UncontrolledProps = RHF.UseFormRegisterReturn & {
  readonly error?: string | undefined
}

/**
 * Props passed to a controlled field component, in addition to the props the
 * form author passes in.
 */
export type ControlledProps = RHF.ControllerRenderProps & {
  readonly error?: string | undefined
}

type Register<P> = (path: Path) => React.FC<P>

export interface Field<P extends object, S extends Schema.Top> {
  readonly [FieldTypeId]: typeof FieldTypeId
  readonly schema: S
  readonly defaultValue: Option.Option<S["Encoded"]>
  readonly register: Register<P>
}

const isField = (u: unknown): u is AnyField =>
  Predicate.hasProperty(u, FieldTypeId)

export type AnyField = Field<any, Schema.Top>

const requiredMessage = "This field is required"

export interface FieldKind<P extends object> {
  readonly make: <S extends Schema.Top>(options: {
    readonly schema: S
    readonly defaultValue: S["Encoded"]
  }) => Field<P, S>
  readonly makeRequired: <S extends Schema.Top>(options: {
    readonly schema: S
  }) => Field<P, S["Rebuild"]>
}

const makeKind = <P extends object>(register: Register<P>): FieldKind<P> => ({
  make: (options) => ({
    [FieldTypeId]: FieldTypeId,
    schema: options.schema,
    defaultValue: Option.some(options.defaultValue),
    register,
  }),
  makeRequired: (options) => ({
    [FieldTypeId]: FieldTypeId,
    schema: options.schema.annotate({ message: requiredMessage }),
    defaultValue: Option.none(),
    register,
  }),
})

/**
 * A field kind backed by `register` (native inputs).
 */
export const uncontrolled = <P extends object>(
  render: (props: P, field: UncontrolledProps) => React.ReactNode,
): FieldKind<P> =>
  makeKind<P>((path) => (props) => {
    const name = usePath(path)
    const { control, register, getFieldState } = RHF.useFormContext()
    // subscribe to errors for this field, otherwise getFieldState does not
    // re-render correctly
    RHF.useFormState({ control, name })
    const { error } = getFieldState(name)
    const registered = register(name)
    const extra: Partial<Pick<UncontrolledProps, "onChange" | "onBlur">> = props
    const overrides: Pick<UncontrolledProps, "onChange" | "onBlur" | "error"> =
      {
        onChange: (e) => {
          extra.onChange?.(e)
          return registered.onChange(e)
        },
        onBlur: (e) => {
          extra.onBlur?.(e)
          return registered.onBlur(e)
        },
        error: error?.message,
      }
    return render(props, { ...registered, ...overrides })
  })

/**
 * A field kind backed by `useController` (custom inputs).
 */
export const controlled = <P extends object>(
  render: (props: P, field: ControlledProps) => React.ReactNode,
): FieldKind<P> =>
  makeKind<P>((path) => (props) => {
    const name = usePath(path)
    const {
      field,
      fieldState: { error },
    } = RHF.useController({ name })
    return render(props, { ...field, error: error?.message })
  })

// -----------------------------------------------------------------------------
// Form body
// -----------------------------------------------------------------------------

const StructTypeId: unique symbol = Symbol.for("cheffect/Form/Struct")
const ArrayTypeId: unique symbol = Symbol.for("cheffect/Form/Array")

export type AnyNonIterable = AnyField | AnyStruct
export type AnyBodyField = AnyNonIterable | AnyArray
type Fields = Record<string, AnyBodyField>

type FieldSchema<F> = F extends { readonly schema: infer S extends Schema.Top }
  ? S
  : never

export interface FormStruct<F extends Fields> {
  readonly [StructTypeId]: typeof StructTypeId
  readonly fields: F
  readonly schema: Schema.Struct<{ [K in keyof F]: FieldSchema<F[K]> }>
  readonly defaultValue: Schema.Struct<{
    [K in keyof F]: FieldSchema<F[K]>
  }>["Encoded"]
}
type AnyStruct = FormStruct<Fields>

export interface FormArray<F extends AnyNonIterable> {
  readonly [ArrayTypeId]: typeof ArrayTypeId
  readonly field: F
  readonly schema: Schema.$Array<FieldSchema<F>>
  readonly defaultValue: ReadonlyArray<FieldSchema<F>["Encoded"]>
}
type AnyArray = FormArray<AnyNonIterable>

const isArray = (u: unknown): u is AnyArray =>
  Predicate.hasProperty(u, ArrayTypeId)

const defaultValueOf = (field: AnyBodyField): Option.Option<unknown> =>
  isField(field) ? field.defaultValue : Option.some(field.defaultValue)

export const FormBody = {
  struct: <F extends Fields>(fields: F): FormStruct<F> => {
    const schemaFields: Record<string, Schema.Top> = {}
    const defaultValue: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(fields)) {
      schemaFields[key] = field.schema
      const value = defaultValueOf(field)
      if (Option.isSome(value)) {
        defaultValue[key] = value.value
      }
    }
    const schema: FormStruct<F>["schema"] = Schema.Struct(
      schemaFields as {
        [K in keyof F]: FieldSchema<F[K]>
      },
    )
    return {
      [StructTypeId]: StructTypeId,
      fields,
      schema,
      defaultValue: defaultValue as FormStruct<F>["defaultValue"],
    }
  },
  array: <F extends AnyNonIterable>(field: F): FormArray<F> => ({
    [ArrayTypeId]: ArrayTypeId,
    field,
    schema: Schema.Array(field.schema as FieldSchema<F>),
    defaultValue: [],
  }),
}

// -----------------------------------------------------------------------------
// Display
// -----------------------------------------------------------------------------

export interface FieldControls<A> {
  readonly watch: () => A
  readonly reset: () => void
  readonly set: (value: A) => void
}

export interface ArrayControls<A> extends FieldControls<ReadonlyArray<A>> {
  readonly append: (value?: A) => void
  readonly useRemove: () => { readonly remove: () => void }
}

type WithChildren = React.FC<{ children?: React.ReactNode }>

export type FieldDisplay<F> =
  F extends Field<infer P, infer S>
    ? React.FC<P> & { readonly useControls: () => FieldControls<S["Encoded"]> }
    : F extends FormStruct<infer Fs>
      ? StructDisplay<Fs>
      : F extends {
            readonly [ArrayTypeId]: typeof ArrayTypeId
            readonly field: infer E
          }
        ? WithChildren & {
            readonly Fields: WithChildren
            readonly Element: FieldDisplay<E>
            readonly useControls: () => ArrayControls<FieldSchema<E>["Encoded"]>
          }
        : never

export type StructDisplay<F extends Fields> = {
  readonly [K in keyof F]: FieldDisplay<F[K]>
} & {
  readonly useControls: () => FieldControls<FormStruct<F>["schema"]["Encoded"]>
}

const makeFieldControls = (path: Path) => ({
  useControls: (): FieldControls<any> => {
    const name = usePath(path)
    const { reset, resetField, setValue, watch } = RHF.useFormContext()
    if (path.isEmpty) {
      return {
        reset: () => reset(),
        watch: () => watch(),
        set: () => {
          throw new Error("Cannot set the whole form values at once")
        },
      }
    }
    return {
      reset: () => resetField(name),
      watch: () => watch(name),
      set: (value) => setValue(name, value),
    }
  },
})

const makeArray = (defaultValue: unknown, path: Path) => {
  interface Controls extends ArrayControls<unknown> {
    readonly fields: ReadonlyArray<{ id: string }>
  }
  const ControlsContext = createContext<Controls | null>(null)
  const useControls = (): Controls => {
    const controls = useContext(ControlsContext)
    if (controls === null) {
      throw new Error("Array controls used outside of their form array")
    }
    return controls
  }
  const fieldControls = makeFieldControls(path)

  const Parent: WithChildren = ({ children }) => {
    const name = usePath(path)
    const { append, fields, remove } = RHF.useFieldArray({ name })
    const controls: Controls = {
      ...fieldControls.useControls(),
      fields,
      append: (value = defaultValue) => append(value),
      useRemove: () => {
        const index = useIndex()
        return { remove: () => remove(index) }
      },
    }
    return (
      <ControlsContext.Provider value={controls}>
        {children}
      </ControlsContext.Provider>
    )
  }

  const Fields: WithChildren = ({ children }) => {
    const { fields } = useControls()
    return fields.map((field, index) => (
      <ArrayIndexProvider key={field.id} index={index}>
        {children}
      </ArrayIndexProvider>
    ))
  }

  return Object.assign(Parent, { Fields, useControls })
}

const makeDisplay = (field: AnyBodyField, path: Path): unknown => {
  if (isField(field)) {
    return Object.assign(field.register(path), makeFieldControls(path))
  }
  if (isArray(field)) {
    const defaultValue = Option.getOrUndefined(defaultValueOf(field.field))
    return Object.assign(makeArray(defaultValue, path), {
      Element: makeDisplay(field.field, path.appendIndex()),
    })
  }
  const display: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(field.fields)) {
    display[key] = makeDisplay(value, path.appendString(key))
  }
  return Object.assign(display, makeFieldControls(path))
}

// -----------------------------------------------------------------------------
// Form
// -----------------------------------------------------------------------------

type FormSchema = Schema.Codec<unknown, RHF.FieldValues>

type Values<S extends FormSchema> =
  { readonly encoded: S["Encoded"] } | { readonly unknown: unknown }

export interface FormComponentProps<S extends FormSchema> {
  readonly children: React.ReactNode
  readonly onSubmit: (
    values: { readonly decoded: S["Type"]; readonly encoded: S["Encoded"] },
    form: RHF.UseFormReturn<RHF.FieldValues, unknown, S["Type"]>,
  ) => void | Promise<void>
  readonly onError?: (errors: RHF.FieldErrors) => void
  /**
   * The validation mode. Default: "onBlur"
   */
  readonly validationMode?: "onBlur" | "onSubmit" | "onChange"
  /**
   * Values to hydrate the form with, typically previously saved values.
   */
  readonly initialValues?: Values<S> | undefined
  /**
   * The starting point of an empty form.
   */
  readonly resetValues?: Values<S> | undefined
}

export interface FormComponent<S extends FormSchema> extends React.FC<
  FormComponentProps<S>
> {
  /**
   * The form element id, for submit buttons outside the form.
   */
  readonly id: string
}

const getValues =
  <S extends FormSchema>(schema: S) =>
  (
    values: Values<S> | undefined,
    defaultValues: S["Encoded"],
  ): S["Encoded"] => {
    if (!values) return defaultValues
    if ("encoded" in values) {
      return values.encoded
    }
    const exit = Schema.decodeUnknownExit(Schema.toEncoded(schema), {
      errors: "all",
    })(values.unknown)
    if (exit._tag === "Success") {
      return exit.value
    }
    console.warn(
      "Provided form values are not valid, falling back to default values",
      exit.cause,
    )
    return defaultValues
  }

const makeForm = <S extends FormSchema>(
  schema: S,
  resetValues: S["Encoded"],
): FormComponent<S> => {
  const id = crypto.randomUUID()
  const getValues_ = getValues(schema)
  const resolver = standardSchemaResolver(
    Schema.toStandardSchemaV1(schema, {
      parseOptions: { errors: "all", onExcessProperty: "ignore" },
    }),
  )
  const Form: React.FC<FormComponentProps<S>> = (props) => {
    const resetValues_ = useMemo(
      () => getValues_(props.resetValues, resetValues),
      [props.resetValues],
    )
    const initialValues = useMemo(
      () =>
        props.initialValues
          ? getValues_(props.initialValues, resetValues_)
          : undefined,
      [resetValues_, props.initialValues],
    )
    const form = RHF.useForm<RHF.FieldValues, unknown, S["Type"]>({
      mode: props.validationMode ?? "onBlur",
      resolver,
      defaultValues: initialValues ?? resetValues_,
    })
    return (
      <RHF.FormProvider {...form}>
        <form
          id={id}
          onSubmit={form.handleSubmit(
            (decoded) =>
              props.onSubmit(
                { decoded, encoded: Schema.encodeUnknownSync(schema)(decoded) },
                form,
              ),
            props.onError,
          )}
        >
          {props.children}
        </form>
      </RHF.FormProvider>
    )
  }
  return Object.assign(Form, { id })
}

export type ButtonComponent = React.FC<{
  type?: "submit" | "reset" | "button"
  form?: string
  children?: React.ReactNode
  onClick?: React.MouseEventHandler
}>

export const FormDisplay = {
  make: <F extends Fields>(
    body: FormStruct<F> & { readonly schema: FormSchema },
    Button: ButtonComponent,
  ): StructDisplay<F> & {
    readonly Form: FormComponent<FormStruct<F>["schema"] & FormSchema>
    readonly Submit: ButtonComponent
  } => {
    const display = makeDisplay(body, Path.empty) as StructDisplay<F>
    const Form = makeForm(body.schema, body.defaultValue)
    const Submit: ButtonComponent = (props) => (
      <Button {...props} type="submit" form={Form.id}>
        {props.children}
      </Button>
    )
    return Object.assign(display, { Form, Submit })
  },
}
