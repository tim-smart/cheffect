import React from "react"
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
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { Rating } from "@/domain/Rating"
import * as Arr from "effect/Array"
import { FormControl, FormItem, FormLabel } from "@/components/ui/form"
import { DurationFromMinutes } from "@/domain/Duration"
import * as Form from "./Form"

interface InputProps {
  label?: React.ReactNode
  placeholder?: string | undefined
  className?: string
}

const TextInputKind = Form.uncontrolled<InputProps>(
  ({ label, ...props }, { error: _, ...field }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <Input {...props} {...field} />
      </FormControl>
    </FormItem>
  ),
)

export const TextInput = {
  ...TextInputKind,
  Required: TextInputKind.makeRequired({
    schema: Schema.Trim.check(Schema.isNonEmpty()),
  }),
}

const TextAreaKind = Form.uncontrolled<InputProps>(
  ({ label, ...props }, { error: _, ...field }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <Textarea {...props} {...field} />
    </FormItem>
  ),
)

export const TextArea = {
  ...TextAreaKind,
  Required: TextAreaKind.makeRequired({
    schema: Schema.Trim.check(Schema.isNonEmpty()),
  }),
}

export const NumberInput = Form.uncontrolled<InputProps>(
  ({ label, ...props }, { error: _, ...field }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <Input type="number" step="any" {...props} {...field} />
      </FormControl>
    </FormItem>
  ),
)

export const Select = Form.controlled<
  InputProps & {
    options: ReadonlyArray<{ label: string; value: string }>
  }
>(({ options, label, placeholder, ...props }, { error: _, ...field }) => (
  <SelectField
    {...props}
    {...field}
    options={options}
    label={label}
    placeholder={placeholder}
  />
))

function SelectField({
  options,
  label,
  placeholder,
  ...props
}: InputProps &
  Omit<Form.ControlledProps, "error"> & {
    options: ReadonlyArray<{ label: string; value: string }>
  }) {
  const [open, setOpen] = React.useState(false)
  return (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <SelectUi
          {...props}
          onValueChange={(_) => props.onChange(_)}
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
                    props.onChange("")
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

export const TextInputOrNull = TextInput.make({
  schema: Schema.Trim.pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.Trimmed.check(Schema.isNonEmpty())),
      SchemaTransformation.transform({
        decode: (value) => (value === "" ? null : value),
        encode: (value) => value ?? "",
      }),
    ),
  ),
  defaultValue: "",
})

const NumberOrNull = Schema.Union([
  Schema.Number,
  Schema.Literal(""),
  Schema.FiniteFromString,
  Schema.Null,
]).pipe(
  Schema.decodeTo(
    Schema.NullOr(Schema.Number),
    SchemaTransformation.transform({
      decode: (value) => (typeof value === "number" ? value : null),
      encode: (value) => value,
    }),
  ),
)

export const NumberInputOrNull = NumberInput.make({
  schema: NumberOrNull,
  defaultValue: "",
})

export const DurationInput = NumberInput.make({
  schema: NumberOrNull.pipe(
    Schema.decodeTo(Schema.NullOr(DurationFromMinutes)),
  ),
  defaultValue: "",
})

export const SelectWithLiteralsOrNull = <
  const Literals extends Arr.NonEmptyReadonlyArray<string>,
>(
  literals: Literals,
) =>
  Select.make({
    schema: Schema.Union([
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
    ]),
    defaultValue: "",
  })

const RatingInputKind = Form.controlled<InputProps & { size?: number }>(
  ({ label, size, ...props }, { onChange, value, error: _, ...field }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <div className="pt-1">
          <RatingUi
            {...props}
            {...field}
            value={value ?? null}
            onValueChange={onChange}
          >
            {Arr.range(1, 5).map((i) => (
              <RatingButton key={i} size={size} />
            ))}
          </RatingUi>
        </div>
      </FormControl>
    </FormItem>
  ),
)

export const RatingInput = {
  ...RatingInputKind,
  Optional: RatingInputKind.make({
    schema: NumberOrNull.pipe(Schema.decodeTo(Schema.NullOr(Rating))),
    defaultValue: "",
  }),
}
