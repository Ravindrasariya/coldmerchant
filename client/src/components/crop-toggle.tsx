import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

interface CropToggleProps {
  value: "potato" | "onion";
  onChange: (value: "potato" | "onion") => void;
}

export function CropToggle({ value, onChange }: CropToggleProps) {
  const { t } = useLanguage();
  
  return (
    <div className="flex rounded-md border" data-testid="toggle-crop">
      <Button
        type="button"
        variant={value === "potato" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("potato")}
        className="rounded-r-none border-0 px-3"
        data-testid="toggle-crop-potato"
      >
        {t("Potato", "आलू")}
      </Button>
      <Button
        type="button"
        variant={value === "onion" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("onion")}
        className="rounded-l-none border-0 px-3"
        data-testid="toggle-crop-onion"
      >
        {t("Onion", "प्याज")}
      </Button>
    </div>
  );
}
