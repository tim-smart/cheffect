import React from "react"
import { NumberInput, Select, TextArea, TextInput } from "@inato-form/fields"
import { FormField, type FormFramework } from "@inato-form/core"
import { Layer } from "effect"
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
import { Rating } from "@/domain/Rating"
import * as Arr from "effect/Array"
import { ReactHookForm } from "@inato-form/react-hook-form"
import { Button } from "@/components/ui/button"
import { FormControl, FormItem, FormLabel } from "@/components/ui/form"
import { DurationFromMinutes } from "@/domain/Duration"

export const TextInputOrNull = TextInput.make({
  schema: Schema.Trim.pipe(
    Schema.transform(Schema.NullOr(Schema.NonEmptyTrimmedString), {
      decode: (value) => (value === "" ? null : value),
      encode: (value) => value ?? "",
    }),
  ),
  defaultValue: "",
})

export const NumberInputOrNull = NumberInput.make({
  schema: Schema.Union(
    Schema.Number,
    Schema.Literal(""),
    Schema.NumberFromString,
    Schema.Null,
  ).pipe(
    Schema.transform(Schema.NullOr(Schema.Number), {
      decode: (value) => (typeof value === "number" ? value : null),
      encode: (value) => value,
    }),
  ),
  defaultValue: "",
})

export const DurationInput = NumberInput.make({
  schema: NumberInputOrNull.schema.pipe(
    Schema.compose(Schema.NullOr(DurationFromMinutes)),
  ),
  defaultValue: "",
})

export const SelectWithLiteralsOrNull = <
  Literals extends Arr.NonEmptyReadonlyArray<string>,
>(
  ...literals: Literals
) =>
  Select.make({
    schema: Schema.Union(
      Schema.Literal(...literals),
      Schema.transform(Schema.Literal(""), Schema.Null, {
        decode: () => null,
        encode: () => "" as const,
      }),
    ),
    defaultValue: "",
  })

export class RatingInput extends FormField.FormField("RatingInput")<
  RatingInput,
  RatingInputFC
>() {
  static Optional = this.make({
    schema: NumberInputOrNull.schema.pipe(
      Schema.compose(Schema.NullOr(Rating)),
      Schema.asSchema,
    ),
    defaultValue: "",
  })
  static Required = this.makeRequired({
    schema: Rating,
  })
}

export interface RatingInputFC extends React.FC<{
  label?: React.ReactNode
  placeholder?: string | undefined | undefined
  className?: string
  value?: number | undefined
  onChange?: (value: any) => void
  size?: number
}> {}

export const ShadcnFields: Layer.Layer<
  TextInput | TextArea | NumberInput | Select | RatingInput,
  never,
  FormFramework.FormFramework
> = Layer.mergeAll(
  TextInput.layerUncontrolled(({ label, ...props }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <Input {...props} />
      </FormControl>
    </FormItem>
  )),
  TextArea.layerUncontrolled(({ label, ...props }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <Textarea {...props} />
    </FormItem>
  )),
  NumberInput.layerUncontrolled(({ label, ...props }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <Input type="number" step="any" {...props} />
      </FormControl>
    </FormItem>
  )),
  Select.layerControlled(({ options, label, placeholder, ...props }) => {
    const [open, setOpen] = React.useState(false)
    return (
      <FormItem className="w-full">
        {label && <FormLabel>{label}</FormLabel>}
        <FormControl>
          <SelectUi
            {...props}
            onValueChange={(_) => (props as any).onChange(_)}
            open={open}
            onOpenChange={setOpen}
          >
            <SelectTrigger
              className="w-full text-base md:text-sm"
              tabIndex={-1}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {placeholder && (
                  <SelectItem
                    value="__"
                    onClick={(e) => {
                      e.preventDefault()
                      ;(props as any).onChange("")
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
  }),
  RatingInput.layerControlled(({ onChange, label, size, ...props }) => (
    <FormItem className="w-full">
      {label && <FormLabel>{label}</FormLabel>}
      <FormControl>
        <div className="pt-1">
          <RatingUi {...props} onValueChange={onChange}>
            {Arr.range(1, 5).map((i) => (
              <RatingButton key={i} size={size} />
            ))}
          </RatingUi>
        </div>
      </FormControl>
    </FormItem>
  )),
  // MultiSelect.layerControlled(
  //   React.forwardRef(
  //     ({ options, ...props }, ref: React.ForwardedRef<HTMLInputElement>) => (
  //       <Mantine.MultiSelect {...props} ref={ref} data={options} />
  //     ),
  //   ),
  // ),
  // RadioGroup.layerControlled(
  //   React.forwardRef(
  //     ({ options, ...props }, ref: React.ForwardedRef<HTMLDivElement>) => (
  //       <Mantine.Radio.Group {...props} ref={ref}>
  //         <Mantine.Group mt="xs">
  //           {options.map((props) => (
  //             <Mantine.Radio key={props.value} {...props} />
  //           ))}
  //         </Mantine.Group>
  //       </Mantine.Radio.Group>
  //     ),
  //   ),
  // ),
  // Checkbox.layerUncontrolled(Mantine.Checkbox),
  // CheckboxGroup.layerControlled(
  //   React.forwardRef(
  //     ({ options, ...props }, ref: React.ForwardedRef<HTMLDivElement>) => (
  //       <Mantine.Checkbox.Group {...props} ref={ref}>
  //         <Mantine.Group mt="xs">
  //           {options.map((props) => (
  //             <Mantine.Checkbox key={props.value} {...props} />
  //           ))}
  //         </Mantine.Group>
  //       </Mantine.Checkbox.Group>
  //     ),
  //   ),
  // ),
)

export const ShadcnReactHookFormLayer = ShadcnFields.pipe(
  Layer.provideMerge(ReactHookForm.layer(Button as any)),
)
