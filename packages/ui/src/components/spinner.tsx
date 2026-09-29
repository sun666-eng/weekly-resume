import { t } from "@lingui/core/macro";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useLinguiChanges } from "@reactive-resume/ui/hooks/use-lingui-changes";
import { cn } from "@reactive-resume/utils/style";

function Spinner({ className, color, ...props }: React.ComponentProps<"svg">) {
	useLinguiChanges();
	return (
		<CircleNotchIcon
			role="status"
			aria-label={t`Loading`}
			color={color ?? "currentColor"}
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
