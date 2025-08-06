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
import { Label } from "@/components/ui/label"

export class RatingInput extends FormField.FormField("RatingInput")<
  RatingInput,
  RatingInputFC
>() {
  static Optional = this.make({
    schema: NumberInput.Optional.schema.pipe(
      Schema.compose(Schema.OptionFromSelf(Rating)),
      Schema.asSchema,
    ),
    defaultValue: "",
  })
  static Required = this.makeRequired({
    schema: Rating,
  })
}

export interface RatingInputFC
  extends React.FC<{
    label?: React.ReactNode
    placeholder?: string | undefined | undefined
    className?: string
    value?: number | undefined
    onChange?: (value: any) => void
  }> {}

export const ShadcnFields: Layer.Layer<
  TextInput | TextArea | NumberInput | Select | RatingInput,
  never,
  FormFramework.FormFramework
> = Layer.mergeAll(
  TextInput.layerUncontrolled(({ label, ...props }) => (
    <>
      {label && <Label className="mb-1">{label}</Label>}
      <Input {...props} />
    </>
  )),
  TextArea.layerUncontrolled(({ label, ...props }) => (
    <>
      {label && <Label className="mb-1">{label}</Label>}
      <Textarea {...props} />
    </>
  )),
  NumberInput.layerControlled(
    React.forwardRef(
      ({ ...props }, ref: React.ForwardedRef<HTMLInputElement>) => (
        <Input {...props} ref={ref} type="number" />
      ),
    ),
  ),
  Select.layerControlled(({ options, label, placeholder, ...props }) => (
    <>
      {label}
      <SelectUi {...props}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map(({ label, value }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </SelectUi>
    </>
  )),
  RatingInput.layerControlled(({ onChange, ...props }) => (
    <RatingUi {...props} onValueChange={onChange}>
      {Arr.range(1, 5).map((i) => (
        <RatingButton key={i} />
      ))}
    </RatingUi>
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
