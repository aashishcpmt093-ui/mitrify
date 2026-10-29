import { useState } from "react";
import { History, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import RegisterVisit from "@/components/clinic/register-visit";
import StaffHistory from "@/components/clinic/staff-history";
import LoginCard from "@/components/clinic/login-card";
import { useBackStep } from "@/lib/back-step";
import { auth, signIn, staffEmail, useClinicSession } from "@/lib/clinic";
import { signOut } from "firebase/auth";

export default function StaffPortal() {
  const session = useClinicSession("staff");
  const [tab, setTab] = useState<"register" | "history">("register");
  // From History, the phone's back button returns to registration.
  useBackStep(tab === "history", () => setTab("register"));

  if (session.status === "loading") {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (session.status !== "ready") {
    return (
      <div className="flex flex-col items-center gap-6 w-full">
        <h1 className="text-2xl font-semibold">Staff sign in</h1>
        <LoginCard
          identifierLabel="Staff ID"
          identifierType="text"
          wrongRole={session.status === "wrong-role"}
          onSignOut={() => signOut(auth)}
          onSignIn={(id, pw) => signIn(staffEmail(id), pw, "staff")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Staff: {session.profile.name}</h1>
        <Button variant="outline" size="sm" onClick={() => signOut(auth)}>
          Sign out
        </Button>
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex gap-2">
          <Button variant={tab === "register" ? "default" : "outline"} onClick={() => setTab("register")}>
            <UserPlus className="mr-1.5 h-4 w-4" /> New visit
          </Button>
          <Button variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>
            <History className="mr-1.5 h-4 w-4" /> History
          </Button>
        </div>
        {tab === "register" ? (
          <RegisterVisit uid={session.uid} />
        ) : (
          <StaffHistory uid={session.uid} staffName={session.profile.name} />
        )}
      </div>
    </div>
  );
}
