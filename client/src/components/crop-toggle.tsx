import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLanguage } from "@/hooks/use-language";

interface CropToggleProps {
  value: "potato" | "onion";
  onChange: (value: "potato" | "onion") => void;
}

export function CropToggle({ value, onChange }: CropToggleProps) {
  const { t } = useLanguage();
  
  return (
    <ToggleGroup 
      type="single" 
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as "potato" | "onion");
      }}
      className="border rounded-md"
      data-testid="toggle-crop"
    >
      <ToggleGroupItem 
        value="potato" 
        className="px-3 h-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        data-testid="toggle-crop-potato"
      >
        {t("Potato", "आलू")}
      </ToggleGroupItem>
      <ToggleGroupItem 
        value="onion" 
        className="px-3 h-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        data-testid="toggle-crop-onion"
      >
        {t("Onion", "प्याज")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
