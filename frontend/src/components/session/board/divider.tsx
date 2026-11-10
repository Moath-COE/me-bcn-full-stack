import type { BoardKindProps } from "./kind-props";

/* A divider is structure, not content: a line across the available
   width with enough vertical margin for a mark's frame to show around
   it, since the item carries that frame and not the thin line alone. It
   occupies a slot in its region like any other item. */
export function DividerItem(props: BoardKindProps<"divider">) {
  void props;
  return (
    <div className="py-2">
      <hr className="border-0 border-t-2 border-chalkboard-edge" />
    </div>
  );
}
