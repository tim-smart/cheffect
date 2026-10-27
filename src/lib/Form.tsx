/**
 * Forms on top of effect-form: the field schemas and inputs cheffect shares
 * between its forms, and a `<Form>` element that submits on the native form
 * submit event.
 *
 * effect-form keeps a form's state in atoms, so a form made once at module
 * level has one state for the whole app. Forms that can be on screen more than
 * once at a time are made per component with `useForm`.
 */
import { useAtomSet } from "@effect/atom-react"
import {
  type Field,
  type FormBuilder,
  Validation,
} from "@lucas-barake/effect-form"
import { FormReact } from "@lucas-barake/effect-form-react"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import React, { useId, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  RatingButton,
  Rating as RatingUi,
} from "@/components/ui/shadcn-io/rating"
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  Select as SelectUi,
  SelectValue,
} from "@/components/ui/select"
import { FormControl, FormItem, FormLabel } from "@/components/ui/form"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { DurationFromMinutes } from "@/domain/Duration"
import { Rating } from "@/domain/Rating"

// -----------------------------------------------------------------------------
// Field schemas
// -----------------------------------------------------------------------------

export const RequiredString = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  message: "This field is required",
})

export const StringOrNull = Schema.Trim.pipe(
  Schema.decodeTo(
    Schema.NullOr(Schema.Trimmed.check(Schema.isNonEmpty())),
    SchemaTransformation.transform({
      decode: (value) => (value === "" ? null : value),
      encode: (value) => value ?? "",
    }),
  ),
)

export const NumberOrNull = Schema.Union([
  Schema.Finite,
  Schema.Literal(""),
  Schema.FiniteFromString,
  Schema.Null,
]).pipe(
  Schema.decodeTo(
    Schema.NullOr(Schema.Finite),
    SchemaTransformation.transform({
      decode: (value) => (typeof value === "number" ? value : null),
      encode: (value) => value,
    }),
  ),
)

export const DurationOrNull = NumberOrNull.pipe(
  Schema.decodeTo(Schema.NullOr(DurationFromMinutes)),
)

export const RatingOrNull = NumberOrNull.pipe(
  Schema.decodeTo(Schema.NullOr(Rating)),
)

export const LiteralsOrNull = <
  const Literals extends Arr.NonEmptyReadonlyArray<string>,
>(
  literals: Literals,
) =>
  Schema.Union([
    Schema.Literals(literals),
    Schema.Literal("").pipe(
      Schema.decodeTo(
        Schema.Null,
        SchemaTransformation.transform({
          decode: () => null,
          encode: () => "" as const,
        }),
      ),
    ),
  ])

// -----------------------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------------------

export interface InputProps extends Pick<
  React.ComponentProps<"input">,
  "autoFocus" | "tabIndex" | "onFocus" | "onBlur" | "onKeyDown"
> {
  readonly label?: React.ReactNode
  readonly placeholder?: string | undefined
  readonly className?: string
}

export const TextInput: FormReact.FieldComponent<string, InputProps> = ({
  field,
  props: { label, onBlur, ...props },
}) => (
  <FormItem className="w-full">
    {label && <FormLabel>{label}</FormLabel>}
    <FormControl>
      <Input
        {...props}
        name={field.path}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={(e) => {
          onBlur?.(e)
          field.onBlur()
        }}
      />
    </FormControl>
  </FormItem>
)

export const TextArea: FormReact.FieldComponent<
  string,
  Pick<InputProps, "label" | "placeholder" | "className">
> = ({ field, props: { label, ...props } }) => (
  <FormItem className="w-full">
    {label && <FormLabel>{label}</FormLabel>}
    <Textarea
      {...props}
      name={field.path}
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
    />
  </FormItem>
)

export const NumberInput: FormReact.FieldComponent<
  typeof NumberOrNull,
  InputProps & {
    /**
     * A unit shown inside the field after the number, like "min".
     */
    readonly suffix?: React.ReactNode
    /**
     * The unit in full for assistive technology, like "minutes", when the
     * shown suffix is an abbreviation.
     */
    readonly suffixLabel?: string
  }
> = ({ field, props: { label, suffix, suffixLabel, onBlur, ...props } }) => {
  const suffixId = useId()
  const inputProps = {
    type: "number",
    step: "any",
    ...props,
    name: field.path,
    value: field.value ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      field.onChange(e.target.value),
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      onBlur?.(e)
      field.onBlur()
    },
  }
  return (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      {suffix === undefined ? (
        <FormControl>
          <Input {...inputProps} />
        </FormControl>
      ) : (
        // FormControl's slot sets the input's data-slot, so the group's own
        // focus style never matches; the group takes an input's focus style
        // from its input instead
        <InputGroup className="has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px]">
          <FormControl>
            <InputGroupInput {...inputProps} aria-describedby={suffixId} />
          </FormControl>
          <InputGroupAddon align="inline-end">
            {/* The field is described by the unit: the full word when the
                shown one is an abbreviation */}
            <InputGroupText id={suffixId}>
              {suffixLabel === undefined ? (
                suffix
              ) : (
                <>
                  <span aria-hidden>{suffix}</span>
                  <span className="sr-only">{suffixLabel}</span>
                </>
              )}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      )}
    </FormItem>
  )
}

export interface SelectProps {
  readonly options: ReadonlyArray<{ label: string; value: string }>
  readonly label?: React.ReactNode
  readonly placeholder?: string | undefined
}

