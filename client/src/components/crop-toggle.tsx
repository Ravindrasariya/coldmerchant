import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { CropType } from "@shared/schema";

interface CropToggleProps {
  value: CropType | "all";
  onChange: (value: CropType | "all") => void;
  allowedCrops?: CropType[];
  showAll?: boolean;
}

export function CropToggle({ value, onChange, allowedCrops, showAll }: CropToggleProps) {
  const { t } = useLanguage();

  const allCrops: { value: CropType; label: [string, string]; testId: string }[] = [
    { value: "potato", label: ["Potato", "आलू"], testId: "toggle-crop-potato" },
    { value: "onion", label: ["Onion", "प्याज"], testId: "toggle-crop-onion" },
    { value: "garlic", label: ["Garlic", "लहसुन"], testId: "toggle-crop-garlic" },
  ];

  const crops = allowedCrops ? allCrops.filter(c => allowedCrops.includes(c.value)) : allCrops;
  
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CropType | "all")}>
      <SelectTrigger 
        className="w-fit shrink-0 bg-green-600 text-white border-green-600 focus:ring-green-500 font-bold [&>svg]:text-white [&>span]:!line-clamp-none"
        data-testid="toggle-crop"
      >
        <SelectValue placeholder={t("Potato", "आलू")} />
      </SelectTrigger>
      <SelectContent>
        {showAll && (
          <SelectItem value="all" data-testid="toggle-crop-all">
            {t("All", "सभी")}
          </SelectItem>
        )}
        {crops.map(c => (
          <SelectItem key={c.value} value={c.value} data-testid={c.testId}>
            {t(c.label[0], c.label[1])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
