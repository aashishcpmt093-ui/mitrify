import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/clinic";

type Props = {
  identifierLabel: string;
  identifierType: "text" | "email";
  onSignIn: (identifier: string, password: string) => Promise<void>;
  wrongRole?: boolean;
  onSignOut?: () => void;
};

export default function LoginCard({ identifierLabel, identifierType, onSignIn, wrongRole, onSignOut }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSignIn(identifier, password);
    } catch (err) {
      setError(friendlyError(err, "Sign in failed."));
    } finally {
      setBusy(false);
    }
  };

  if (wrongRole) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-sm text-center">
        <p className="text-red-600">This account does not have access to this portal.</p>
        {onSignOut && (
          <Button variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 w-full max-w-sm text-left">
      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">{identifierLabel}</Label>
        <Input id="identifier" type={identifierType} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
