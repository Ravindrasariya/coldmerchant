import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlayCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { DemoVideo } from "@shared/schema";

export function DemoVideosTab() {
  const { t } = useLanguage();

  const { data: videos = [], isLoading } = useQuery<DemoVideo[]>({
    queryKey: ["/api/demo-videos"],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <PlayCircle className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">
          {t("No demo videos available yet", "अभी कोई डेमो वीडियो उपलब्ध नहीं है")}
        </h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {t("Videos will appear here once uploaded by admin", "एडमिन द्वारा अपलोड होने पर वीडियो यहाँ दिखेंगे")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("Demo Videos", "डेमो वीडियो")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Watch tutorial and demo videos", "ट्यूटोरियल और डेमो वीडियो देखें")}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden" data-testid={`card-video-${video.id}`}>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-base font-medium">{video.caption}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <video
                controls
                preload="metadata"
                className="w-full max-h-[50vh]"
                data-testid={`video-player-${video.id}`}
              >
                <source src={`/api/demo-videos/${video.id}/stream`} type={video.mimeType} />
                {t("Your browser does not support video playback", "आपका ब्राउज़र वीडियो प्लेबैक का समर्थन नहीं करता")}
              </video>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
