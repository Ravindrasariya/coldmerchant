import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { CropType } from "@shared/schema";

interface CropToggleProps {
  value: CropType;
  onChange: (value: CropType) => void;
}

export function CropToggle({ value, onChange }: CropToggleProps) {
  const { t } = useLanguage();
  
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CropType)}>
      <SelectTrigger 
        className="w-fit shrink-0 bg-green-600 text-white border-green-600 focus:ring-green-500 font-bold [&>svg]:text-white [&>span]:!line-clamp-none"
        data-testid="toggle-crop"
      >
        <SelectValue placeholder={t("Potato", "आलू")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="potato" data-testid="toggle-crop-potato">
          {t("Potato", "आलू")}
        </SelectItem>
        <SelectItem value="onion" data-testid="toggle-crop-onion">
          {t("Onion", "प्याज")}
        </SelectItem>
        <SelectItem value="garlic" data-testid="toggle-crop-garlic">
          {t("Garlic", "लहसुन")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
