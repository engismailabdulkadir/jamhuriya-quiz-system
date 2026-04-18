import { useState } from "react";
import logo from "../../assets/quize.png";
import { clearAuthData, loginUser, setAuthData } from "../../services/api.js";
import { showError, showWarning } from "../../utils/alerts.js";

function Login({ onNavigate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await loginUser({ username, password });
      setAuthData(response.token, response.user);

      const roleName = response.user?.role?.name;
      if (roleName === "student") {
        clearAuthData();
        await showWarning(
          "Student Access Required",
          "Students must use the student access page with student ID and name."
        );
        onNavigate("/student/access");
        return;
      }

      if (roleName === "admin") onNavigate("/admin/dashboard");
      else if (roleName === "teacher" || roleName === "instructor") onNavigate("/teacher/dashboard");
      else {
        clearAuthData();
        await showWarning("Unauthorized Role", "Your account role is not allowed on this portal.");
      }
    } catch (error) {
      if (error?.code === "NETWORK_ERROR") {
        await showError(
          "Network Error",
          "Cannot reach server. Please verify backend server and CORS settings."
        );
      } else if (error?.status === 403) {
        const message = String(error?.data?.message || "");
        if (message.toLowerCase().includes("student accounts must use")) {
          await showWarning("Student Access Required", "Please use the student access page.");
          onNavigate("/student/access");
        } else {
          await showWarning("Account Inactive", message || "Your account is inactive.");
        }
      } else if (error?.status === 422) {
        await showError("Invalid Credentials", error?.data?.message || "Username or password is incorrect.");
      } else if ((error?.status ?? 0) >= 500) {
        await showError(
          "Server Error",
          error?.data?.message || "Server error occurred during login."
        );
      } else {
        await showError("Login Failed", error?.data?.message || "Unexpected error happened.");
      }
      console.error("Login error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f1f5ff] px-4 pt-1 pb-8 sm:pt-2">
      <section className="w-full max-w-3xl">
        <article className="mx-auto mb-0 w-full max-w-2xl">
          <img
            src={logo}
            alt="Jamhuriya University Logo"
            className="mx-auto w-full max-w-[590px] object-contain"
          />
        </article>

        <article className="mx-auto -mt-16 w-full max-w-md overflow-hidden rounded-[46px] border border-[#f2c200]/60 bg-[linear-gradient(145deg,rgba(30,58,138,0.9)_0%,rgba(31,63,149,0.88)_45%,rgba(31,138,76,0.72)_100%)] px-8 py-10 shadow-[0_24px_60px_rgba(6,20,70,0.28)] backdrop-blur-sm sm:-mt-20 sm:px-10 sm:py-12">
          <h1 className="mb-6 text-center text-[2rem] font-semibold tracking-wide text-white">Login</h1>

          <div className="mx-auto mb-9 flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-1 ring-[#f2c200]/50">
            <svg width="66" height="66" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white/70">
              <path
                d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm-7.5 8.5a7.5 7.5 0 0 1 15 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="relative h-16">
              <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#f2c200] drop-shadow-[0_0_8px_rgba(242,194,0,0.35)]">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm-7.5 8.5a7.5 7.5 0 0 1 15 0"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder=" "
                className="login-auth-input peer h-full w-full border-0 border-b border-[#f2c200]/75 bg-transparent pl-16 pt-6 text-2xl text-white outline-none placeholder:text-transparent focus:border-white"
                required
              />
              <label
                htmlFor="username"
                className={`pointer-events-none absolute left-16 transition-all duration-200 peer-focus:top-1 peer-focus:translate-y-0 peer-focus:text-sm peer-focus:text-white ${
                  username ? "top-1 translate-y-0 text-sm text-white" : "top-1/2 -translate-y-1/2 text-2xl text-white/80"
                }`}
              >
                Username
              </label>
            </div>

            <div className="relative h-16">
              <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[#f2c200] drop-shadow-[0_0_8px_rgba(242,194,0,0.35)]">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M7 11V9a5 5 0 0 1 10 0v2m-9 0h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder=" "
                className="login-auth-input peer h-full w-full border-0 border-b border-[#f2c200]/75 bg-transparent pl-16 pt-6 text-2xl text-white outline-none placeholder:text-transparent focus:border-white"
                required
              />
              <label
                htmlFor="password"
                className={`pointer-events-none absolute left-16 transition-all duration-200 peer-focus:top-1 peer-focus:translate-y-0 peer-focus:text-sm peer-focus:text-white ${
                  password ? "top-1 translate-y-0 text-sm text-white" : "top-1/2 -translate-y-1/2 text-2xl text-white/80"
                }`}
              >
                Password
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-14 w-full rounded-2xl border border-[#f2c200]/70 bg-[linear-gradient(90deg,#1e3a8a_0%,#1f3f95_56%,#1f8a4c_100%)] text-lg font-bold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#f2c200]/70 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
export default Login;
