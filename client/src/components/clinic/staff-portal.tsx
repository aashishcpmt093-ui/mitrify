import { Button } from "@/components/ui/button";
import PatientIntakeForm from "@/components/patient-intake-form";
import LoginCard from "@/components/clinic/login-card";
import { auth, saveIntake, signIn, staffEmail, useClinicSession } from "@/lib/clinic";
import { signOut } from "firebase/auth";

export default function StaffPortal() {
  const session = useClinicSession("staff");

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
      <PatientIntakeForm onSave={(input) => saveIntake(input, { source: "staff", uid: session.uid })} />
    </div>
  );
}
