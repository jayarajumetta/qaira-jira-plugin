import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";
import { BrandWordmark } from "../components/BrandWordmark";
import { EyeIcon } from "../components/AppIcons";
import { ToastMessage } from "../components/ToastMessage";
import { api } from "../lib/api";
import { getPostAuthRoute } from "../lib/routeHistory";
import type { AuthSetupPayload } from "../types";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              logo_alignment?: "left" | "center";
            }
          ) => void;
        };
      };
    };
  }
}

type FormMode =
  | "login"
  | "signup"
  | "signup-code"
  | "forgot"
  | "forgot-code"
  | "signup-success"
  | "reset-success";
type FieldName = "name" | "email" | "password" | "newPassword" | "verificationCode";
type FormValues = Record<FieldName, string>;
type FieldErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Partial<Record<FieldName, boolean>>;
type PendingVerification = {
  type: "signup" | "forgot";
  email: string;
};

const EMPTY_AUTH_SETUP: AuthSetupPayload = {
  google: {
    enabled: false,
    clientId: null
  },
  emailVerification: {
    enabled: false,
    senderEmail: null,
    senderName: null
  }
};

const INITIAL_FORM_VALUES: FormValues = {
  name: "",
  email: "",
  password: "",
  newPassword: "",
  verificationCode: ""
};

const authFeatureSlides = [
  {
    eyebrow: "AI quality command",
    title: "Ship better software with AI-led quality intelligence.",
    description: "Connect stories, test design, automation, execution health and release risks in one focused workspace.",
    badge: "Release Health",
    score: 92,
    status: "Ready for release",
    statusCopy: "Regression stable. No critical blockers detected.",
    metrics: [
      { value: "85%", label: "Automation visibility" },
      { value: "3x", label: "Faster release decisions" },
      { value: "AI", label: "Risk insights included" }
    ],
    bars: [
      { label: "Story coverage", value: 96 },
      { label: "Automation coverage", value: 82 },
      { label: "Latest pass rate", value: 94 }
    ],
    insight: "AI insight: Login and checkout modules are stable across the last 5 executions."
  },
  {
    eyebrow: "AI test case generation",
    title: "Convert stories into test coverage your teams can trust.",
    description: "QAira turns business rules and acceptance criteria into review-ready test cases, reducing missed scenarios before sprint work reaches execution.",
    badge: "Coverage Design",
    score: 88,
    status: "Coverage gaps found early",
    statusCopy: "Critical paths, edge cases, and negative flows are drafted before manual review.",
    metrics: [
      { value: "70%", label: "Less authoring effort" },
      { value: "2x", label: "More scenario depth" },
      { value: "0", label: "Lost story links" }
    ],
    bars: [
      { label: "Story traceability", value: 95 },
      { label: "Scenario completeness", value: 88 },
      { label: "Review readiness", value: 84 }
    ],
    insight: "AI insight: High-risk payment and account flows need boundary and rollback coverage."
  },
  {
    eyebrow: "AI automation authoring",
    title: "Move from intent to stable automation without brittle handoffs.",
    description: "Generate keyword steps, locator strategy, and reusable flows from QA intent so automation work starts with context instead of blank scripts.",
    badge: "Automation Build",
    score: 84,
    status: "Automation plan prepared",
    statusCopy: "Reusable flows, objects, and execution data are aligned before scripting begins.",
    metrics: [
      { value: "3x", label: "Faster first draft" },
      { value: "60%", label: "Less locator rework" },
      { value: "1", label: "Shared object model" }
    ],
    bars: [
      { label: "Reusable step coverage", value: 86 },
      { label: "Locator confidence", value: 81 },
      { label: "Flow maintainability", value: 89 }
    ],
    insight: "AI insight: Reuse the authenticated session flow across dashboard, settings, and billing tests."
  },
  {
    eyebrow: "AI run analysis",
    title: "Turn every failed run into a release decision, not a mystery.",
    description: "QAira groups failures, explains likely causes, and highlights release risk so teams know what to fix, defer, or rerun with confidence.",
    badge: "Run Intelligence",
    score: 90,
    status: "Root cause signals ready",
    statusCopy: "Failures are clustered by product area, error pattern, and business impact.",
    metrics: [
      { value: "45m", label: "Saved per triage cycle" },
      { value: "4", label: "Risk clusters detected" },
      { value: "Live", label: "Release confidence" }
    ],
    bars: [
      { label: "Failure clustering", value: 91 },
      { label: "Bug signal quality", value: 87 },
      { label: "Release confidence", value: 90 }
    ],
    insight: "AI insight: Checkout failures are environmental; profile updates are product-risk candidates."
  }
];

