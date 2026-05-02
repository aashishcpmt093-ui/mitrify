import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const AUTH_CACHE_KEY = "mitrify_auth_v1";

interface AuthUser {
  id: string;
  isLocal?: boolean;
  authType?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
}

function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function setCachedUser(user: AuthUser | null) {
  try {
    if (user) {
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch {}
}

async function fetchUser(): Promise<AuthUser | null> {
  // Fire all auth endpoints in parallel — first OK response (by priority) wins.
  // Saves 3× network round-trips compared to sequential checks.
  const safeFetch = (url: string) =>
    fetch(url, { credentials: "include" }).catch(() => null);

  const [localRes, adminRes, coAdminRes, replitRes] = await Promise.all([
    safeFetch("/api/local/user"),
    safeFetch("/api/admin/me"),
    safeFetch("/api/coadmin/me"),
    safeFetch("/api/auth/user"),
  ]);

  if (localRes && localRes.ok) {
    const data = await localRes.json();
    const user: AuthUser = { ...data, id: String(data.id), isLocal: true, authType: data.authType || "local", role: data.role || "customer" };
    setCachedUser(user);
    return user;
  }
  if (adminRes && adminRes.ok) {
    const data = await adminRes.json();
    const user: AuthUser = { id: String(data.id || data.username || "admin"), isLocal: false, authType: "admin", role: "admin" };
    setCachedUser(user);
    return user;
  }
  if (coAdminRes && coAdminRes.ok) {
    const data = await coAdminRes.json();
    const user: AuthUser = { id: String(data.id || data.username || "coadmin"), isLocal: false, authType: "coadmin", role: data.role || "coadmin" };
    setCachedUser(user);
    return user;
  }
  if (replitRes && replitRes.ok) {
    const data = await replitRes.json();
    const user: AuthUser = { ...data, isLocal: false, authType: "replit" };
    setCachedUser(user);
    return user;
  }

  setCachedUser(null);
  return null;
}

async function logout(): Promise<void> {
  setCachedUser(null);
  try {
    const localRes = await fetch("/api/local/user", { credentials: "include" });
    if (localRes.ok) {
      await fetch("/api/local/logout", { method: "POST", credentials: "include" });
      window.location.href = "/";
      return;
    }
  } catch {}
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    initialData: getCachedUser,
    retry: 3,
    retryDelay: 2000,
    staleTime: 0,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setCachedUser(null);
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

// Returns the in-app "home" route for the currently authenticated user.
// Used by Back buttons so that pressing Back always lands on a known
// app screen instead of relying on the browser history stack (which
// can leak the user out to a previous origin or jump back into the app
// after they pressed back).
export function useHomeRoute(): string {
  const { user } = useAuth();
  const role = user?.role || "customer";
  if (role === "admin") return "/admin/dashboard";
  if (role === "coadmin") return "/coadmin/dashboard";
  if (role === "provider") return "/provider/dashboard";
  return "/customer/home";
}
