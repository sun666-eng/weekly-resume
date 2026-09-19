import { Trans } from "@lingui/react/macro";
import { APP_NAME } from "@reactive-resume/utils/brand";
import { cn } from "@reactive-resume/utils/style";

type Props = React.ComponentProps<"div">;

export function Copyright({ className, ...props }: Props) {
	return (
		<div className={cn("text-muted-foreground/80 text-xs leading-relaxed", className)} {...props}>
			<p>
				<Trans>Licensed under MIT.</Trans>
			</p>

			<p className="mt-4">
				{APP_NAME} v<bdi>{__APP_VERSION__}</bdi>
			</p>
		</div>
	);
}