let googleScriptPromise: Promise<void> | null = null;

function mergeIds(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ") || undefined;
}

function getFieldsForMode(mode: FormMode): FieldName[] {
  if (mode === "forgot") {
    return ["email", "newPassword"];
  }

  if (mode === "signup") {
    return ["email", "password"];
  }

  if (mode === "signup-code" || mode === "forgot-code") {
    return ["verificationCode"];
  }

  return ["email", "password"];
}

function validateEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string) {
  if (password.length < 6) {
    return "Password must be at least 6 characters long.";
  }

  return "";
}

function getFieldError(fieldName: FieldName, value: string, mode: FormMode) {
  const trimmedValue = fieldName === "email" || fieldName === "name" ? value.trim() : value;

  if (fieldName === "email") {
    if (!trimmedValue) {
      return "Email is required.";
    }

    if (!validateEmail(trimmedValue)) {
      return "Please enter a valid email address.";
    }
  }

  if (fieldName === "password" && (mode === "login" || mode === "signup")) {
    if (!trimmedValue) {
      return "Password is required.";
    }

    return validatePassword(trimmedValue);
  }

  if (fieldName === "newPassword" && mode === "forgot") {
    if (!trimmedValue) {
      return "New password is required.";
    }

    return validatePassword(trimmedValue);
  }

  if (fieldName === "verificationCode" && (mode === "signup-code" || mode === "forgot-code")) {
    const normalizedCode = value.replace(/\s+/g, "");

    if (!normalizedCode) {
      return "Verification code is required.";
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
      return "Enter the 6-digit verification code from your email.";
    }
  }

  return "";
}

function getModeErrors(mode: FormMode, values: FormValues) {
  const nextErrors: FieldErrors = {};

  for (const fieldName of getFieldsForMode(mode)) {
    const error = getFieldError(fieldName, values[fieldName], mode);

    if (error) {
      nextErrors[fieldName] = error;
    }
  }

  return nextErrors;
}

function getTouchedState(mode: FormMode) {
  return getFieldsForMode(mode).reduce<TouchedFields>((state, fieldName) => {
    state[fieldName] = true;
    return state;
  }, {});
}

