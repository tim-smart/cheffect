import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
)

const useFormItemId = () => `${React.useContext(FormItemContext).id}-form-item`

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  )
}

function FormLabel(props: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <Label data-slot="form-label" htmlFor={useFormItemId()} {...props} />
}

function FormControl(props: React.ComponentProps<typeof Slot>) {
  return <Slot data-slot="form-control" id={useFormItemId()} {...props} />
}

export { FormItem, FormLabel, FormControl }
