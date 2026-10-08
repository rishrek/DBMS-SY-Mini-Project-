// What anyone sees at an address that doesn't exist, or that isn't meant for them.
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">We couldn't find that page</h1>
      <p className="mt-2 text-ink-2">The link may be old, or the address may have a small typo.</p>
      <Link to={user ? "/dashboard" : "/"}
            className="mt-6 inline-block rounded-lg bg-navy px-4 py-2 font-medium text-white hover:bg-navy/90">
        {user ? "Back to my dashboard" : "Back to the start"}
      </Link>
    </div>
  );
}