function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity='true']");

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google sign-in could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error("Google sign-in could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

function getCurrentCopy(
  mode: FormMode,
  pendingVerification: PendingVerification | null,
  authSetup: AuthSetupPayload
) {
  const senderEmail = authSetup.emailVerification.senderEmail || "support@qualipal.in";
  const emailReady = authSetup.emailVerification.enabled;

  if (mode === "signup") {
    return {
      eyebrow: "Create account",
      title: "Set up your QAira access",
      description: emailReady
        ? `Create an account for secure access to the workspace. We'll send a 6-digit verification code from ${senderEmail} before the account goes live.`
        : "Create an account for secure access to the workspace. An admin needs to finish the Email Sender integration before signup can be completed.",
      submitLabel: "Sign Up",
      loadingLabel: "Starting signup…"
    };
  }

  if (mode === "forgot") {
    return {
      eyebrow: "Reset password",
      title: "Reset your password",
      description: emailReady
        ? `Enter your work email and a new password. We'll send a 6-digit verification code from ${senderEmail} to confirm the reset.`
        : "Enter your work email and a new password. An admin needs to finish the Email Sender integration before password reset can be completed.",
      submitLabel: "Send reset code",
      loadingLabel: "Sending code…"
    };
  }

  if (mode === "signup-code") {
    return {
      eyebrow: "Verify email",
      title: "Enter your signup code",
      description: `We sent a 6-digit verification code to ${pendingVerification?.email || "your email"}. Enter it below to finish creating the account.`,
      submitLabel: "Verify and create account",
      loadingLabel: "Verifying code…"
    };
  }

  if (mode === "forgot-code") {
    return {
      eyebrow: "Verify reset",
      title: "Enter your reset code",
      description: `Enter the 6-digit code sent to ${pendingVerification?.email || "your email"} to confirm the password reset.`,
      submitLabel: "Verify and reset password",
      loadingLabel: "Verifying code…"
    };
  }

  return {
    eyebrow: "Secure login",
    title: "Welcome back",
    description: "Sign in to continue managing test design, runs, and traceability in one place.",
    submitLabel: "Sign in to QAira",
    loadingLabel: "Signing in…"
  };
}

export function AuthPage({ initialMode = "login" }: { initialMode?: Extract<FormMode, "login" | "signup"> }) {
  const navigate = useNavigate();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const {
    login,
    loginWithGoogle,
    requestSignupCode,
    verifySignupCode,
    requestPasswordResetCode,
    verifyPasswordResetCode
  } = useAuth();
  const [mode, setMode] = useState<FormMode>(initialMode);
  const [formValues, setFormValues] = useState<FormValues>(INITIAL_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touchedFields, setTouchedFields] = useState<TouchedFields>({});
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [authSetup, setAuthSetup] = useState<AuthSetupPayload>(EMPTY_AUTH_SETUP);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const [activeFeatureSlide, setActiveFeatureSlide] = useState(2);

  const isSuccessMode = mode === "signup-success" || mode === "reset-success";
  const isCodeMode = mode === "signup-code" || mode === "forgot-code";
  const isEmailVerificationReady = authSetup.emailVerification.enabled;
  const isGoogleReady = authSetup.google.enabled && Boolean(authSetup.google.clientId);
  const currentCopy = getCurrentCopy(mode, pendingVerification, authSetup);
  const activeFeature = authFeatureSlides[activeFeatureSlide] || authFeatureSlides[0];
  const isBusy = isSubmitting || isGoogleSubmitting || isResendingCode;

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const nextSetup = await api.auth.setup();

        if (!isMounted) {
          return;
        }

        setAuthSetup(nextSetup);
      } catch (nextError) {
        if (!isMounted) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Authentication setup could not be loaded. Please refresh and try again."
        );
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveFeatureSlide((current) => (current + 1) % authFeatureSlides.length);
    }, 5600);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isSuccessMode) {
      return;
    }

    emailInputRef.current?.focus();
  }, [isSuccessMode, mode]);

  useEffect(() => {
    if (
      (mode !== "login" && mode !== "signup") ||
      !isGoogleReady ||
      !authSetup.google.clientId ||
      !googleButtonRef.current
    ) {
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
      }

      return;
    }

    const googleClientId = authSetup.google.clientId;
    let isActive = true;

    void loadGoogleIdentityScript()
      .then(() => {
        if (!isActive || !googleButtonRef.current || !window.google?.accounts?.id) {
          return;
        }

        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: ({ credential }) => {
            if (!credential) {
              setError("Google sign-in did not return a credential. Please try again.");
              return;
            }

            void (async () => {
              setIsGoogleSubmitting(true);
              setError("");

              try {
                await loginWithGoogle({ idToken: credential });
                navigate(getPostAuthRoute(), { replace: true });
              } catch (nextError) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : "Google sign-in could not be completed."
                );
              } finally {
                setIsGoogleSubmitting(false);
              }
            })();
          }
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_blue",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 360,
          logo_alignment: "left"
        });
      })
      .catch((nextError) => {
        if (!isActive) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Google sign-in could not be loaded."
        );
      });

    return () => {
      isActive = false;

      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
      }
    };
  }, [authSetup.google.clientId, isGoogleReady, loginWithGoogle, mode, navigate]);

  const resetFormState = (nextMode: FormMode) => {
    setMode(nextMode);
    setFormValues(INITIAL_FORM_VALUES);
    setFieldErrors({});
    setTouchedFields({});
    setError("");
    setInfoMessage("");
    setPendingVerification(null);
    setIsSubmitting(false);
    setIsResendingCode(false);
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const moveToVerificationMode = (nextMode: "signup-code" | "forgot-code", email: string) => {
    setMode(nextMode);
    setPendingVerification({
      type: nextMode === "signup-code" ? "signup" : "forgot",
      email
    });
    setFieldErrors({});
    setTouchedFields({});
    setError("");
    setFormValues((current) => ({
      ...current,
      email,
      verificationCode: ""
    }));
  };

  const updateFieldError = (fieldName: FieldName, value: string) => {
    const nextError = getFieldError(fieldName, value, mode);

    setFieldErrors((current) => {
      const nextErrors = { ...current };

      if (nextError) {
        nextErrors[fieldName] = nextError;
      } else {
        delete nextErrors[fieldName];
      }

      return nextErrors;
    });
  };

  const handleFieldChange = (fieldName: FieldName) => (event: ChangeEvent<HTMLInputElement>) => {
    let { value } = event.currentTarget;

    if (fieldName === "verificationCode") {
      value = value.replace(/\D+/g, "").slice(0, 6);
    }

    setFormValues((current) => ({
      ...current,
      [fieldName]: value
    }));

    if (error) {
      setError("");
    }

    if (infoMessage) {
      setInfoMessage("");
    }

    if (touchedFields[fieldName] || fieldErrors[fieldName]) {
      updateFieldError(fieldName, value);
    }
  };

  const handleFieldBlur = (fieldName: FieldName) => () => {
    setTouchedFields((current) => ({
      ...current,
      [fieldName]: true
    }));
    updateFieldError(fieldName, formValues[fieldName]);
  };

  const handlePasswordShortcut =
    (fieldName: "password" | "newPassword") => (event: KeyboardEvent<HTMLInputElement>) => {
      if (!(event.altKey && event.key.toLowerCase() === "v")) {
        return;
      }

      event.preventDefault();

      if (fieldName === "password") {
        setShowPassword((current) => !current);
        return;
      }

      setShowNewPassword((current) => !current);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBusy || isSuccessMode) {
      return;
    }

    const normalizedValues: FormValues = {
      ...formValues,
      email: formValues.email.trim().toLowerCase(),
      name: formValues.name.trim(),
      verificationCode: formValues.verificationCode.replace(/\s+/g, "")
    };
    const nextErrors = getModeErrors(mode, normalizedValues);

    setFormValues(normalizedValues);
    setFieldErrors(nextErrors);
    setTouchedFields(getTouchedState(mode));
    setError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if ((mode === "signup" || mode === "forgot") && !isEmailVerificationReady) {
      setError("Email verification is not configured yet. Ask an admin to finish the Email Sender integration.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login({
          email: normalizedValues.email,
          password: normalizedValues.password
        });
        navigate(getPostAuthRoute(), { replace: true });
      } else if (mode === "signup") {
        await requestSignupCode({
          email: normalizedValues.email,
          password: normalizedValues.password,
          name: normalizedValues.name || undefined
        });
        moveToVerificationMode("signup-code", normalizedValues.email);
        setInfoMessage(`A 6-digit verification code has been sent to ${normalizedValues.email}.`);
      } else if (mode === "signup-code") {
        const verificationEmail = pendingVerification?.email || normalizedValues.email;

        await verifySignupCode({
          email: verificationEmail,
          code: normalizedValues.verificationCode
        });
        resetFormState("signup-success");
      } else if (mode === "forgot") {
        await requestPasswordResetCode({
          email: normalizedValues.email,
          newPassword: normalizedValues.newPassword
        });
        moveToVerificationMode("forgot-code", normalizedValues.email);
        setInfoMessage(`If ${normalizedValues.email} is registered, a 6-digit verification code is on its way.`);
      } else if (mode === "forgot-code") {
        const verificationEmail = pendingVerification?.email || normalizedValues.email;

        await verifyPasswordResetCode({
          email: verificationEmail,
          code: normalizedValues.verificationCode
        });
        resetFormState("reset-success");
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "We couldn't complete the request. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!pendingVerification || isBusy) {
      return;
    }

    setIsResendingCode(true);
    setError("");

    try {
      if (pendingVerification.type === "signup") {
        await requestSignupCode({
          email: pendingVerification.email,
          password: formValues.password,
          name: formValues.name.trim() || undefined
        });
        setInfoMessage(`A fresh signup code has been sent to ${pendingVerification.email}.`);
      } else {
        await requestPasswordResetCode({
          email: pendingVerification.email,
          newPassword: formValues.newPassword
        });
        setInfoMessage(`If ${pendingVerification.email} is registered, a fresh reset code is on its way.`);
      }

      setFormValues((current) => ({
        ...current,
        verificationCode: ""
      }));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "We couldn't resend the verification code."
      );
    } finally {
      setIsResendingCode(false);
    }
  };

  const handleBackFromVerification = () => {
    const nextMode = pendingVerification?.type === "signup" ? "signup" : "forgot";

    setMode(nextMode);
    setPendingVerification(null);
    setFieldErrors({});
    setTouchedFields({});
    setError("");
    setInfoMessage("");
    setFormValues((current) => ({
      ...current,
      verificationCode: ""
    }));
  };

  const loginPasswordDescribedBy = mergeIds(
    fieldErrors.password ? "password-input-error" : undefined,
    "password-input-hint"
  );
  const resetPasswordDescribedBy = mergeIds(
    fieldErrors.newPassword ? "new-password-input-error" : undefined,
    "new-password-input-hint"
  );
  const verificationCodeDescribedBy = mergeIds(
    fieldErrors.verificationCode ? "verification-code-error" : undefined,
    pendingVerification ? "verification-code-hint" : undefined
  );

  return (
    <div className="page auth-page">
      <ToastMessage message={infoMessage} onDismiss={() => setInfoMessage("")} tone="info" />

      <div className="container auth-shell">
        <section className="left auth-aside" aria-label="QAira product overview">
          <div className="auth-command-hero">
            <div className="auth-feature-carousel" key={activeFeature.eyebrow}>
              <div className="auth-product-copy">
                <h1>{activeFeature.title}</h1>
                <p>{activeFeature.description}</p>
              </div>
            </div>

            <div className="auth-hero-metrics metric-strip page-metric-strip" aria-label="QAira quality metrics" role="group">
              {activeFeature.metrics.map((metric) => (
                <article key={`${activeFeature.eyebrow}-${metric.label}`}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </article>
              ))}
            </div>

            <div className="auth-release-preview" aria-label="Automation build preview">
              <div className="auth-release-preview-head">
                <strong>{activeFeature.badge}</strong>
                <span><span className="auth-status-dot" aria-hidden="true" />Live</span>
              </div>

              <div className="auth-health-score">
                <div
                  className="auth-health-ring"
                  aria-label={`${activeFeature.badge} score ${activeFeature.score} percent`}
                  style={{ "--score": `${activeFeature.score}%` } as CSSProperties}
                >
                  <span>{activeFeature.score}%</span>
                </div>
                <div>
                  <h2>{activeFeature.status}</h2>
                  <p>{activeFeature.statusCopy}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <main className="right auth-main">
          <div className="login-card" aria-live="polite">
            <BrandWordmark className="auth-card-brand" subtitle="Secure workspace access" />

            {isSuccessMode ? null : (
              <>
                <header className="auth-card-header">
                  <div className="auth-card-title" role="heading" aria-level={2}>
                    {currentCopy.title}
                  </div>
                  <p>{currentCopy.description}</p>
                </header>
              </>
            )}

            {isSuccessMode ? (
              <div className="success-screen">
                <div className="success-icon" aria-hidden="true">✓</div>
                <div className="success-screen-title" role="heading" aria-level={2}>
                  {mode === "signup-success" ? "Account created" : "Password updated"}
                </div>
                <p className="success-message">
                  {mode === "signup-success"
                    ? "Your email has been verified and your account is ready. Sign in with your new credentials to enter the workspace."
                    : "Your verification code checked out and the new password is now active. Sign in with the updated password to continue."}
                </p>
                <button
                  className="primary-button auth-submit"
                  onClick={() => resetFormState("login")}
                  type="button"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                {mode === "signup" && (
                  <FormField label="Full name" inputId="name-input">
                    <input
                      autoComplete="name"
                      disabled={isBusy}
                      id="name-input"
                      name="name"
                      onBlur={handleFieldBlur("name")}
                      onChange={handleFieldChange("name")}
                      type="text"
                      value={formValues.name}
                    />
                  </FormField>
                )}

                {!isCodeMode ? (
                  <FormField
                    error={fieldErrors.email}
                    inputId="email-input"
                    label="Email"
                    required
                  >
                    <input
                      autoComplete="email"
                      autoFocus
                      disabled={isBusy}
                      inputMode="email"
                      name="email"
                      onBlur={handleFieldBlur("email")}
                      onChange={handleFieldChange("email")}
                      placeholder="Email*"
                      ref={emailInputRef}
                      type="email"
                      value={formValues.email}
                    />
                  </FormField>
                ) : (
                  <div className="auth-verification-panel">
                    <span className="auth-verification-label">Verification target</span>
                    <strong className="auth-verification-target">{pendingVerification?.email || formValues.email}</strong>
                    <p className="auth-verification-caption">
                      Check that inbox for the latest 6-digit code before continuing.
                    </p>
                  </div>
                )}

                {(mode === "login" || mode === "signup") && (
                  <FormField
                    error={fieldErrors.password}
                    hint="Minimum 6 characters. Press Alt+V to show or hide."
                    inputId="password-input"
                    label="Password"
                    required
                  >
                    <div className={fieldErrors.password ? "password-field is-error" : "password-field"} id="password-input-shell">
                      <input
                        aria-describedby={loginPasswordDescribedBy}
                        aria-invalid={Boolean(fieldErrors.password)}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        disabled={isBusy}
                        id="password-input"
                        name="password"
                        onBlur={handleFieldBlur("password")}
                        onChange={handleFieldChange("password")}
                        onKeyDown={handlePasswordShortcut("password")}
                        placeholder="Password*"
                        aria-keyshortcuts="Alt+V"
                        type={showPassword ? "text" : "password"}
                        value={formValues.password}
                      />
                      <button
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="password-toggle"
                        disabled={isBusy}
                        onClick={() => setShowPassword((current) => !current)}
                        tabIndex={-1}
                        type="button"
                      >
                        <EyeIcon size={16} />
                      </button>
                    </div>
                  </FormField>
                )}

                {(mode === "login" || mode === "signup") ? (
                  <div className="auth-google-section">
                    {isGoogleReady ? (
                      <div className="auth-google-button-shell">
                        <div aria-label="Continue with Google" ref={googleButtonRef} />
                      </div>
                    ) : (
                      <button
                        className="auth-google-fallback-button"
                        disabled={isBusy}
                        onClick={() => setError("Google sign-in is not configured yet.")}
                        type="button"
                      >
                        <span aria-hidden="true">G</span>
                        Continue with Google
                      </button>
                    )}
                  </div>
                ) : null}

                {mode === "forgot" && (
                  <FormField
                    error={fieldErrors.newPassword}
                    hint="Minimum 6 characters. Press Alt+V to show or hide."
                    inputId="new-password-input"
                    label="New password"
                    required
                  >
                    <div className={fieldErrors.newPassword ? "password-field is-error" : "password-field"} id="new-password-input-shell">
                      <input
                        aria-describedby={resetPasswordDescribedBy}
                        aria-invalid={Boolean(fieldErrors.newPassword)}
                        autoComplete="new-password"
                        disabled={isBusy}
                        id="new-password-input"
                        name="newPassword"
                        onBlur={handleFieldBlur("newPassword")}
                        onChange={handleFieldChange("newPassword")}
                        onKeyDown={handlePasswordShortcut("newPassword")}
                        aria-keyshortcuts="Alt+V"
                        type={showNewPassword ? "text" : "password"}
                        value={formValues.newPassword}
                      />
                      <button
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        className="password-toggle"
                        disabled={isBusy}
                        onClick={() => setShowNewPassword((current) => !current)}
                        tabIndex={-1}
                        type="button"
                      >
                        {showNewPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </FormField>
                )}

                {isCodeMode && (
                  <FormField
                    error={fieldErrors.verificationCode}
                    hint="Enter the 6-digit code from your email."
                    inputId="verification-code-input"
                    label="Verification code"
                    required
                  >
                    <input
                      aria-describedby={verificationCodeDescribedBy}
                      aria-invalid={Boolean(fieldErrors.verificationCode)}
                      autoComplete="one-time-code"
                      disabled={isBusy}
                      id="verification-code-input"
                      inputMode="numeric"
                      name="verificationCode"
                      onBlur={handleFieldBlur("verificationCode")}
                      onChange={handleFieldChange("verificationCode")}
                      pattern="[0-9]*"
                      type="text"
                      value={formValues.verificationCode}
                    />
                  </FormField>
                )}

                {(mode === "signup" || mode === "forgot") && !isEmailVerificationReady ? (
                  <div className="auth-note-box" role="status">
                    Email verification is not configured yet. Ask an admin to finish the Email Sender integration in Integrations.
                  </div>
                ) : null}

                {error ? (
                  <div className="form-error-box" role="alert">
                    <p>{error}</p>
                    <button
                      aria-label="Dismiss error"
                      className="form-error-dismiss"
                      onClick={() => setError("")}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}

                <button
                  className="primary-button auth-submit"
                  disabled={
                    isBusy ||
                    ((mode === "signup" || mode === "forgot") && !isEmailVerificationReady)
                  }
                  type="submit"
                >
                  {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
                  <span>{isSubmitting ? currentCopy.loadingLabel : currentCopy.submitLabel}</span>
                </button>

                {(mode === "login" || mode === "signup") ? (
                  <div className="auth-provider-divider" aria-hidden="true">
                    <span>OR CONTINUE WITH EMAIL</span>
                  </div>
                ) : null}

                {mode === "login" || mode === "forgot" || isCodeMode ? (
                  <div className="auth-secondary-actions">
                    {mode === "login" ? (
                      <button
                        className="link-button"
                        disabled={isBusy}
                        onClick={() => resetFormState("forgot")}
                        type="button"
                      >
                        Forgot password?
                      </button>
                    ) : null}

                    {mode === "forgot" ? (
                      <button
                        className="link-button"
                        disabled={isBusy}
                        onClick={() => resetFormState("login")}
                        type="button"
                      >
                        Back to login
                      </button>
                    ) : null}

                    {isCodeMode ? (
                      <>
                        <button
                          className="link-button"
                          disabled={isBusy || !isEmailVerificationReady}
                          onClick={() => void handleResendCode()}
                          type="button"
                        >
                          {isResendingCode ? "Resending…" : "Resend code"}
                        </button>
                        <button
                          className="link-button"
                          disabled={isBusy}
                          onClick={handleBackFromVerification}
                          type="button"
                        >
                          Change details
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {(mode === "login" || mode === "signup") ? (
                  <div className="auth-account-switch">
                    {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                    <button
                      className="link-button"
                      disabled={isBusy}
                      onClick={() => resetFormState(mode === "login" ? "signup" : "login")}
                      type="button"
                    >
                      {mode === "login" ? "Sign up" : "Sign in"}
                    </button>
                  </div>
                ) : null}
              </form>
            )}

            <footer className="auth-card-footer" />
          </div>
        </main>
      </div>
    </div>
  );
}
