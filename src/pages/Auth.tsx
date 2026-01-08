import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, User, ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "signup" || tab === "forgot" || tab === "signin" ? tab : "signin";
  });

  const isResetFlow = useMemo(
    () => new URLSearchParams(window.location.search).get("reset") === "true",
    []
  );
  const [resetSent, setResetSent] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (isResetFlow) return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "signup" || tab === "forgot" || tab === "signin") {
      setActiveTab(tab);
    }
  }, [isResetFlow]);

  useEffect(() => {
    if (!isResetFlow) return;

    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasRecoverySession(!!data.session);
      setRecoveryChecked(true);
    };

    check();
    const t = window.setTimeout(check, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [isResetFlow]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      const msg = error.message || "Invalid login";
      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
      if (msg.toLowerCase().includes("invalid login credentials")) {
        setActiveTab("forgot");
      }
      return;
    }

    toast({ title: "Welcome back!" });
    navigate("/");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, displayName || undefined);
    setIsLoading(false);

    if (error) {
      const msg = error.message || "Sign up failed";
      if (msg.toLowerCase().includes("user already registered")) {
        toast({
          title: "Email already registered",
          description: "Try signing in, or use \"Forgot\" to reset your password.",
          variant: "destructive",
        });
        setActiveTab("signin");
        return;
      }

      toast({ title: "Sign up failed", description: msg, variant: "destructive" });
      return;
    }

    toast({ title: "Account created!", description: "You can now sign in." });
    setActiveTab("signin");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setIsLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setResetSent(true);
      toast({ title: "Reset email sent", description: "Check your inbox for the password reset link." });
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasRecoverySession) {
      toast({
        title: "Reset link not active",
        description: "Please request a new reset link.",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Weak password",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please retype your new password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsLoading(false);

    if (error) {
      toast({ title: "Could not update password", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Password updated", description: "You can now sign in with your new password." });
    await supabase.auth.signOut();
    navigate("/auth?tab=signin", { replace: true });
  };

  if (isResetFlow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md relative"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/auth?tab=forgot", { replace: true })}
            className="absolute -top-12 left-0"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
            >
              <KeyRound className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="text-3xl font-bold text-foreground">Reset password</h1>
            <p className="text-muted-foreground mt-2">Choose a new password for your account</p>
          </div>

          <Card className="border-border/50 shadow-xl">
            <CardHeader className="text-center pb-4">
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>Enter and confirm your new password below.</CardDescription>
            </CardHeader>
            <CardContent>
              {!recoveryChecked ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !hasRecoverySession ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    This reset link is invalid or expired. Please request a new one.
                  </p>
                  <Button className="w-full" onClick={() => navigate("/auth?tab=forgot", { replace: true })}>
                    Request new reset link
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSetNewPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="absolute -top-12 left-0"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
          >
            <Sparkles className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">NOVA</h1>
          <p className="text-muted-foreground mt-2">Your universal AI assistant</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to access your conversations and settings</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                <TabsTrigger value="forgot">Forgot</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Display Name (optional)</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="forgot">
                {resetSent ? (
                  <div className="text-center space-y-4 py-4">
                    <p className="text-muted-foreground">
                      We've sent a password reset link to <strong>{email}</strong>
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setResetSent(false);
                        setActiveTab("signin");
                      }}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enter your email and we'll send you a link to reset your password.
                    </p>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Reset Link"
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Continue without account?{" "}
          <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/")}>
            Skip for now
          </Button>
        </p>
      </motion.div>
    </div>
  );
}
