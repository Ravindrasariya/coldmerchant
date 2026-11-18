import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReCAPTCHA from "react-google-recaptcha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, PackagePlus, TrendingUp, Users, ClipboardList, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const captchaRef = useRef<ReCAPTCHA>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState("");
  const captchaConfig = useQuery<{ siteKey: string | null; required: boolean }>({
    queryKey: ["/api/recaptcha-config"],
    staleTime: 60_000,
    retry: 1,
  });
  const siteKey = captchaConfig.data?.siteKey;
  const captchaUnavailable = captchaConfig.isError
    || (!!captchaConfig.data?.required && !siteKey);

  useEffect(() => {
    setCaptchaToken(null);
    setCaptchaError("");
  }, [siteKey, language, isMobile]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const onLoginSubmit = (data: LoginForm) => {
    if (captchaConfig.isPending || captchaUnavailable || (siteKey && !captchaToken)) return;
    setCaptchaError("");
    loginMutation.mutate({ ...data, ...(captchaToken ? { captchaToken } : {}) }, {
      onError: (error) => {
        captchaRef.current?.reset();
        setCaptchaToken(null);
        if (error.message.includes("CAPTCHA")) {
          setCaptchaError(t(
            "CAPTCHA verification failed. Please try again.",
            "कैप्चा सत्यापन विफल रहा। कृपया फिर से प्रयास करें।",
          ));
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <PackagePlus className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl text-primary">Vyapar Vriddhi</CardTitle>
            <div className="text-sm">
              by <span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span>
            </div>
            <CardDescription className="mt-4">
              Welcome
            </CardDescription>
            <p className="text-sm text-muted-foreground">Please Enter Your Login Details</p>
          </CardHeader>
          <CardContent>
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4" data-no-capitalize>
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your username" 
                          {...field} 
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="username"
                          spellCheck={false}
                          data-testid="input-login-username"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input 
                          type={showPassword ? "text" : "password"} 
                          placeholder="Enter password" 
                          {...field} 
                          autoCapitalize="off"
                          autoCorrect="off"
                          autoComplete="current-password"
                          spellCheck={false}
                          data-testid="input-login-password"
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="mt-1 text-muted-foreground hover:text-foreground"
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {captchaUnavailable && (
                  <div role="alert" className="text-sm text-destructive">
                    <p>{t(
                      "CAPTCHA configuration could not be loaded. Please retry or contact the administrator.",
                      "कैप्चा की जानकारी लोड नहीं हो सकी। कृपया फिर प्रयास करें या व्यवस्थापक से संपर्क करें।",
                    )}</p>
                    <Button type="button" size="sm" variant="outline" className="mt-2"
                      onClick={() => void captchaConfig.refetch()}>
                      {t("Retry", "फिर प्रयास करें")}
                    </Button>
                  </div>
                )}
                {siteKey && (
                  <div className="flex flex-col items-center gap-2" data-testid="login-recaptcha">
                    <ReCAPTCHA
                      key={`${siteKey}-${language}-${isMobile}`}
                      ref={captchaRef}
                      sitekey={siteKey}
                      size={isMobile ? "compact" : "normal"}
                      hl={language}
                      onChange={(token) => {
                        setCaptchaToken(token);
                        setCaptchaError("");
                      }}
                      onExpired={() => {
                        setCaptchaToken(null);
                        setCaptchaError(t(
                          "CAPTCHA expired. Please verify again.",
                          "कैप्चा की समय सीमा समाप्त हो गई। कृपया फिर सत्यापित करें।",
                        ));
                      }}
                      onErrored={() => {
                        setCaptchaToken(null);
                        setCaptchaError(t(
                          "CAPTCHA could not load. Check your connection and try again.",
                          "कैप्चा लोड नहीं हो सका। कनेक्शन जाँचें और फिर प्रयास करें।",
                        ));
                      }}
                    />
                    {!captchaToken && !captchaError && (
                      <p className="text-xs text-muted-foreground">{t(
                        "Please complete the CAPTCHA to log in.",
                        "लॉगिन करने के लिए कृपया कैप्चा पूरा करें।",
                      )}</p>
                    )}
                  </div>
                )}
                {captchaError && <p role="alert" className="text-sm text-destructive">{captchaError}</p>}
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending || captchaConfig.isPending
                    || captchaUnavailable || (!!siteKey && !captchaToken)}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Login
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    className="text-primary hover:underline text-sm"
                    onClick={() => {
                      // Note: Change password requires being logged in first
                      alert("Please login first, then change your password from the menu.");
                    }}
                    data-testid="link-change-password"
                  >
                    Change Password
                  </button>
                </div>
              </form>
            </Form>

            <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
              Need Help? Please reach out to <span className="whitespace-nowrap"><span className="text-green-500 font-medium">Krashu</span><span className="text-orange-500 font-medium">Ved</span></span>{" "}
              <span className="font-medium">+918882589392</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 bg-primary/5 items-center justify-center p-12">
        <div className="max-w-lg space-y-8">
          <div>
            <h2 className="text-3xl font-bold mb-4">Streamline Your Agri Trading Business</h2>
            <p className="text-muted-foreground text-lg">
              Track purchases, manage inventory, and grow your business with Vyapar Vriddhi - 
              the complete solution for agri merchants.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Complete Stock Register</h3>
                <p className="text-sm text-muted-foreground">
                  Track all purchases with detailed farmer information, lot details, and bag breakdowns.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Multi-User Access</h3>
                <p className="text-sm text-muted-foreground">
                  Invite team members to collaborate. Everyone sees the same real-time data.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Grow Your Business</h3>
                <p className="text-sm text-muted-foreground">
                  Track payments, generate bills, and manage your trading operations efficiently.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
