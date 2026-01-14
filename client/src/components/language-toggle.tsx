import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={toggleLanguage}
      className="font-medium gap-1"
      data-testid="button-language-toggle"
    >
      <Globe className="h-4 w-4" />
      {language === "en" ? "हिंदी" : "EN"}
    </Button>
  );
}