export function Select<A extends string>({
  field,
  props: { options, label, placeholder },
}: FormReact.FieldComponentProps<A, SelectProps>) {
  const [open, setOpen] = useState(false)
  const onChange = (value: string) => field.onChange(value as A)
  return (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <SelectUi
          value={field.value}
          onValueChange={onChange}
          open={open}
          onOpenChange={setOpen}
        >
          <SelectTrigger className="w-full text-base md:text-sm" tabIndex={-1}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {placeholder && (
                <SelectItem
                  value="__"
                  onClick={(e) => {
                    e.preventDefault()
                    onChange("")
                    setOpen(false)
                  }}
                >
                  {placeholder}
                </SelectItem>
              )}
              {options.map(({ label, value }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </SelectUi>
      </FormControl>
    </FormItem>
  )
}

export const RatingInput: FormReact.FieldComponent<
  typeof RatingOrNull,
  Pick<InputProps, "label" | "className"> & { readonly size?: number }
> = ({ field, props: { label, size, ...props } }) => (
  <FormItem className="w-full">
    {label && <FormLabel>{label}</FormLabel>}
    <FormControl>
      <div className="pt-1">
        <RatingUi
          {...props}
          value={typeof field.value === "number" ? field.value : null}
          onValueChange={field.onChange}
        >
          {Arr.range(1, 5).map((i) => (
            <RatingButton key={i} size={size} />
          ))}
        </RatingUi>
      </div>
    </FormControl>
  </FormItem>
)

/**
 * The state of one property of an item in an array field, for editing arrays
 * nested inside an array field's items with the inputs above.
 */
export const itemField = <A extends object, K extends keyof A>(
  field: FormReact.FieldState<ReadonlyArray<A>>,
  index: number,
  key: K,
): FormReact.FieldState<A[K]> => ({
  ...field,
  path: `${field.path}[${index}].${String(key)}`,
  value: field.value[index]![key],
  onChange: (value) =>
    field.onChange(
      field.value.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    ),
  error: Option.none(),
})

/**
 * The state of one item of an array of plain values nested inside an array
 * field's items.
 */
export const itemValueField = <A,>(
  field: FormReact.FieldState<ReadonlyArray<A>>,
  index: number,
): FormReact.FieldState<A> => ({
  ...field,
  path: `${field.path}[${index}]`,
  value: field.value[index]!,
  onChange: (value) =>
    field.onChange(field.value.map((item, i) => (i === index ? value : item))),
  error: Option.none(),
})

// -----------------------------------------------------------------------------
// Forms
// -----------------------------------------------------------------------------

export type SubmitHandler<TFields extends Field.FieldsRecord> = (
  values: Field.DecodedFromFields<TFields>,
) => void | Promise<void>

/**
 * A form whose submit is handed the function that handles the decoded values,
 * so the handler can come from the rendering component's props.
 */
export const makeForm = <
  TFields extends Field.FieldsRecord,
  CM extends FormReact.FieldComponentMap<TFields>,
>(
  builder: FormBuilder.FormBuilder<TFields, never>,
  fields: CM,
) =>
  FormReact.make(builder, {
    fields,
    mode: { validation: "onBlur" },
    onSubmit: (handler: SubmitHandler<TFields>, { decoded }) =>
      handler(decoded),
  })

/**
 * A form for one component, for forms that can be on screen more than once.
 */
export const useForm = <
  TFields extends Field.FieldsRecord,
  CM extends FormReact.FieldComponentMap<TFields>,
>(
  builder: FormBuilder.FormBuilder<TFields, never>,
  fields: CM,
) => useState(() => makeForm(builder, fields))[0]

export function Form<TFields extends Field.FieldsRecord>({
  form,
  id,
  defaultValues,
  onSubmit,
  resetOnSubmit = false,
  children,
}: {
  readonly form: {
    readonly Initialize: React.FC<{
      readonly defaultValues: Field.EncodedFromFields<TFields>
      readonly children: React.ReactNode
    }>
    readonly submit: Atom.AtomResultFn<SubmitHandler<TFields>, unknown, unknown>
    readonly reset: Atom.Writable<void, void>
  }
  /**
   * The form element id, for submit buttons outside the form.
   */
  readonly id?: string
  readonly defaultValues: Field.EncodedFromFields<TFields>
  readonly onSubmit: SubmitHandler<TFields>
  /**
   * Return to the default values once the submit succeeds.
   */
  readonly resetOnSubmit?: boolean
  readonly children: React.ReactNode
}) {
  const ref = useRef<HTMLFormElement>(null)
  const submit = useAtomSet(form.submit, { mode: "promiseExit" })
  const reset = useAtomSet(form.reset)
  return (
    <form
      ref={ref}
      id={id}
      onSubmit={(event) => {
        event.preventDefault()
        submit(onSubmit).then((exit) => {
          if (Exit.isSuccess(exit)) {
            if (resetOnSubmit) reset()
            return
          }
          console.error("Form submission error:", Cause.pretty(exit.cause))
          focusFirstError(ref.current, exit.cause)
        })
      }}
    >
      <form.Initialize defaultValues={defaultValues}>
        {children}
      </form.Initialize>
    </form>
  )
}

const focusFirstError = (
  form: HTMLFormElement | null,
  cause: Cause.Cause<unknown>,
) => {
  const error = Cause.findErrorOption(cause)
  if (form === null || Option.isNone(error)) return
  if (!Schema.isSchemaError(error.value)) return
  const paths = Validation.routeErrors(error.value)
  for (const element of form.querySelectorAll<HTMLElement>("[name]")) {
    if (paths.has(element.getAttribute("name")!)) {
      element.focus()
      return
    }
  }
}
