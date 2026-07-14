import { useNavigate } from "@tanstack/react-router";
import { CircleOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { handleNavigationError } from "@/lib/navigation-errors";
import { cn } from "@/lib/utils";

interface NotFoundStateProps {
  containerClassName?: string;
}
export function NotFoundState({ containerClassName }: NotFoundStateProps) {
  const navigate = useNavigate();
  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({
      to: "/",
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "not-found.back-home" })
    );
  };
  const handleGoHome = () => {
    navigate({
      to: "/",
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "not-found.home" })
    );
  };
  return (
    <div
      className={cn("flex items-center justify-center p-4", containerClassName)}
    >
      <div className="w-full max-w-lg">
        <EmptyState
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={handleGoHome}>{"Go to home"}</Button>
              <Button onClick={handleGoBack} variant="outline">
                {"Go back"}
              </Button>
            </div>
          }
          description="The page you tried to open does not exist. Check the URL or return to the home page."
          icon={CircleOff}
          title="Page not found"
        />
      </div>
    </div>
  );
}
