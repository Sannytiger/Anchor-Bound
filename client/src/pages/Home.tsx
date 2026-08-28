// @ts-nocheck
/**
 * Post-Print Protocol source-faithful implementation.
 * All original Anchor Bound screens, states, workflows, and interaction modes are retained.
 * Design reminder: preserve the archival proof-desk visual system while making identity evidence legible across public and institutional contexts.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { QRCodeSVG } from "qrcode.react";
import { BrowserQRCodeReader } from "@zxing/browser";
import {
  Anchor, ArrowLeft, ArrowRight, AtSign, Building2, Camera, Check, CircleCheck,
  Database, FileCheck2, GraduationCap, KeyRound, Landmark, LockKeyhole, LogOut,
  Mail, Moon, Pencil, QrCode, ScanLine, ShieldCheck, ShieldHalf, Sun,
  TriangleAlert, User, UserCheck, UsersRound, Wallet, X, XCircle,
} from "lucide-react";
import { ChangeEvent, CSSProperties, DragEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { AnimatedWordmark } from "@/components/AnimatedWordmark";
import { flushSync } from "react-dom";
import { credentialApi } from "@/lib/credentialApi";

type Page = "landing" | "portals" | "auth" | "app";
type Tab = "verifier" | "issuer" | "student" | "registry";
type AuthRole = "student" | "professor";
type AuthAction = "signin" | "signup";
type VerifyMode = "pdf" | "hash" | "qr" | "identity";
type VerificationState = "idle" | "hashing" | "verified" | "tampered";
type PortalChoice = "student" | "university" | "guest" | null;
type CertificateTemplate = "archive" | "ledger" | "diploma" | "folio" | "marble" | "noir";
type DocumentCategory = "education" | "government" | "employment" | "organization" | "personal";
type SceneState = { x: number; y: number; pulse: number; pulseX: number; pulseY: number };
type VerificationEvent = { id: string; state: Exclude<VerificationState, "idle" | "hashing">; source: "file" | "hash" | "camera" | "identity"; at: number };
type PortfolioRecord = { title: string; institution: string; date: string; hash: string; token: string; recipient: string; template: CertificateTemplate };
type UserSession = { role: AuthRole; name: string; id: string; rollNo?: string; university?: string; location?: { country: string; state: string; city: string } };
const createEmptySignup = () => ({ firstName: "", lastName: "", email: "", password: "", country: "", state: "", city: "", university: "", rollNumber: "", universityCode: "", studentId: "", otp: "", documentCategory: "personal" as DocumentCategory, documentNumber: "", birthDate: "", issuingAuthority: "", employer: "", employeeId: "", organization: "", authorizedSigner: "", issuingCountry: "" });

const ASSETS = {
  hero: "/images/anchor-bound-archival-thesis-desk.svg",
  stack: "/images/anchor-bound-portfolio-login-archive.svg",
  paper: "/images/anchor-bound-paper-grid.svg",
  mark: "/images/anchor-bound-lockmark.svg",
};

const locationData: Record<string, Record<string, string[]>> = {
  India: { Delhi: ["New Delhi", "Dwarka"], Maharashtra: ["Mumbai", "Pune"], Karnataka: ["Bengaluru", "Mysuru"], "Tamil Nadu": ["Chennai", "Coimbatore"] },
  "United States": { California: ["Stanford", "Los Angeles", "San Diego"], "New York": ["New York City", "Buffalo"], Texas: ["Austin", "Houston"], Massachusetts: ["Boston", "Cambridge"] },
  "United Kingdom": { England: ["London", "Manchester", "Oxford"], Scotland: ["Edinburgh", "Glasgow"], Wales: ["Cardiff", "Swansea"] },
  Canada: { Ontario: ["Toronto", "Ottawa", "Waterloo"], "British Columbia": ["Vancouver", "Victoria"], Quebec: ["Montreal", "Quebec City"] },
  Australia: { "New South Wales": ["Sydney", "Newcastle"], Victoria: ["Melbourne", "Geelong"], Queensland: ["Brisbane", "Gold Coast"] },
};
const universities = ["Stanford University", "Massachusetts Institute of Technology", "University of Oxford", "University of Toronto", "University of Melbourne", "Indian Institute of Technology Delhi", "Indian Institute of Technology Bombay", "Other verified institution"];
const documentProfiles: Record<DocumentCategory, { label: string; subjectLabel: string; previewSentence: string; fields: Array<{ key: "documentNumber" | "birthDate" | "issuingAuthority" | "employer" | "employeeId" | "organization" | "authorizedSigner" | "issuingCountry"; label: string; type?: string; placeholder?: string }> }> = {
  education: { label: "Education Record", subjectLabel: "Qualification / Programme", previewSentence: "is recorded as the holder of", fields: [{ key: "documentNumber", label: "Roll Number / Candidate ID", placeholder: "e.g. 22CS1042" }, { key: "issuingAuthority", label: "School, College or University", placeholder: "Issuing institution" }] },
  government: { label: "Government ID", subjectLabel: "Government ID Type", previewSentence: "is the verified holder of", fields: [{ key: "documentNumber", label: "Government ID Number", placeholder: "Enter document number" }, { key: "birthDate", label: "Date of Birth", type: "date" }, { key: "issuingAuthority", label: "Issuing Authority", placeholder: "e.g. Civil Registry" }] },
  employment: { label: "Employment Credential", subjectLabel: "Role / Employment Credential", previewSentence: "is verified in the capacity of", fields: [{ key: "employeeId", label: "Employee ID", placeholder: "Enter employee ID" }, { key: "employer", label: "Employer / Company", placeholder: "Organisation name" }, { key: "documentNumber", label: "Credential Number", placeholder: "Enter credential number" }] },
  organization: { label: "Organisation Credential", subjectLabel: "Organisation Credential Type", previewSentence: "is the authorised representative for", fields: [{ key: "organization", label: "Organisation Name", placeholder: "Registered organisation" }, { key: "documentNumber", label: "Organisation / Registration ID", placeholder: "Enter registration number" }, { key: "authorizedSigner", label: "Authorised Signer", placeholder: "Signer full name" }] },
  personal: { label: "Personal Identity", subjectLabel: "Personal Identity Document", previewSentence: "is the verified holder of", fields: [{ key: "documentNumber", label: "Identity Document Number", placeholder: "Enter document number" }, { key: "birthDate", label: "Date of Birth", type: "date" }, { key: "issuingCountry", label: "Issuing Country", placeholder: "Country of issue" }] },
};
const safeStorage = <T,>(key: string, fallback: T) => { try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; } };

function ParticleCanvas({ scene }: { scene: SceneState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    let frame = 0;
    const particles = Array.from({ length: 56 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28, size: Math.random() * 1.3 + .45 }));
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    const draw = () => { const active = sceneRef.current; context.clearRect(0, 0, canvas.width, canvas.height); context.save(); context.translate(active.x * 8, active.y * 8); particles.forEach((particle) => { particle.x += particle.vx; particle.y += particle.vy; if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1; if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1; context.fillStyle = "rgba(35,55,214,.15)"; context.beginPath(); context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); context.fill(); }); context.restore(); frame = requestAnimationFrame(draw); };
    resize(); draw(); addEventListener("resize", resize); return () => { cancelAnimationFrame(frame); removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} id="bg-canvas" aria-hidden="true" />;
}

function AnchorSeal({ large = false, lock = false }: { large?: boolean; lock?: boolean }) {
  return <span className={`anchor-stamp ${large ? "anchor-stamp-large" : ""} ${lock ? "anchor-stamp-lock" : ""}`}><img src={ASSETS.mark} alt="" aria-hidden="true" /><i aria-hidden="true">+</i></span>;
}

function GlassModal({ children, onClose, title, wide = false }: { children: ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}><section className={`record-dialog ${wide ? "record-dialog-wide" : ""}`}><button onClick={onClose} className="dialog-close" aria-label="Close dialog"><X size={18} /></button><p className="mono-label">Anchor Bound / proof object</p><h2>{title}</h2>{children}</section></div>;
}

function CameraQrScanner({ onDetected, onFailure }: { onDetected: (value: string) => void; onFailure: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    let stopped = false; let controls: { stop: () => void } | undefined;
    const reader = new BrowserQRCodeReader();
    reader.decodeFromVideoDevice(undefined, video, (result, _error, scanControls) => { controls = scanControls; if (!result || stopped) return; stopped = true; scanControls.stop(); onDetected(result.getText()); }).catch(() => onFailure("Camera access was unavailable. Check browser permission, then try again."));
    return () => { stopped = true; controls?.stop(); };
  }, [onDetected, onFailure]);
  return <video ref={videoRef} className="camera-preview" autoPlay muted playsInline aria-label="Live device camera preview for QR scanning" />;
}

function StatCard({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value: string; danger?: boolean }) {
  return <div className={`status-metric ${danger ? "metric-danger" : ""}`}>{icon}<div><span className="metric-value">{value}</span><span className="mono-label">{label}</span></div></div>;
}

export default function Home() {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.
  let { user, loading, error, isAuthenticated } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const initialView = params.get("view");
  const initialTab = params.get("tab");
  const [page, setPage] = useState<Page>(initialView === "app" || initialView === "auth" || initialView === "portals" ? initialView : "landing");
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab === "issuer" || initialTab === "student" || initialTab === "registry" ? initialTab : "verifier");
  const [portalChoice, setPortalChoice] = useState<PortalChoice>(() => initialView === "app" ? initialTab === "student" ? "student" : initialTab === "issuer" ? "university" : "guest" : null);
  const [lightTheme, setLightTheme] = useState(() => params.get("theme") !== "dark");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [backendStatus, setBackendStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [backendError, setBackendError] = useState("");
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authRole, setAuthRole] = useState<AuthRole>("student");
  const [authAction, setAuthAction] = useState<AuthAction>("signin");
  const [signupStep, setSignupStep] = useState(1);
  const [showSigninPassword, setShowSigninPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [facultyCode, setFacultyCode] = useState("");
  const [signin, setSignin] = useState({ firstName: "", lastName: "", email: "", password: "", studentId: "" });
  const [signupDrafts, setSignupDrafts] = useState(() => ({ student: createEmptySignup(), professor: createEmptySignup() }));
  const signup = signupDrafts[authRole];
  const previousSignupRole = useRef(authRole);
  const [verifyMode, setVerifyMode] = useState<VerifyMode>(params.get("mode") === "hash" || params.get("mode") === "qr" || params.get("mode") === "identity" ? params.get("mode") as VerifyMode : "pdf");
  const [verification, setVerification] = useState<VerificationState>("idle");
  useEffect(() => {
    if (page !== "auth" || authAction !== "signin") return;
    const clearAccessFields = () => {
      setSignin({ firstName: "", lastName: "", email: "", password: "", studentId: "" });
      setFacultyCode("");
      setShowSigninPassword(false);
      const accessForm = document.querySelector<HTMLFormElement>(".auth-card");
      if (!accessForm) return;
      accessForm.setAttribute("autocomplete", "off");
      accessForm.querySelectorAll<HTMLInputElement>("input").forEach((input, index) => {
        input.value = "";
        input.setAttribute("autocomplete", "off");
        input.setAttribute("data-lpignore", "true");
        input.setAttribute("data-1p-ignore", "true");
        input.name = `anchor-bound-${authRole}-access-${index}`;
      });
    };
    clearAccessFields();
    const delayedClear = window.setTimeout(clearAccessFields, 120);
    return () => window.clearTimeout(delayedClear);
  }, [page, authAction, authRole]);
  useEffect(() => {
    const roleChanged = previousSignupRole.current !== authRole;
    if (roleChanged && authAction === "signup") {
      setSignupStep(1);
      setShowSignupPassword(false);
      setAuthError("");
    }
    previousSignupRole.current = authRole;
  }, [authAction, authRole]);
  useEffect(() => {
    if (page !== "auth" || authAction !== "signup" || signupStep !== 3) return;
    const createButton = Array.from(document.querySelectorAll<HTMLButtonElement>(".signup-fields .two-actions .ink-button")).find((button) => button.textContent?.includes("Create"));
    if (createButton) createButton.textContent = "Create Account";
  }, [page, authAction, signupStep, authRole]);
  const [verifierFileName, setVerifierFileName] = useState("Drag & drop identity document PDF here");
  const [verifiedHash, setVerifiedHash] = useState("0x7f8a93…b12");
  const [hashQuery, setHashQuery] = useState("");
  const [qrCameraActive, setQrCameraActive] = useState(false);
  const [qrCameraError, setQrCameraError] = useState("");
  const [verificationEvents, setVerificationEvents] = useState<VerificationEvent[]>(() => safeStorage("anchor-bound-verifications", []));
  const [issuerTab, setIssuerTab] = useState<"single" | "bulk">("single");
  const [issuerHash, setIssuerHash] = useState("");
  const [issuerFileName, setIssuerFileName] = useState("");
  const [mintStep, setMintStep] = useState(0);
  const [bulkLoaded, setBulkLoaded] = useState(false);
  const [issuer, setIssuer] = useState({ address: "", name: "", degree: "" });
  const [issuerDocumentCategory, setIssuerDocumentCategory] = useState<DocumentCategory>("organization");
  const [issuerMetadata, setIssuerMetadata] = useState<Record<string, string>>({});
  const [certificateTemplate, setCertificateTemplate] = useState<CertificateTemplate>("archive");
  const [portfolio, setPortfolio] = useState<PortfolioRecord[]>(() => safeStorage("anchor-bound-portfolio", []));
  const [registry, setRegistry] = useState<{ contractAddress: string; issuers: Array<{ name: string; issuedCount: number; status: string }> }>({ contractAddress: "", issuers: [] });
  const [modal, setModal] = useState<"qr" | "metadata" | null>(null);
  const [landingTilt, setLandingTilt] = useState({ x: 0, y: 0 });
  const [scene, setScene] = useState<SceneState>({ x: 0, y: 0, pulse: 0, pulseX: 50, pulseY: 50 });
  const [themeRipple, setThemeRipple] = useState<{ id: number; x: number; y: number; tone: "light" | "dark" } | null>(null);
  const [wordmarkSequence, setWordmarkSequence] = useState(0);
  const [wordmarkAtRest, setWordmarkAtRest] = useState(false);
  const [sealAngle, setSealAngle] = useState(0);
  const [isSealDragging, setIsSealDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const sealPointerStartRef = useRef({ x: 0, angle: 0 });
  const sealIsDraggingRef = useRef(false);
  const sealDraggedRef = useRef(false);

  useEffect(() => { if (!params.get("theme")) setLightTheme(localStorage.getItem("anchor-bound-theme") !== "dark"); }, []);
  useEffect(() => { localStorage.setItem("anchor-bound-theme", lightTheme ? "light" : "dark"); }, [lightTheme]);
  useEffect(() => { if (!themeRipple) return; const timeout = window.setTimeout(() => setThemeRipple(null), 820); return () => window.clearTimeout(timeout); }, [themeRipple]);
  useEffect(() => { localStorage.setItem("anchor-bound-verifications", JSON.stringify(verificationEvents)); }, [verificationEvents]);
  useEffect(() => { localStorage.setItem("anchor-bound-portfolio", JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => {
    void credentialApi.health()
      .then(() => { setBackendStatus("online"); setBackendError(""); })
      .catch((error) => { setBackendStatus("offline"); setBackendError(error instanceof Error ? error.message : "Credential backend is offline."); });
    void credentialApi.registry().then(setRegistry).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!currentUser?.name) return;
    void credentialApi.portfolio(currentUser.name)
      .then(({ records }) => {
        if (records.length) {
          setPortfolio(records.map((record) => ({
            title: record.documentTitle,
            institution: record.issuerName,
            date: record.issuedAt,
            hash: record.fileHash,
            token: `#${record.tokenId}`,
            recipient: record.recipientName.trim().toLowerCase(),
            template: (record.template || "archive") as CertificateTemplate,
          })));
        }
      })
      .catch(() => { /* local portfolio remains available when backend is offline */ });
  }, [currentUser?.name]);

  const switchTheme = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    const bounds = event?.currentTarget.getBoundingClientRect();
    const nextLightTheme = !lightTheme;
    const x = bounds ? bounds.left + bounds.width / 2 : innerWidth / 2;
    const y = bounds ? bounds.top + bounds.height / 2 : innerHeight / 2;
    document.documentElement.style.setProperty("--theme-ripple-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-ripple-y", `${y}px`);
    const applyTheme = () => flushSync(() => setLightTheme(nextLightTheme));
    setThemeRipple({ id: Date.now(), x, y, tone: nextLightTheme ? "light" : "dark" });
    if ("startViewTransition" in document) {
      (document as Document & { startViewTransition: (update: () => void) => unknown }).startViewTransition(applyTheme);
      return;
    }
    applyTheme();
  };
  const goTo = (next: Page) => { if (next !== page) setPageHistory((history) => [...history, page]); setPage(next); scrollTo({ top: 0, behavior: "smooth" }); };
  const goBack = () => { if (page === "auth" && authAction === "signup" && signupStep > 1) { setSignupStep((step) => step - 1); setAuthError(""); return; } const previous = pageHistory[pageHistory.length - 1]; if (!previous) return; setPageHistory((history) => history.slice(0, -1)); setPage(previous); scrollTo({ top: 0, behavior: "smooth" }); };
  const goToAuth = (role?: AuthRole) => { if (role) { setAuthRole(role); setPortalChoice(role === "student" ? "student" : "university"); } setAuthAction("signin"); setSignin({ firstName: "", lastName: "", email: "", password: "", studentId: "" }); setFacultyCode(""); setShowSigninPassword(false); setAuthError(""); goTo("auth"); };
  const enterApp = (tab: Tab = "verifier", choice: PortalChoice = tab === "student" ? "student" : tab === "issuer" ? "university" : "guest") => { setPortalChoice(choice); setActiveTab(tab); goTo("app"); };
  const chooseAuthAction = (action: AuthAction) => { setAuthAction(action); setAuthError(""); if (action === "signup") { setSignupStep(1); setSignupDrafts((drafts) => ({ ...drafts, [authRole]: createEmptySignup() })); } else { setSignin({ firstName: "", lastName: "", email: "", password: "", studentId: "" }); setFacultyCode(""); setShowSigninPassword(false); } };
  const updateSignup = (updates: Partial<typeof signup>) => setSignupDrafts((drafts) => ({ ...drafts, [authRole]: { ...drafts[authRole], ...updates } }));
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signup.email.trim());
  const passwordIsStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,}$/.test(signup.password);
  const otpIsValid = /^\d{6}$/.test(signup.otp);
  const stepOneValid = Boolean(signup.firstName.trim() && signup.lastName.trim() && emailIsValid && passwordIsStrong && otpIsValid);
  const stepTwoValid = Boolean(signup.country && signup.state && signup.city);
  const holderDetailsValid = signup.documentCategory === "education" ? Boolean(signup.university && signup.universityCode.trim() && signup.rollNumber.trim() && signup.studentId.trim()) : signup.documentCategory === "government" ? Boolean(signup.documentNumber.trim() && signup.birthDate && signup.issuingAuthority.trim()) : signup.documentCategory === "employment" ? Boolean(signup.employeeId.trim() && signup.employer.trim() && signup.documentNumber.trim()) : signup.documentCategory === "organization" ? Boolean(signup.organization.trim() && signup.documentNumber.trim() && signup.authorizedSigner.trim()) : Boolean(signup.documentNumber.trim() && signup.birthDate && signup.issuingCountry.trim());
  const stepThreeValid = authRole === "professor" ? Boolean(signup.university && signup.universityCode.trim()) : holderDetailsValid;
  const availableStates = signup.country ? Object.keys(locationData[signup.country] ?? {}) : [];
  const availableCities = signup.country && signup.state ? locationData[signup.country]?.[signup.state] ?? [] : [];
  const advanceSignup = (target: number) => { if (target === 2 && !stepOneValid) return setAuthError("Provide first and last names, a valid email, a six-digit email OTP, and a password with uppercase, lowercase, number, and special character before continuing."); if (target === 3 && !stepTwoValid) return setAuthError("Select a country, state or province, and city before continuing."); setAuthError(""); setSignupStep(target); };
  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    const student = authRole === "student";
    try {
      const endpoint = authAction === "signup" ? "/api/auth/register" : "/api/auth/login";
      if (authAction === "signup" && !stepThreeValid) {
        setAuthError("Complete the required account and university details before creating your account.");
        return;
      }
      const body = authAction === "signup"
        ? { role: authRole, ...signup }
        : { role: authRole, email: signin.email, password: signin.password, studentId: signin.studentId, facultyCode };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Authentication failed.");
      const account = payload.user;
      const displayName = `${account.firstName} ${account.lastName}`.trim();
      setCurrentUser({ role: account.role, id: account.email, name: displayName, rollNo: account.rollNumber, university: account.university, location: { country: account.country, state: account.state, city: account.city } });
      enterApp(student ? "student" : "issuer", student ? "student" : "university");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    }
  };
  const logout = async () => { try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } finally { setCurrentUser(null); setActiveTab("verifier"); setPortalChoice(null); goTo("portals"); } };
  const sha256 = async (file: File) => { const buffer = await file.arrayBuffer(); const digest = await crypto.subtle.digest("SHA-256", buffer); return `0x${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`; };
  const verifyAgainstBackend = async (query: string, source: VerificationEvent["source"], fileName?: string) => {
    setVerification("hashing");
    if (fileName) setVerifierFileName(fileName);
    try {
      const result = await credentialApi.verify(query);
      setVerifiedHash(result.fileHash || query);
      if (result.valid) {
        setIssuer({
          address: result.ownerAddress || "",
          name: result.recipientName || "",
          degree: result.documentTitle || "",
        });
        setVerification("verified");
        setVerificationEvents((events) => [...events, { id: crypto.randomUUID(), state: "verified", source, at: Date.now() }]);
      } else {
        setVerification("tampered");
        setVerificationEvents((events) => [...events, { id: crypto.randomUUID(), state: "tampered", source, at: Date.now() }]);
      }
      return result;
    } catch (error) {
      setVerification("tampered");
      setAuthError("");
      setBackendError(error instanceof Error ? error.message : "Verification service unavailable.");
      setVerificationEvents((events) => [...events, { id: crypto.randomUUID(), state: "tampered", source, at: Date.now() }]);
      return null;
    }
  };
  const processVerification = async (file: File, source: VerificationEvent["source"] = "file") => {
    setVerifierFileName(file.name);
    const scannedHash = await sha256(file);
    await verifyAgainstBackend(scannedHash, source, file.name);
  };
  const onVerifierFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void processVerification(file); };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void processVerification(file); };
  const onIssuerFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIssuerFileName("Computing SHA-256…");
    setIssuerHash(await sha256(file));
    setIssuerFileName(file.name);
  };
  const connectWallet = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setBackendError("No browser wallet detected. Install MetaMask or another EIP-1193 wallet.");
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0] || "";
      if (!address) throw new Error("No wallet account was returned.");
      setWalletAddress(address);
      setWalletConnected(true);
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13882" }] });
      } catch (switchError: any) {
        if (switchError?.code === 4902) {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x13882",
              chainName: "Polygon Amoy",
              nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
              rpcUrls: ["https://rpc-amoy.polygon.technology"],
              blockExplorerUrls: ["https://amoy.polygonscan.com"],
            }],
          });
        }
      }
    } catch (error) {
      setWalletConnected(false);
      setBackendError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  };
  const mintCredential = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!walletConnected) return connectWallet();
    if (!issuer.address || !issuer.name.trim() || !issuer.degree.trim()) return window.alert("Enter the recipient wallet, name, and degree.");
    if (!issuerHash) return window.alert("Upload the certificate PDF so its SHA-256 hash can be anchored.");
    setMintStep(1);
    setBackendError("");
    try {
      const response = await credentialApi.issue({
        recipientAddress: issuer.address.trim(),
        recipientName: issuer.name.trim(),
        documentTitle: issuer.degree.trim(),
        issuerName: currentUser?.name || "Verified Issuer",
        template: certificateTemplate,
        fileHash: issuerHash,
      });
      setMintStep(3);
      void credentialApi.registry().then(setRegistry).catch(() => undefined);
      setPortfolio((records) => [...records, {
        title: response.record.documentTitle,
        institution: response.record.issuerName,
        date: response.record.issuedAt,
        hash: response.record.fileHash,
        token: `#${response.tokenId}`,
        recipient: response.record.recipientName.trim().toLowerCase(),
        template: certificateTemplate,
      }]);
      window.alert(`Identity document minted successfully as token #${response.tokenId}.`);
    } catch (error) {
      setMintStep(0);
      setBackendError(error instanceof Error ? error.message : "Credential issuance failed.");
    }
  };
  const verified = verificationEvents.filter((event) => event.state === "verified").length; const failures = verificationEvents.filter((event) => event.state === "tampered").length; const camera = verificationEvents.filter((event) => event.source === "camera").length;
  const studentPortfolio = currentUser?.role === "student" ? portfolio.filter((record) => record.recipient === currentUser.name.trim().toLowerCase()) : [];
  useEffect(() => {
    if (activeTab !== "verifier" || (portalChoice !== "guest" && portalChoice !== null)) return;
    const verifierTitle = document.querySelector(".desk-heading h1");
    if (verifierTitle) {
      verifierTitle.textContent = "Credential Verification System";
      verifierTitle.setAttribute("aria-label", "Credential Verification System");
    }
  });
  const replayWordmarkSequence = () => { setWordmarkAtRest(false); wordmarkRef.current?.style.setProperty("--imprint-dot-x", "0px"); wordmarkRef.current?.style.setProperty("--imprint-dot-y", "0px"); setWordmarkSequence((sequence) => sequence + 1); };
  const updateLandingScene = (event: PointerEvent<HTMLElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - bounds.left) / bounds.width - .5) * 2; const y = ((event.clientY - bounds.top) / bounds.height - .5) * 2; if (wordmarkAtRest) { wordmarkRef.current?.style.setProperty("--imprint-dot-x", `${x * 22}px`); wordmarkRef.current?.style.setProperty("--imprint-dot-y", `${y * 18}px`); } setLandingTilt({ x, y }); setScene((current) => ({ ...current, x, y })); };
  const pulseLandingScene = (event: PointerEvent<HTMLElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); setScene((current) => ({ ...current, pulse: current.pulse + 1, pulseX: (event.clientX - bounds.left) / bounds.width * 100, pulseY: (event.clientY - bounds.top) / bounds.height * 100 })); };

  const replaceDirectText = (element: Element | null, text: string) => {
    if (!element) return;
    Array.from(element.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE).forEach((child) => child.remove());
    element.append(document.createTextNode(` ${text}`));
  };
  useEffect(() => {
    if (page === "portals") {
      const portalHeading = document.querySelector(".portal-wrap > h1");
      const portalIntro = document.querySelector(".portal-intro");
      const routeLabel = document.querySelector(".route-label");
      if (portalHeading) portalHeading.textContent = "Choose the proof desk that matches your identity evidence.";
      if (portalIntro) portalIntro.textContent = "Anchor Bound preserves records for people, issuers, organisations, and independent verifiers. Use it for educational credentials, government identity records, work credentials, organisation records, and personal proofs.";
      if (routeLabel) routeLabel.textContent = "Routing lane / choose a public or issuer desk";
      const portalCopy = [
        ["Personal Identity Vault", "Store and share your education, government, work, organisation, and personal identity proofs.", "Open identity vault"],
        ["Verified Issuer Desk", "Issue trusted records for schools, colleges, companies, public agencies, and organisations.", "Open issuer desk"],
        ["Public Verifier", "Check any supported document, hash, or live QR proof without creating an account.", "Run public verification"],
      ];
      document.querySelectorAll<HTMLElement>(".portal-card").forEach((card, index) => {
        const [title, description, action] = portalCopy[index] ?? portalCopy[2];
        const heading = card.querySelector("h2"); const paragraph = card.querySelector("p"); const actionLabel = card.querySelector("b");
        if (heading) heading.textContent = title;
        if (paragraph) paragraph.textContent = description;
        replaceDirectText(actionLabel, action);
      });
    }
    document.querySelectorAll<HTMLButtonElement>(".auth-switch button").forEach((button, index) => replaceDirectText(button, index === 0 ? "Public Holder" : "Verified Issuer"));
    const authTitle = document.querySelector(".auth-card > h1");
    if (authTitle) authTitle.textContent = authAction === "signup" ? (authRole === "student" ? "Public Holder Registration" : "Verified Issuer Registration") : (authRole === "student" ? "Personal Identity Vault" : "Verified Issuer Desk");
    document.querySelectorAll<HTMLLabelElement>(".auth-card .field-label").forEach((field) => {
      const label = field.querySelector("span"); const input = field.querySelector<HTMLInputElement>("input"); const labelText = label?.textContent?.trim();
      if (labelText === "Official University Email" || labelText === "Official Faculty Email") { if (label) label.textContent = "Email address"; if (input) input.placeholder = "you@example.com"; }
      if (labelText === "Student ID" && authAction === "signin" && authRole === "student") { field.style.display = "none"; if (input) { input.required = false; input.disabled = true; input.value = ""; } }
      if (labelText === "University Faculty Code") { if (label) label.textContent = "Issuer access code"; if (input) { input.placeholder = "Enter your faculty access code"; input.type = "password"; } }
    });
    document.querySelectorAll<HTMLElement>(".auth-card .security-note").forEach((note) => { note.style.display = authAction === "signin" && authRole === "student" ? "none" : ""; });
    document.querySelectorAll<HTMLElement>(".app-brand small").forEach((element) => { element.textContent = "Identity & Credential Provenance Protocol"; });
    document.querySelectorAll<HTMLElement>(".auth-poster p:not(.mono-label)").forEach((element) => { element.textContent = "Secure access for public holders and verified issuers."; });
    replaceDirectText(document.querySelector(".auth-submit"), authRole === "student" ? "Sign in as public holder" : "Sign in as verified issuer");
    if (page === "auth" && authAction === "signup" && authRole === "student") {
      const finalSignupStep = document.querySelector(".signup-steps span:last-of-type");
      if (finalSignupStep) finalSignupStep.textContent = "3. Identity evidence";
    }
    if (page === "app" && portalChoice === "student") {
      const holderRailLabel = document.querySelector<HTMLElement>(".rail-tab span"); if (holderRailLabel) holderRailLabel.textContent = "Identity Vault";
      const vaultHeading = document.querySelector(".desk-heading h1"); const vaultDescription = document.querySelector(".desk-heading > p:last-child");
      if (vaultHeading) vaultHeading.textContent = "Your Identity Vault";
      if (vaultDescription) vaultDescription.textContent = "Your verified education, government, employment, organisation, and personal identity proofs appear in this private record view.";
    }
    if (page === "landing") {
      const landingProof = document.querySelector(".landing-proof"); const heroLabel = document.querySelector(".hero-label"); const heroDetail = document.querySelector(".landing-art .mono-label");
      if (landingProof) landingProof.textContent = "Every trusted identity record can be sealed with a cryptographic fingerprint—so its provenance travels with it and altered documents are easier to detect.";
      if (heroLabel) heroLabel.textContent = "Public record desk / identity provenance protocol";
      if (heroDetail) heroDetail.textContent = "Live identity proof / verified provenance";
      replaceDirectText(document.querySelector(".button-row .ink-button"), "Choose a proof desk");
    }
    if (page === "app" && (portalChoice === "guest" || portalChoice === null) && activeTab === "verifier") {
      const verifierDescription = document.querySelector(".desk-heading > p:last-child");
      if (verifierDescription) verifierDescription.textContent = "Check an identity document, credential, document hash, or live QR proof against recorded provenance.";
    }
    const visibleError = document.querySelector(".form-error");
    if (visibleError && authRole === "professor") visibleError.textContent = "Enter a valid verified issuer access code to continue.";
  }, [page, authAction, authRole, activeTab, portalChoice, authError]);
  useEffect(() => {
    const authForm = document.querySelector<HTMLFormElement>(".auth-card");
    if (!authForm || page !== "auth" || authAction !== "signup" || authRole !== "professor" || signupStep !== 3) return;
    const heading = authForm.querySelector(".signup-fields h3"); const description = authForm.querySelector(".signup-fields > div > p");
    if (heading) heading.textContent = "Register the issuing organisation";
    if (description) description.textContent = "Schools, colleges, companies, public agencies, and registered organisations can prepare their issuing identity here.";
    const finalSignupStep = document.querySelector(".signup-steps span:last-of-type"); if (finalSignupStep) finalSignupStep.textContent = "3. Issuing organisation";
    authForm.querySelectorAll<HTMLLabelElement>(".field-label").forEach((field) => {
      const label = field.querySelector("span"); const input = field.querySelector<HTMLInputElement>("input"); const select = field.querySelector<HTMLSelectElement>("select"); const labelText = label?.textContent?.trim();
      if (labelText === "University Name") { if (label) label.textContent = "Issuing organisation type"; if (select) { select.replaceChildren(...["School, college or university", "Company or employer", "Government agency", "Registered organisation"].map((name) => { const option = document.createElement("option"); option.value = name; option.textContent = name; return option; })); select.value = signup.university || ""; select.addEventListener("change", () => updateSignup({ university: select.value })); } }
      if (labelText === "University Code") { if (label) label.textContent = "Issuer registration code"; if (input) input.placeholder = "Enter issuer registration code"; }
    });
  }, [page, authAction, authRole, signupStep]);
  useEffect(() => {
    if (page !== "app") return;
    if (portalChoice === "university") {
      const issuerRailLabel = document.querySelector<HTMLElement>(".rail-tab span"); if (issuerRailLabel) issuerRailLabel.textContent = "Issuer Desk";
      const guardHeading = document.querySelector(".guard-sheet h2"); const guardText = document.querySelector(".guard-sheet p");
      if (guardHeading) guardHeading.textContent = "Verified Issuer Access Required";
      if (guardText) guardText.textContent = "Issuing tamper-evident identity documents requires a verified organisation or public-authority account.";
      replaceDirectText(document.querySelector(".guard-sheet .ink-button"), "Sign in as verified issuer");
      const batchHeading = document.querySelector(".batch-panel h2"); const batchText = document.querySelector(".batch-panel > p");
      if (batchHeading) batchHeading.textContent = "Batch Identity Document Upload (CSV / Excel)";
      if (batchText) batchText.textContent = "Upload structured holder metadata to issue multiple verified identity documents in one authorised wallet transaction.";
      replaceDirectText(document.querySelector(".batch-drop .ink-button"), "Load sample identity batch");
    }
    if (portalChoice === "student") {
      const emptyHeading = document.querySelector(".empty-portfolio h2"); const emptyText = document.querySelector(".empty-portfolio p");
      if (emptyHeading) emptyHeading.textContent = "No identity proofs yet";
      if (emptyText) emptyText.textContent = "No verified identity documents are associated with this personal vault yet. Proofs appear when a verified issuer records them for you.";
      const studentGuardHeading = document.querySelector(".guard-sheet h2"); const studentGuardText = document.querySelector(".guard-sheet p");
      if (studentGuardHeading) studentGuardHeading.textContent = "Public Holder Account Required";
      if (studentGuardText) studentGuardText.textContent = "Sign in with your public-holder account to view and share your verified identity documents.";
    }
    if (portalChoice === "guest" || portalChoice === null) {
      const verifierHeading = document.querySelector(".desk-heading h1");
      if (verifierHeading) verifierHeading.textContent = "Identity & Document Verification System";
      const resultHeading = document.querySelector(".verification-result h2");
      if (resultHeading) resultHeading.textContent = "Authentic Identity Document";
    }
  }, [page, activeTab, portalChoice, verification]);
  useEffect(() => {
    const authForm = document.querySelector<HTMLFormElement>(".auth-card");
    if (!authForm || page !== "auth" || authAction !== "signup" || authRole !== "student" || signupStep !== 3) return;
    authForm.querySelectorAll<HTMLLabelElement>(".field-label").forEach((label) => { label.style.removeProperty("display"); });
    authForm.querySelectorAll(".general-document-fields").forEach((element) => element.remove());
    const profile = documentProfiles[signup.documentCategory];
    const heading = authForm.querySelector(".signup-fields h3");
    const description = authForm.querySelector(".signup-fields > div > p");
    if (heading) heading.textContent = `Confirm your ${profile.label.toLowerCase()}`;
    if (description) description.textContent = "The required fields adjust to the identity evidence you choose. Education records keep their existing academic identifiers.";
    const labels = Array.from(authForm.querySelectorAll<HTMLLabelElement>(".field-label"));
    labels.forEach((label) => {
      const title = label.querySelector("span")?.textContent?.trim();
      if (["University Name", "University Roll Number", "Student ID", "University Code"].includes(title || "")) label.style.display = signup.documentCategory === "education" ? "" : "none";
    });
    authForm.querySelectorAll<HTMLElement>(".security-note").forEach((note) => { note.style.display = signup.documentCategory === "education" ? "" : "none"; });
    const fields = document.createElement("section");
    fields.className = "general-document-fields";
    const categoryLabel = document.createElement("label"); categoryLabel.className = "field-label";
    const categoryText = document.createElement("span"); categoryText.textContent = "Identity evidence type";
    const categorySelect = document.createElement("select"); categorySelect.name = "identity-evidence-type";
    (Object.keys(documentProfiles) as DocumentCategory[]).forEach((category) => { const option = document.createElement("option"); option.value = category; option.textContent = documentProfiles[category].label; option.selected = category === signup.documentCategory; categorySelect.append(option); });
    categorySelect.addEventListener("change", () => updateSignup({ documentCategory: categorySelect.value as DocumentCategory }));
    categoryLabel.append(categoryText, categorySelect); fields.append(categoryLabel);
    if (signup.documentCategory !== "education") profile.fields.forEach((field) => {
      const label = document.createElement("label"); label.className = "field-label";
      const title = document.createElement("span"); title.textContent = field.label;
      const input = document.createElement("input"); input.required = true; input.name = `public-holder-${field.key}`; input.type = field.type || "text"; input.placeholder = field.placeholder || ""; input.value = signup[field.key] || ""; input.autocomplete = "off";
      input.addEventListener("input", () => updateSignup({ [field.key]: input.value })); label.append(title, input); fields.append(label);
    });
    const actions = authForm.querySelector(".two-actions");
    actions?.before(fields);
  }, [page, authAction, authRole, signupStep, signup.documentCategory]);
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(".issue-form");
    const preview = document.querySelector<HTMLElement>(".certificate-preview");
    if (!form || !preview || page !== "app" || activeTab !== "issuer" || portalChoice !== "university") return;
    form.querySelectorAll(".issuer-document-fields").forEach((element) => element.remove());
    const profile = documentProfiles[issuerDocumentCategory];
    const heading = form.querySelector("h2"); const description = form.querySelector("p");
    if (heading) heading.textContent = "Mint a verified identity document";
    if (description) description.textContent = "Create a tamper-evident proof for people, organisations, and public records.";
    const issuerIntro = document.querySelector(".desk-heading > p:last-child");
    if (issuerIntro) issuerIntro.textContent = `Authorised issuer: ${currentUser?.name || "Verified issuer"}`;
    form.querySelectorAll<HTMLLabelElement>(".field-label").forEach((label) => {
      const title = label.querySelector("span")?.textContent?.trim();
      if (title === "Student Wallet Address") label.querySelector("span")!.textContent = "Holder wallet address";
      if (title === "Student Name") label.querySelector("span")!.textContent = "Document holder name";
      if (title === "Degree Program") label.querySelector("span")!.textContent = profile.subjectLabel;
      if (title === "Certificate Template") label.querySelector("span")!.textContent = "Proof template";
      if (title === "Certificate PDF File") label.querySelector("span")!.textContent = "Source document PDF";
    });
    const fields = document.createElement("section"); fields.className = "issuer-document-fields";
    const categoryLabel = document.createElement("label"); categoryLabel.className = "field-label";
    const categoryText = document.createElement("span"); categoryText.textContent = "Document category";
    const categorySelect = document.createElement("select"); categorySelect.name = "issuer-document-category";
    (Object.keys(documentProfiles) as DocumentCategory[]).forEach((category) => { const option = document.createElement("option"); option.value = category; option.textContent = documentProfiles[category].label; option.selected = category === issuerDocumentCategory; categorySelect.append(option); });
    categorySelect.addEventListener("change", () => setIssuerDocumentCategory(categorySelect.value as DocumentCategory)); categoryLabel.append(categoryText, categorySelect); fields.append(categoryLabel);
    profile.fields.forEach((field) => {
      const label = document.createElement("label"); label.className = "field-label";
      const title = document.createElement("span"); title.textContent = field.label;
      const input = document.createElement("input"); input.required = true; input.name = `issuer-${field.key}`; input.type = field.type || "text"; input.placeholder = field.placeholder || ""; input.value = issuerMetadata[field.key] || "";
      input.addEventListener("input", () => setIssuerMetadata((metadata) => ({ ...metadata, [field.key]: input.value }))); label.append(title, input); fields.append(label);
    });
    form.querySelector(".hash-readout")?.before(fields);
    const tag = preview.querySelector(".preview-tag"); const label = preview.querySelector(".mono-label"); const previewSentence = preview.querySelector("p:not(.mono-label)");
    if (tag) tag.textContent = `${profile.label} / ${tag.textContent?.split("/").at(-1)?.trim() || "Archive Seal"}`;
    if (label) label.textContent = "Official identity proof";
    if (previewSentence) previewSentence.textContent = profile.previewSentence;
    const previewSubject = preview.querySelector("strong"); if (previewSubject && !issuer.degree) previewSubject.textContent = profile.label;
    replaceDirectText(form.querySelector(".auth-submit"), "Mint identity proof");
  }, [page, activeTab, portalChoice, issuerDocumentCategory]);
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(".issue-form");
    const preview = document.querySelector<HTMLElement>(".certificate-preview");
    if (!form || !preview || page !== "app" || activeTab !== "issuer" || portalChoice !== "university") return;
    const designs: Record<CertificateTemplate, { name: string; descriptor: string; serial: string; mark: string }> = {
      archive: { name: "Archive Seal", descriptor: "Field ledger / archival seal", serial: "AB / ARCHIVE / 01", mark: "Filed" },
      ledger: { name: "Cobalt Ledger", descriptor: "Structured record / cobalt columns", serial: "AB / LEDGER / 02", mark: "Indexed" },
      diploma: { name: "Veritas Diploma", descriptor: "Formal award / crest and ribbon", serial: "AB / DIPLOMA / 03", mark: "Conferred" },
      folio: { name: "Ember Folio", descriptor: "Editorial folio / vermilion margin", serial: "AB / FOLIO / 04", mark: "Signed" },
      marble: { name: "Marble Authority", descriptor: "Stone paper / authority seal", serial: "AB / MARBLE / 05", mark: "Recorded" },
      noir: { name: "Noir Index", descriptor: "Night dossier / chartreuse cipher", serial: "AB / NOIR / 06", mark: "Classified" },
    };
    const selected = designs[certificateTemplate];
    preview.dataset.template = certificateTemplate;
    preview.querySelectorAll(".template-serial,.template-ribbon,.template-corner,.template-watermark").forEach((element) => element.remove());
    const serial = document.createElement("span"); serial.className = "template-serial"; serial.textContent = selected.serial;
    const ribbon = document.createElement("span"); ribbon.className = "template-ribbon"; ribbon.textContent = selected.mark;
    const corner = document.createElement("span"); corner.className = "template-corner"; corner.textContent = "AB";
    const watermark = document.createElement("span"); watermark.className = "template-watermark"; watermark.textContent = certificateTemplate === "noir" ? "N" : "A";
    preview.append(serial, ribbon, corner, watermark);
    const tag = preview.querySelector(".preview-tag"); if (tag) tag.textContent = selected.descriptor;
    form.querySelectorAll(".template-gallery").forEach((element) => element.remove());
    const selector = form.querySelector<HTMLSelectElement>('select:not([name="issuer-document-category"])');
    if (!selector) return;
    Array.from(selector.options).forEach((option) => { const design = designs[option.value as CertificateTemplate]; if (design) option.textContent = design.name; });
    const gallery = document.createElement("section"); gallery.className = "template-gallery"; gallery.setAttribute("aria-label", "Proof template gallery");
    gallery.innerHTML = `<div class="template-gallery-head"><span>Choose visual proof layout</span><small>${selected.descriptor}</small></div><div class="template-options">${(Object.keys(designs) as CertificateTemplate[]).map((key) => `<button type="button" class="template-choice template-choice-${key} ${key === certificateTemplate ? "is-active" : ""}" data-template="${key}"><span class="template-choice-art"><i></i><b>${designs[key].mark}</b></span><strong>${designs[key].name}</strong><small>${designs[key].descriptor}</small></button>`).join("")}</div>`;
    selector.closest(".field-label")?.after(gallery);
    gallery.querySelectorAll<HTMLButtonElement>("[data-template]").forEach((button) => button.addEventListener("click", () => setCertificateTemplate(button.dataset.template as CertificateTemplate)));
  }, [page, activeTab, portalChoice, certificateTemplate]);
  // @ts-ignore Browser-created form controls narrow their event targets at runtime within the control-desk effect.
  useEffect(() => {
    if (page !== "app" || activeTab !== "registry") return;
    const desk = document.querySelector(".registry-panel")?.closest(".desk");
    if (!desk || desk.querySelector(".security-control-desk")) return;
    const holderDid = currentUser ? `did:anchorbound:${currentUser.id.replace(/[^a-z0-9]/gi, "").slice(0, 14).toLowerCase() || "holder"}:a91f` : "did:anchorbound:public:7c2b9a91";
    const roles = {
      Admin: { summary: "Full identity, role-policy, asset-minting, allocation, transfer, and audit authority.", permissions: ["Create decentralized identities", "Assign roles and access policies", "Mint and allocate assets", "Approve controlled transfers", "Review immutable audit history"] },
      Manager: { summary: "Operational identity and asset allocation authority under an administrator-approved policy.", permissions: ["Register identities", "Allocate approved assets", "Request controlled transfers", "View assigned audit history"] },
      Auditor: { summary: "Read-only oversight authority for identity, ownership, and access-control evidence.", permissions: ["Verify decentralized IDs", "Inspect ownership history", "Review policy changes", "Export audit evidence"] },
      User: { summary: "Self-service holder access for viewing identity proofs and assets allocated to their DID.", permissions: ["View own decentralized ID", "View allocated assets", "Share verification proofs"] },
    } as const;
    type ConsoleRole = keyof typeof roles;
    let activeRole: ConsoleRole = "Admin";
    let assetIndex = 3;
    const assets = [
      { id: "AB-AX-0102", name: "Facility access pass", className: "Access asset", owner: holderDid, status: "Allocated" },
      { id: "AB-AX-0103", name: "Device custody record", className: "Ownership asset", owner: "did:anchorbound:operations:2d8e", status: "Allocated" },
    ];
    const controlDesk = document.createElement("section");
    controlDesk.className = "security-control-desk";
    controlDesk.innerHTML = `<header class="security-desk-head"><div><span class="evidence-label">Blockchain identity / access / assets</span><h2>Trust Control Desk</h2><p>Front-end workflow prototype for decentralized identity, role permissions, controlled asset ownership, and append-only audit evidence.</p></div><span class="security-prototype">Front-end simulation · no live contract call</span></header><div class="security-identity-band"><div class="did-mark"><span>DID</span><b>Decentralized identity</b></div><div><span class="mono-label">Active identifier</span><strong>${holderDid}</strong><small>Cryptographic-proof and blockchain anchoring are represented here as UI states only.</small></div><button type="button" class="line-button" data-action="rotate-did">Rotate proof key</button></div><div class="security-grid"><article class="security-panel role-policy-panel"><div class="panel-kicker"><span>01 / Role-based access</span><b data-role-badge>Admin</b></div><h3>Policy authority</h3><div class="role-button-row">${(Object.keys(roles) as ConsoleRole[]).map((role) => `<button type="button" class="role-button ${role === "Admin" ? "is-active" : ""}" data-role="${role}">${role}</button>`).join("")}</div><p class="role-summary" data-role-summary>${roles.Admin.summary}</p><ul class="permission-list" data-permissions>${roles.Admin.permissions.map((permission) => `<li><Check size="12"></Check>${permission}</li>`).join("")}</ul><div class="policy-editor"><label>Assign policy to role<select data-policy-role>${(Object.keys(roles) as ConsoleRole[]).map((role) => `<option>${role}</option>`).join("")}</select></label><div class="policy-checks"><label><input type="checkbox" checked> Identity registration</label><label><input type="checkbox" checked> Asset allocation</label><label><input type="checkbox"> Asset transfer</label><label><input type="checkbox" checked> Audit review</label></div><button type="button" class="ink-button" data-action="apply-policy">Record permission update</button></div></article><article class="security-panel identity-panel"><div class="panel-kicker"><span>02 / DID proof profile</span><b>Verified format</b></div><h3>Identity evidence</h3><dl class="did-details"><div><dt>DID method</dt><dd>did:anchorbound</dd></div><div><dt>Controller</dt><dd>${currentUser?.name || "Public holder"}</dd></div><div><dt>Proof type</dt><dd>Ed25519VerificationKey</dd></div><div><dt>Resolver</dt><dd>Chain registry interface</dd></div></dl><div class="identity-proof-status"><ShieldCheck size="18" /><span>Proof-ready identity profile</span></div><button type="button" class="line-button" data-action="verify-did">Verify DID proof</button></article></div><section class="asset-ledger-panel"><div class="asset-ledger-head"><div><span class="evidence-label">03 / NFT-style asset ownership</span><h3>Allocate, view, and transfer controlled assets</h3></div><span class="role-gate" data-role-gate>Admin can mint, allocate, and approve transfers.</span></div><div class="asset-list" data-asset-list></div><div class="asset-action-grid"><form data-mint-form class="asset-form"><h4>Mint & allocate asset</h4><label>Asset name<input required name="asset-name" placeholder="e.g. Secure hardware unit"></label><label>Asset class<select name="asset-class"><option>Access asset</option><option>Ownership asset</option><option>Digital license</option><option>Evidence record</option></select></label><label>Recipient DID<input required name="asset-owner" value="${holderDid}" placeholder="did:anchorbound:holder:…"></label><button type="submit" class="ink-button">Mint and allocate</button></form><form data-transfer-form class="asset-form"><h4>Controlled transfer</h4><label>Asset<select required name="transfer-asset" data-transfer-assets></select></label><label>Recipient DID<input required name="transfer-recipient" placeholder="did:anchorbound:recipient:…"></label><p>Transfer requests are role-gated and written to the audit stream before ownership changes.</p><button type="submit" class="line-button">Approve transfer</button></form></div></section><section class="control-audit-panel"><div><span class="evidence-label">04 / append-only activity stream</span><h3>Identity, access, and asset evidence</h3></div><div class="control-message" data-control-message aria-live="polite">Control desk is ready. Select a role, change a policy, or allocate an asset to generate an auditable event.</div><div class="control-audit-list" data-control-audit></div></section>`;
    desk.append(controlDesk);
    const prototypeLabel = controlDesk.querySelector<HTMLElement>(".security-prototype"); if (prototypeLabel) prototypeLabel.textContent = "Protocol state preview · contract connection pending";
    const assetKicker = controlDesk.querySelector<HTMLElement>(".asset-ledger-head .evidence-label"); if (assetKicker) assetKicker.textContent = "03 / controlled asset ownership";
    const auditKicker = controlDesk.querySelector<HTMLElement>(".control-audit-panel .evidence-label"); if (auditKicker) auditKicker.textContent = "04 / proof filing stream";
    const assetList = controlDesk.querySelector<HTMLElement>("[data-asset-list]");
    const transferSelect = controlDesk.querySelector<HTMLSelectElement>("[data-transfer-assets]");
    const auditList = controlDesk.querySelector<HTMLElement>("[data-control-audit]");
    const message = controlDesk.querySelector<HTMLElement>("[data-control-message]");
    const audit = (action: string, target: string, detail: string) => { const item = document.createElement("article"); item.className = "control-audit-item"; item.innerHTML = `<span class="audit-stamp">Recorded</span><div><b>${action}</b><p>${target} · ${detail}</p></div><time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>`; auditList?.prepend(item); };
    const renderAssets = () => {
      if (assetList) assetList.innerHTML = assets.map((asset) => `<article class="asset-record"><div class="asset-token">${asset.id}</div><div><span>${asset.className}</span><h4>${asset.name}</h4><p>Owner DID: <b>${asset.owner}</b></p></div><strong>${asset.status}</strong></article>`).join("");
      if (transferSelect) transferSelect.innerHTML = assets.map((asset) => `<option value="${asset.id}">${asset.id} · ${asset.name}</option>`).join("");
    };
    const canAdminister = () => activeRole === "Admin" || activeRole === "Manager";
    const notify = (text: string, tone: "good" | "warn" = "good") => { if (message) { message.textContent = text; message.dataset.tone = tone; } };
    const updateRole = (role: ConsoleRole) => { activeRole = role; controlDesk.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((button) => button.classList.toggle("is-active", button.dataset.role === role)); const badge = controlDesk.querySelector<HTMLElement>("[data-role-badge]"); const summary = controlDesk.querySelector<HTMLElement>("[data-role-summary]"); const permissions = controlDesk.querySelector<HTMLElement>("[data-permissions]"); const gate = controlDesk.querySelector<HTMLElement>("[data-role-gate]"); if (badge) badge.textContent = role; if (summary) summary.textContent = roles[role].summary; if (permissions) permissions.innerHTML = roles[role].permissions.map((permission) => `<li>✓ ${permission}</li>`).join(""); if (gate) gate.textContent = canAdminister() ? `${role} can mint, allocate, and approve transfers.` : `${role} is restricted to its policy-defined read or holder scope.`; notify(`${role} permission profile loaded.`, "good"); audit("Role context selected", role, "Front-end policy profile reviewed"); };
    controlDesk.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((button) => button.addEventListener("click", () => updateRole(button.dataset.role as ConsoleRole)));
    controlDesk.querySelector<HTMLButtonElement>("[data-action='rotate-did']")?.addEventListener("click", () => { notify("Proof-key rotation recorded as a pending identity operation."); audit("DID key rotation requested", holderDid, "Pending contract authorization"); });
    controlDesk.querySelector<HTMLButtonElement>("[data-action='verify-did']")?.addEventListener("click", () => { notify("DID proof format verified in this browser prototype."); audit("DID proof checked", holderDid, "Verification state confirmed"); });
    controlDesk.querySelector<HTMLButtonElement>("[data-action='apply-policy']")?.addEventListener("click", () => { const selectedRole = controlDesk.querySelector<HTMLSelectElement>("[data-policy-role]")?.value || "User"; if (!canAdminister()) return notify("Only Admin and Manager roles can record permission updates.", "warn"); notify(`Permission policy for ${selectedRole} recorded in the activity stream.`); audit("Permission policy updated", selectedRole, `Authorized by ${activeRole}`); });
    controlDesk.querySelector<HTMLFormElement>("[data-mint-form]")?.addEventListener("submit", (event) => { event.preventDefault(); if (!canAdminister()) return notify("Only Admin and Manager roles can mint or allocate assets.", "warn"); const form = event.currentTarget; const name = new FormData(form).get("asset-name")?.toString().trim() || ""; const className = new FormData(form).get("asset-class")?.toString() || "Digital asset"; const owner = new FormData(form).get("asset-owner")?.toString().trim() || ""; if (!name || !owner) return notify("Provide an asset name and recipient DID before allocation.", "warn"); const id = `AB-AX-${String(1000 + assetIndex++)}`; assets.unshift({ id, name, className, owner, status: "Allocated" }); renderAssets(); form.reset(); const ownerField = form.elements.namedItem("asset-owner") as HTMLInputElement | null; if (ownerField) ownerField.value = holderDid; notify(`${id} minted and allocated to the selected DID.`); audit("Asset minted and allocated", id, `Owner ${owner}`); });
    controlDesk.querySelector<HTMLFormElement>("[data-transfer-form]")?.addEventListener("submit", (event) => { event.preventDefault(); if (!canAdminister()) return notify("Only Admin and Manager roles can approve controlled transfers.", "warn"); const form = event.currentTarget; const assetId = new FormData(form).get("transfer-asset")?.toString() || ""; const recipient = new FormData(form).get("transfer-recipient")?.toString().trim() || ""; const asset = assets.find((entry) => entry.id === assetId); if (!asset || !recipient) return notify("Select an asset and provide a recipient DID.", "warn"); asset.owner = recipient; asset.status = "Transferred"; renderAssets(); form.reset(); notify(`${assetId} transferred under ${activeRole} approval.`); audit("Controlled asset transfer", assetId, `New owner ${recipient}`); });
    renderAssets();
    audit("DID profile provisioned", holderDid, "Identity proof record staged for protocol filing");
    audit("Asset ownership indexed", "AB-AX-0102", "Existing controlled asset linked to DID");
    audit("RBAC policy loaded", "Admin / Manager / Auditor / User", "Role permissions available for review");
  }, [page, activeTab, currentUser]);
  useEffect(() => {
    if (page !== "app" || activeTab !== "registry") return;
    const registryDesk = document.querySelector(".registry-panel")?.closest(".desk");
    const heading = registryDesk?.querySelector(".desk-heading h1"); const description = registryDesk?.querySelector(".desk-heading p"); const label = registryDesk?.querySelector(".desk-heading .evidence-label");
    const panelTitle = registryDesk?.querySelector(".registry-panel h2"); const tableHead = registryDesk?.querySelector(".registry-panel thead"); const tableBody = registryDesk?.querySelector(".registry-panel tbody");
    if (label) label.textContent = "Public proof registry";
    if (heading) heading.textContent = "Identity Registry & Audit Trail";
    if (description) description.textContent = "Review verified issuers, proof filing activity, identity records, controlled asset events, and access-policy changes.";
    if (panelTitle) panelTitle.textContent = "Verified Issuer Registry";
    if (tableHead) tableHead.innerHTML = "<tr><th>Verified issuer</th><th>Proofs filed</th><th>Status</th></tr>";
    if (tableBody) tableBody.innerHTML = "<tr><td>Northstar Civil Registry</td><td>412</td><td><b>Active</b></td></tr><tr><td>Aperture Facilities Group</td><td>890</td><td><b>Active</b></td></tr><tr><td>Meridian Learning Trust</td><td>540</td><td><b>Active</b></td></tr>";
  }, [page, activeTab]);
  useEffect(() => {
    const desk = document.querySelector<HTMLElement>(".desk");
    const tabs = desk?.querySelector<HTMLElement>(".verify-tabs");
    if (!desk || !tabs || page !== "app" || activeTab !== "verifier" || (portalChoice !== "guest" && portalChoice !== null)) return;
    desk.querySelectorAll(".identity-intake").forEach((element) => element.remove());
    const existingTab = tabs.querySelector<HTMLButtonElement>("[data-identity-intake]");
    const identityTab = existingTab || document.createElement("button");
    if (!existingTab) { identityTab.type = "button"; identityTab.dataset.identityIntake = "true"; identityTab.textContent = "Government ID Intake"; tabs.append(identityTab); }
    identityTab.classList.toggle("is-active", verifyMode === "identity");
    identityTab.onclick = () => { setVerification("idle"); setVerifyMode("identity"); };
    if (verifyMode !== "identity") return;
    const priorResult = desk.querySelector<HTMLElement>(".verification-result"); if (priorResult) priorResult.style.display = "none";
    const intake = document.createElement("section");
    intake.className = "identity-intake";
    intake.innerHTML = `<header class="identity-intake-head"><div><span class="evidence-label">Government record / privacy-first intake</span><h2>Verify a government-issued document</h2><p>Choose a document type, confirm consent, enter only a masked reference, then select a redacted document copy to continue.</p></div><span class="intake-status">Local browser step</span></header><div class="identity-intake-grid"><aside class="identity-privacy-card"><span class="privacy-mark">01</span><h3>Do not provide biometric data</h3><p>This front end does not read, store, compare, or transmit fingerprints, iris scans, face templates, or other biometric data.</p><ul><li>Use a redacted copy where permitted.</li><li>Keep only the minimum document reference needed.</li><li>A secure verification service is required for real validation.</li></ul></aside><form class="government-intake-form"><label>Government document type<select required name="government-document-type"><option value="">Select a document</option><option>Aadhaar-style identity document (redacted copy)</option><option>Passport</option><option>Driving licence</option><option>Voter identity card</option><option>Birth certificate</option><option>Other government-issued certificate</option></select></label><label>Masked document reference<input required name="masked-document-reference" type="password" inputmode="numeric" minlength="4" maxlength="16" autocomplete="off" placeholder="Enter last 4–8 digits only"></label><p class="field-hint">Your typed reference appears as dots and is used only for this browser-side eligibility check.</p><label class="government-upload">Redacted document copy<input required name="government-document-file" type="file" accept="application/pdf,image/png,image/jpeg"/><span data-file-label>Select PDF, PNG, or JPG</span></label><label class="consent-check"><input required name="government-consent" type="checkbox"/> <span>I confirm I am authorised to submit this document and that the selected copy excludes biometric data.</span></label><button type="submit" class="ink-button">Proceed to secure verification <ArrowRight size="14"></ArrowRight></button><p class="intake-result" role="status" aria-live="polite"></p></form></div><footer class="identity-intake-footer"><ShieldCheck size="16"></ShieldCheck><span>Proof filing can continue only after the required consent and local intake checks are complete.</span></footer>`;
    desk.append(intake);
    const deskTitle = desk.querySelector<HTMLElement>(".desk-heading h1"); if (deskTitle) deskTitle.textContent = "Proof Filing & Verification Desk";
    const submitButton = intake.querySelector<HTMLButtonElement>(".government-intake-form .ink-button"); if (submitButton) submitButton.textContent = "File proof for secure verification";
    const upload = intake.querySelector<HTMLInputElement>('input[type="file"]'); const fileLabel = intake.querySelector<HTMLElement>("[data-file-label]"); const result = intake.querySelector<HTMLElement>(".intake-result");
    upload?.addEventListener("change", () => { if (fileLabel) fileLabel.textContent = upload.files?.[0]?.name || "Select PDF, PNG, or JPG"; });
    intake.querySelector<HTMLFormElement>(".government-intake-form")?.addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget; const documentType = new FormData(form).get("government-document-type")?.toString(); const maskedReference = new FormData(form).get("masked-document-reference")?.toString() || ""; const file = upload?.files?.[0]; const consent = form.querySelector<HTMLInputElement>('input[name="government-consent"]')?.checked; if (!documentType || maskedReference.length < 4 || !file || !consent) { if (result) { result.dataset.tone = "error"; result.textContent = "Select a document, provide a 4–16 character masked reference, choose a redacted file, and confirm consent before continuing."; } return; } if (result) { result.dataset.tone = "success"; result.textContent = "Local intake complete. No biometric data was processed or stored. Continue with a connected secure verification service for actual document validation."; } });
  }, [page, activeTab, portalChoice, verifyMode]);

  return <div className={lightTheme ? "postprint-theme" : "postprint-night"}>
    <ParticleCanvas scene={scene} />
    {themeRipple && <span key={themeRipple.id} className={`theme-ripple theme-ripple-${themeRipple.tone}`} style={{ left: themeRipple.x, top: themeRipple.y }} aria-hidden="true" />}
    {page !== "app" && <div className="global-page-actions" aria-label="Page controls">{page !== "landing" && <button type="button" onClick={goBack} className="global-back-button" aria-label="Go back to the previous page"><ArrowLeft size={15} /><span>Back</span></button>}<button type="button" onClick={switchTheme} className="global-theme-button" aria-label="Toggle light and dark mode">{lightTheme ? <Moon size={16} /> : <Sun size={16} />}</button></div>}
    {page === "landing" && <section className="landing-shell full-source-landing" onPointerMove={updateLandingScene} onPointerDown={pulseLandingScene} onPointerLeave={() => { wordmarkRef.current?.style.setProperty("--imprint-x", "0px"); wordmarkRef.current?.style.setProperty("--imprint-y", "0px"); wordmarkRef.current?.style.setProperty("--imprint-dot-x", "0px"); wordmarkRef.current?.style.setProperty("--imprint-dot-y", "0px"); wordmarkRef.current?.style.setProperty("--imprint-rotate", "0deg"); setLandingTilt({ x: 0, y: 0 }); setScene((current) => ({ ...current, x: 0, y: 0 })); }} style={{ "--scene-x": `${scene.x * 18}px`, "--scene-y": `${scene.y * 18}px` } as CSSProperties}>
      <div className="paper-grid" style={{ backgroundImage: `url(${ASSETS.paper})` }} /><div className="landing-scene-ripple" key={scene.pulse} style={{ left: `${scene.pulseX}%`, top: `${scene.pulseY}%` }} />
      <button onClick={switchTheme} className="theme-button landing-theme" aria-label="Toggle color theme">{lightTheme ? <Moon size={16} /> : <Sun size={16} />}</button>
      <div className="landing-layout"><section className="landing-copy"><button type="button" className={`seal-control ${isSealDragging ? "is-dragging" : ""}`} aria-label="Rotate or drag Anchor Bound seal" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); sealPointerStartRef.current = { x: event.clientX, angle: sealAngle }; sealDraggedRef.current = false; sealIsDraggingRef.current = true; setIsSealDragging(true); }} onPointerMove={(event) => { if (!sealIsDraggingRef.current) return; const delta = event.clientX - sealPointerStartRef.current.x; if (Math.abs(delta) > 4) sealDraggedRef.current = true; setSealAngle(sealPointerStartRef.current.angle + delta * .75); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); sealIsDraggingRef.current = false; setIsSealDragging(false); }} onPointerCancel={() => { sealIsDraggingRef.current = false; setIsSealDragging(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSealAngle((angle) => angle + 45); } }} onClick={() => { if (!sealDraggedRef.current) setSealAngle((angle) => angle + 45); sealDraggedRef.current = false; }}><span style={{ transform: `rotate(${sealAngle}deg)` }}><AnchorSeal large /></span></button><p className="mono-label hero-label">Public record desk / credential protocol</p><AnimatedWordmark elementRef={wordmarkRef} sequence={wordmarkSequence} onReplay={replayWordmarkSequence} onRest={() => setWordmarkAtRest(true)} /><p className="editorial-line">Proof, printed in public.</p><p className="landing-proof">Every degree we issue is minted as a non-transferable token and sealed with a cryptographic fingerprint on Polygon Amoy — so a forged transcript has nowhere left to hide.</p><div className="button-row"><button onClick={() => goTo("portals")} className="ink-button">Choose your portal <ArrowRight size={16} /></button><button onClick={() => enterApp("verifier", "guest")} className="line-button">Run guest verification</button></div><div className="metrics"><Metric value={String(verificationEvents.length)} label="Checks run" /><Metric value={String(verified)} label="Verified" bordered /><Metric value={String(failures)} label="Failures logged" /></div></section><section className="landing-art" style={{ transform: `perspective(1200px) rotateX(${-landingTilt.y * 2}deg) rotateY(${landingTilt.x * 2}deg)` }}><p className="mono-label">Live credential object / verified provenance</p><div className="art-frame"><img src={ASSETS.hero} alt="Editorial academic credential with archival paper and verification marks" /><span className="art-tag tag-top">ON-CHAIN / 01</span><span className="art-tag tag-bottom">VERIFIED</span></div></section></div>
    </section>}

    {page === "portals" && <section className="portal-shell" style={{ backgroundImage: `url(${ASSETS.paper})` }}><div className="portal-wrap"><header className="portal-top"><button onClick={() => goTo("landing")} className="back-button"><ArrowLeft size={14} /> Back to record desk</button><button onClick={switchTheme} className="theme-button" aria-label="Toggle color theme">{lightTheme ? <Moon size={16} /> : <Sun size={16} />}</button></header><span className="evidence-label">Access routing / 03 distinct workspaces</span><h1>Choose the record desk that matches your work.</h1><p className="portal-intro">Each workspace is deliberately scoped: personal achievements for students, credential issuance for institutions, and independent document checks for guests.</p><div className="route-label">Routing lane / select one authorised desk</div><div className="portal-cards"><button onClick={() => goToAuth("student")} className="portal-card student-card"><span>01 / Student</span><GraduationCap size={34} /><h2>Your Portfolio</h2><p>See only your own academic record and share verified credentials.</p><b>Enter student portal <ArrowRight size={15} /></b></button><button onClick={() => goToAuth("professor")} className="portal-card university-card"><span>02 / University</span><Landmark size={34} /><h2>University Portal</h2><p>Issue credentials with template controls and faculty code access.</p><b>Enter university portal <ArrowRight size={15} /></b></button><button onClick={() => enterApp("verifier", "guest")} className="portal-card guest-card"><span>03 / Guest</span><ShieldCheck size={34} /><h2>Guest Verifier</h2><p>Check a document, hash, or live QR proof without account access.</p><b>Open verifier <ArrowRight size={15} /></b></button></div></div></section>}

    {page === "auth" && <section className="auth-shell" style={{ backgroundImage: `url(${ASSETS.paper})` }}><aside className="auth-poster"><div><p className="mono-label">Anchor Bound / access desk</p><h1>Records<br /><em>need</em> readers.</h1><p>Secure access for verified students and faculty.</p></div><img src={ASSETS.stack} alt="Archival thesis papers, stamps, balance scale, feather, fountain pen and ink desk" /></aside><div className="auth-panel"><form className="auth-card" onSubmit={submitAuth} autoComplete={authAction === "signup" ? "off" : "on"}><AnchorSeal lock /><p className="mono-label">Secure access / public record desk</p><h1>{authAction === "signup" ? (authRole === "student" ? "Student Registration" : "Faculty Registration") : (authRole === "student" ? "Student Portal" : "Faculty Portal")}</h1><div className="auth-switch"><button type="button" onClick={() => setAuthRole("student")} className={authRole === "student" ? "is-active" : ""}><GraduationCap size={14} /> Student</button><button type="button" onClick={() => setAuthRole("professor")} className={authRole === "professor" ? "is-active" : ""}><UsersRound size={14} /> Professor / Faculty</button></div><div className="mode-switch"><button type="button" onClick={() => chooseAuthAction("signin")} className={authAction === "signin" ? "is-active" : ""}>Sign In</button><button type="button" onClick={() => chooseAuthAction("signup")} className={authAction === "signup" ? "is-active" : ""}>Sign Up / Register</button></div>{authAction === "signin" ? <><div className="two-inputs"><FieldLabel label="First Name"><div className="input-icon-wrap"><User /><input required autoComplete="off" value={signin.firstName} onChange={(event) => setSignin({ ...signin, firstName: event.target.value })} placeholder="First name" /></div></FieldLabel><FieldLabel label="Last Name"><div className="input-icon-wrap"><User /><input required autoComplete="off" value={signin.lastName} onChange={(event) => setSignin({ ...signin, lastName: event.target.value })} placeholder="Last name" /></div></FieldLabel></div><FieldLabel label={authRole === "student" ? "Official University Email" : "Official Faculty Email"}><div className="input-icon-wrap"><AtSign /><input required type="email" value={signin.email} onChange={(event) => setSignin({ ...signin, email: event.target.value })} autoComplete="off" placeholder={authRole === "student" ? "student@university.edu" : "faculty@university.edu"} /></div></FieldLabel>{authRole === "student" && <><FieldLabel label="Student ID (education accounts only)"><div className="input-icon-wrap"><KeyRound /><input type="password" name="student-signin-protected-id" autoComplete="off" value={signin.studentId} onChange={(event) => setSignin({ ...signin, studentId: event.target.value })} placeholder="Leave blank unless you registered with an education credential" /></div></FieldLabel><p className="form-note security-note">Only required if your account was registered with an education credential.</p></>}<FieldLabel label="Password"><div className="input-icon-wrap"><KeyRound /><input required type={showSigninPassword ? "text" : "password"} value={signin.password} onChange={(event) => setSignin({ ...signin, password: event.target.value })} autoComplete="off" placeholder="••••••••••••" /><button type="button" onClick={() => setShowSigninPassword((show) => !show)} className="password-toggle">{showSigninPassword ? <X size={14} /> : <UserCheck size={14} />}</button></div></FieldLabel>{authRole === "professor" && <FieldLabel label="University Faculty Code"><div className="input-icon-wrap"><Landmark /><input required value={facultyCode} onChange={(event) => setFacultyCode(event.target.value)} autoComplete="off" placeholder="Enter your faculty access code" /></div></FieldLabel>}<button type="submit" className="ink-button auth-submit"><LockKeyhole size={14} /> Sign in as {authRole === "student" ? "Student" : "Faculty"}</button></> : <><SignupSteps active={signupStep} />{signupStep === 1 && <SignupAccount signup={signup} updateSignup={updateSignup} emailIsValid={emailIsValid} passwordIsStrong={passwordIsStrong} showPassword={showSignupPassword} setShowPassword={setShowSignupPassword} onContinue={() => advanceSignup(2)} canContinue={stepOneValid} />}{signupStep === 2 && <SignupLocation signup={signup} updateSignup={updateSignup} states={availableStates} cities={availableCities} onBack={() => advanceSignup(1)} onContinue={() => advanceSignup(3)} canContinue={stepTwoValid} />}{signupStep === 3 && <SignupUniversity signup={signup} updateSignup={updateSignup} onBack={() => advanceSignup(2)} canSubmit={stepThreeValid} role={authRole} />}</>}{authError && <p className="form-error" role="alert">{authError}</p>}</form></div></section>}

    {page === "app" && <div className="app-shell"><aside className="app-rail"><button onClick={() => setActiveTab(portalChoice === "student" ? "student" : portalChoice === "university" ? "issuer" : "verifier")} className="rail-brand"><AnchorSeal /><span>AB<br /><small>Archive<br />Bound</small></span></button><nav className="rail-nav"><AppTab icon={portalChoice === "student" ? <GraduationCap size={16} /> : portalChoice === "university" ? <Landmark size={16} /> : <ShieldHalf size={16} />} active={activeTab !== "registry"} onClick={() => setActiveTab(portalChoice === "student" ? "student" : portalChoice === "university" ? "issuer" : "verifier")}>{portalChoice === "student" ? "Your Portfolio" : portalChoice === "university" ? "University Portal" : "Guest Verifier"}</AppTab>{(portalChoice === "guest" || portalChoice === null) && <AppTab icon={<Database size={16} />} active={activeTab === "registry"} onClick={() => setActiveTab("registry")}>Audit Registry</AppTab>}</nav><span className="rail-footer">Polygon<br />Amoy<br /><b>+</b></span></aside><section className="workspace"><header className="app-header"><div className="app-header-start"><button className="app-brand" onClick={() => setActiveTab("verifier")}><AnchorSeal /><span><strong>Anchor Bound</strong><small>Soulbound Credential Protocol</small></span></button><button type="button" onClick={goBack} className="navbar-back-button" aria-label="Go back to the previous page"><ArrowLeft size={15} /><span>Back</span></button></div><div className="header-controls"><span className={`backend-status backend-${backendStatus}`} title={backendError || "Credential backend status"}><i /> {backendStatus === "online" ? "Backend online" : backendStatus === "offline" ? "Backend offline" : "Checking backend"}</span><button type="button" onClick={switchTheme} className="navbar-theme-button" aria-label="Toggle light and dark mode">{lightTheme ? <Moon size={16} /> : <Sun size={16} />}</button>{currentUser ? <button onClick={logout} className="session-button"><span>{currentUser.name}</span><LogOut size={14} /></button> : <button onClick={() => goToAuth()} className="session-button"><LockKeyhole size={14} /> Sign In / Register</button>}<button onClick={() => void connectWallet()} className={`wallet-button ${walletConnected ? "is-connected" : ""}`}><Wallet size={14} /> <span>{walletConnected ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Connect Wallet"}</span></button></div></header><main className="app-content"><div className="metric-grid"><StatCard icon={<FileCheck2 size={20} />} label="verification checks" value={String(verificationEvents.length)} /><StatCard icon={<CircleCheck size={20} />} label="verified records" value={String(verified)} /><StatCard icon={<Camera size={20} />} label="camera scans" value={String(camera)} /><StatCard icon={<TriangleAlert size={20} />} label="validation failures" value={String(failures)} danger /></div>{activeTab === "verifier" && (portalChoice === "guest" || portalChoice === null) && <VerifierPortal mode={verifyMode} setMode={setVerifyMode} verification={verification} fileName={verifierFileName} verifiedHash={verifiedHash} onDrop={onDrop} onFile={onVerifierFile} inputRef={fileInputRef} hashQuery={hashQuery} setHashQuery={setHashQuery} onHashQuery={() => { if (hashQuery.trim()) void verifyAgainstBackend(hashQuery.trim(), "hash"); }} onQrScan={() => { setQrCameraActive(true); setQrCameraError(""); }} onQR={() => setModal("qr")} onMetadata={() => setModal("metadata")} issuer={issuer} />}{activeTab === "verifier" && qrCameraError && <p className="form-error">{qrCameraError}</p>}{activeTab === "issuer" && portalChoice === "university" && (currentUser?.role === "professor" ? <IssuerHub issuerTab={issuerTab} setIssuerTab={setIssuerTab} issuer={issuer} setIssuer={setIssuer} issuerFileName={issuerFileName} issuerHash={issuerHash} onIssuerFile={onIssuerFile} walletConnected={walletConnected} onMint={mintCredential} mintStep={mintStep} bulkLoaded={bulkLoaded} setBulkLoaded={setBulkLoaded} professorName={currentUser.name} certificateTemplate={certificateTemplate} setCertificateTemplate={setCertificateTemplate} /> : <AccessGuard variant="issuer" onClick={() => goToAuth("professor")} />)}{activeTab === "student" && portalChoice === "student" && (currentUser?.role === "student" ? <YourPortfolio studentName={currentUser.name} records={studentPortfolio} onQR={() => setModal("qr")} onMetadata={() => setModal("metadata")} /> : <AccessGuard variant="student" onClick={() => goToAuth("student")} />)}{activeTab === "registry" && <AuditRegistry registry={registry} />}</main><footer>Anchor Bound Protocol · Polygon Amoy Testnet · Non-Transferable ERC-721</footer></section></div>}
    {modal === "qr" && <GlassModal title="Verification QR Proof" onClose={() => setModal(null)}><div className="qr-proof"><QRCodeSVG value="https://anchorbound.protocol/verify?hash=0x7f8a93b218" size={150} /></div><p>Scan QR with any camera to verify credential status directly on-chain.</p></GlassModal>}
    {qrCameraActive && <GlassModal title="Live Device Camera" onClose={() => setQrCameraActive(false)}><CameraQrScanner onDetected={(value) => { setQrCameraActive(false); const match = value.match(/[?&](?:hash|token|id)=([^&]+)/i); void verifyAgainstBackend(decodeURIComponent(match?.[1] || value), "camera"); }} onFailure={(message) => { setQrCameraActive(false); setQrCameraError(message); }} /><p>Point your device camera at a credential QR code. The verifier will process the returned record automatically.</p></GlassModal>}
    {modal === "metadata" && <GlassModal title="IPFS Metadata Inspector" onClose={() => setModal(null)} wide><pre>{`{
  "name": "B.S. Cybersecurity - Elena Rostova",
  "description": "Soulbound Credential issued by Stanford University",
  "image": "ipfs://QmXyZ.../cert.png",
  "attributes": [
    { "trait_type": "Student", "value": "Elena Rostova" },
    { "trait_type": "Degree", "value": "B.S. Cybersecurity" },
    { "trait_type": "SHA256 Hash", "value": "0x7f8a93b218..." },
    { "trait_type": "Soulbound", "value": true }
  ]
}`}</pre></GlassModal>}
  </div>;
}

function Metric({ value, label, bordered = false }: { value: string; label: string; bordered?: boolean }) { return <div className={`metric ${bordered ? "metric-bordered" : ""}`}><span className="metric-value">{value}</span><span className="mono-label">{label}</span></div>; }
function AppTab({ icon, active, onClick, children }: { icon: ReactNode; active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rail-tab ${active ? "is-active" : ""}`}>{icon}<span>{children}</span></button>; }
function FieldLabel({ label, children }: { label: string; children: ReactNode }) { return <label className="field-label"><span>{label}</span>{children}</label>; }
function SignupSteps({ active }: { active: number }) { return <div className="signup-steps"><span className={active === 1 ? "active" : ""}>1. Account</span><i /><span className={active === 2 ? "active" : ""}>2. Location</span><i /><span className={active === 3 ? "active" : ""}>3. University</span></div>; }

function SignupAccount({ signup, updateSignup, emailIsValid, passwordIsStrong, showPassword, setShowPassword, onContinue, canContinue }: { signup: Record<string, string>; updateSignup: (updates: Record<string, string>) => void; emailIsValid: boolean; passwordIsStrong: boolean; showPassword: boolean; setShowPassword: (value: boolean | ((previous: boolean) => boolean)) => void; onContinue: () => void; canContinue: boolean }) {
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((seconds) => (seconds > 0 ? seconds - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);
  const sendOtp = async () => {
    setOtpSending(true);
    setOtpError("");
    try {
      const response = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: signup.email, firstName: signup.firstName }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to send verification code.");
      setOtpSent(true);
      setResendCooldown(30);
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : "Failed to send verification code.");
    } finally {
      setOtpSending(false);
    }
  };
  const otpButtonLabel = otpSending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : otpSent ? "Resend OTP" : "Send 6-digit OTP";
  const otpHelperText = otpError || (otpSent ? `We sent a 6-digit verification code to ${signup.email}. Enter it above — it expires in 10 minutes.` : "Send a six-digit code to verify this email address.");
  return <div className="signup-fields"><div><h3>Create your account</h3><p>Complete each field in order to continue to the next step.</p></div><div className="two-inputs"><FieldLabel label="First Name"><div className="input-icon-wrap"><User /><input autoComplete="given-name" value={signup.firstName} onChange={(event) => updateSignup({ firstName: event.target.value })} placeholder="e.g. Elena" /></div></FieldLabel><FieldLabel label="Last Name"><div className="input-icon-wrap"><User /><input autoComplete="family-name" value={signup.lastName} onChange={(event) => updateSignup({ lastName: event.target.value })} placeholder="e.g. Rostova" /></div></FieldLabel></div><FieldLabel label="Email Address"><div className="input-icon-wrap"><Mail /><input disabled={!signup.firstName.trim() || !signup.lastName.trim()} autoComplete="email" type="email" value={signup.email} onChange={(event) => updateSignup({ email: event.target.value })} placeholder="you@university.edu" /></div></FieldLabel><FieldLabel label="Password"><div className="input-icon-wrap"><KeyRound /><input disabled={!emailIsValid} type={showPassword ? "text" : "password"} autoComplete="new-password" value={signup.password} onChange={(event) => updateSignup({ password: event.target.value })} aria-invalid={Boolean(signup.password) && !passwordIsStrong} placeholder="8+ characters, Aa1!" /><button type="button" onClick={() => setShowPassword((shown) => !shown)} className="password-toggle">{showPassword ? <X size={14} /> : <UserCheck size={14} />}</button></div></FieldLabel><p className="form-note">Use 8+ characters with an uppercase letter, lowercase letter, number, and special symbol.</p><div className="otp-heading"><span>Email verification OTP</span><button type="button" className="otp-send-button" disabled={!emailIsValid || otpSending || resendCooldown > 0} onClick={sendOtp}>{otpButtonLabel}</button></div><FieldLabel label="6-digit email OTP"><div className="input-icon-wrap"><LockKeyhole /><input disabled={!otpSent} name="account-email-otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={signup.otp} onChange={(event) => updateSignup({ otp: event.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="Enter 6-digit OTP" /></div></FieldLabel><p className={`form-note security-note ${otpError ? "form-error" : ""}`} aria-live="polite">{otpHelperText}</p><button type="button" disabled={!canContinue} onClick={onContinue} className="ink-button auth-submit">Continue to location <ArrowRight size={14} /></button></div>;
}
function SignupLocation({ signup, updateSignup, states, cities, onBack, onContinue, canContinue }: { signup: Record<string, string>; updateSignup: (updates: Record<string, string>) => void; states: string[]; cities: string[]; onBack: () => void; onContinue: () => void; canContinue: boolean }) { return <div className="signup-fields"><div><h3>Tell us where you are based</h3><p>Choose a country first; the available states and cities will update automatically.</p></div><FieldLabel label="Country"><select value={signup.country} onChange={(event) => updateSignup({ country: event.target.value, state: "", city: "" })}><option value="">Select country</option>{Object.keys(locationData).map((country) => <option key={country}>{country}</option>)}</select></FieldLabel><FieldLabel label="State / Province"><select disabled={!states.length} value={signup.state} onChange={(event) => updateSignup({ state: event.target.value, city: "" })}><option value="">Select state or province</option>{states.map((state) => <option key={state}>{state}</option>)}</select></FieldLabel><FieldLabel label="City"><select disabled={!cities.length} value={signup.city} onChange={(event) => updateSignup({ city: event.target.value })}><option value="">Select city</option>{cities.map((city) => <option key={city}>{city}</option>)}</select></FieldLabel><div className="two-actions"><button type="button" className="line-button" onClick={onBack}>Back</button><button type="button" disabled={!canContinue} onClick={onContinue} className="ink-button">Continue <ArrowRight size={14} /></button></div></div>; }
function SignupUniversity({ signup, updateSignup, onBack, canSubmit, role }: { signup: Record<string, string>; updateSignup: (updates: Record<string, string>) => void; onBack: () => void; canSubmit: boolean; role: AuthRole }) { const student = role === "student"; return <div className="signup-fields"><div><h3>Verify your university details</h3><p>These details associate your credential profile with the correct institution.</p></div><FieldLabel label="University Name"><select value={signup.university} onChange={(event) => updateSignup({ university: event.target.value })}><option value="">Select university</option>{universities.map((university) => <option key={university}>{university}</option>)}</select></FieldLabel>{student && <><FieldLabel label="University Roll Number"><input name="student-university-roll-number" autoComplete="off" value={signup.rollNumber} onChange={(event) => updateSignup({ rollNumber: event.target.value })} placeholder="e.g. 22CS1042" /></FieldLabel><FieldLabel label="Student ID"><div className="input-icon-wrap"><KeyRound /><input type="password" name="student-protected-id" autoComplete="off" value={signup.studentId} onChange={(event) => updateSignup({ studentId: event.target.value })} placeholder="Enter student ID" /></div></FieldLabel><p className="form-note security-note">Student ID is masked in this browser-only prototype. Persistent encryption and on-chain protection require a connected secure service.</p></>}<FieldLabel label="University Code"><input name={`${role}-university-code`} type="text" autoComplete="off" value={signup.universityCode} onChange={(event) => updateSignup({ universityCode: event.target.value })} placeholder="Enter private university code" /></FieldLabel><div className="two-actions"><button type="button" className="line-button" onClick={onBack}>Back</button><button type="submit" disabled={!canSubmit} className="ink-button"><Anchor size={14} /> Create {student ? "Student" : "Faculty"} Account</button></div></div>; }

function VerifierPortal({ mode, setMode, verification, fileName, verifiedHash, onDrop, onFile, inputRef, hashQuery, setHashQuery, onHashQuery, onQrScan, onQR, onMetadata, issuer }: { mode: VerifyMode; setMode: (mode: VerifyMode) => void; verification: VerificationState; fileName: string; verifiedHash: string; onDrop: (event: DragEvent<HTMLDivElement>) => void; onFile: (event: ChangeEvent<HTMLInputElement>) => void; inputRef: React.RefObject<HTMLInputElement | null>; hashQuery: string; setHashQuery: (value: string) => void; onHashQuery: () => void; onQrScan: () => void; onQR: () => void; onMetadata: () => void; issuer: { name: string; degree: string } }) { return <section className="desk"><div className="desk-heading"><span className="evidence-label">Independent public check</span><h1>Instant Credential Verification Engine</h1><p>Zero gas fees. Drag & drop candidate PDF or input document hash to query smart contract state on Polygon Amoy.</p></div><div className="verify-tabs"><ModeButton active={mode === "pdf"} onClick={() => setMode("pdf")}>Upload PDF File</ModeButton><ModeButton active={mode === "hash"} onClick={() => setMode("hash")}>Hash / Token ID Search</ModeButton><ModeButton active={mode === "qr"} onClick={() => setMode("qr")}>Scan QR Code</ModeButton></div>{mode === "pdf" && <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} className="drop-zone">{verification === "hashing" && <div className="scanline" />}<input ref={inputRef} type="file" accept="application/pdf" onChange={onFile} /><div className="verification-emblem"><ShieldCheck size={28} /></div><b>{fileName}</b><span>Browser performs instant SHA-256 Web Crypto hashing</span></div>}{mode === "hash" && <div className="hash-search"><FieldLabel label="Query Blockchain State"><input value={hashQuery} onChange={(event) => setHashQuery(event.target.value)} placeholder="Enter SHA-256 hash (0x…) or Token ID" /></FieldLabel><button onClick={onHashQuery} className="verify-button">Verify</button></div>}{mode === "qr" && <div className="qr-invite"><Camera size={52} /><p>Use your device camera to read a credential QR proof.</p><button onClick={onQrScan} className="ink-button">Start device camera</button></div>}{verification !== "idle" && <VerificationResult state={verification} hash={verifiedHash} issuer={issuer} onQR={onQR} onMetadata={onMetadata} />}</section>; }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={active ? "is-active" : ""}>{children}</button>; }
function VerificationResult({ state, hash, issuer, onQR, onMetadata }: { state: VerificationState; hash: string; issuer: { name: string; degree: string }; onQR: () => void; onMetadata: () => void }) { const name = issuer.name || "Elena Rostova"; const degree = issuer.degree || "B.S. Cybersecurity"; if (state === "hashing") return <div className="verification-result is-loading"><ScanLine size={30} /><p>Evaluating SHA-256 Digest against Polygon Smart Contract…</p></div>; if (state === "tampered") return <div className="verification-result is-bad"><XCircle size={28} /><span className="mono-label">Tampered / fake alert</span><h2>Validation Failure</h2><p>The computed SHA-256 hash does not match any valid Soulbound Token on-chain.</p></div>; return <div className="verification-result is-good"><div className="result-head"><Check size={28} /><div><span className="mono-label">Verified authentic</span><h2>Authentic Academic Record</h2><p>Issued by verified educational institution on Polygon Amoy.</p></div></div><div className="record-details"><span>Recipient Name<b>{name}</b></span><span>Degree / Program<b>{degree}</b></span><span>Issuer Institution<b>Stanford University</b></span><span>Token ID<b>#1042</b></span><span className="wide-detail">Document Fingerprint (SHA-256)<b>{hash}</b></span></div><div className="result-actions"><button onClick={onQR}><QrCode size={14} /> Generate Share QR</button><button onClick={onMetadata}><Database size={14} /> Inspect IPFS</button></div></div>; }
function AccessGuard({ variant, onClick }: { variant: "issuer" | "student"; onClick: () => void }) { const issuer = variant === "issuer"; return <section className="guard-sheet"><div className="guard-icon">{issuer ? <LockKeyhole size={26} /> : <GraduationCap size={26} />}</div><h2>{issuer ? "Professor & Faculty Access Required" : "Student Account Required"}</h2><p>{issuer ? "Minting non-transferable Soulbound Certificates requires a verified Professor / Whitelisted Institution account." : "Sign in with your Student Portal credentials to view and share your non-transferable Soulbound Tokens."}</p><button onClick={onClick} className="ink-button">Sign In as {issuer ? "Professor / Faculty" : "Student"}</button></section>; }
function IssuerHub({ issuerTab, setIssuerTab, issuer, setIssuer, issuerFileName, issuerHash, onIssuerFile, walletConnected, onMint, mintStep, bulkLoaded, setBulkLoaded, professorName, certificateTemplate, setCertificateTemplate }: { issuerTab: "single" | "bulk"; setIssuerTab: (tab: "single" | "bulk") => void; issuer: { address: string; name: string; degree: string }; setIssuer: (issuer: { address: string; name: string; degree: string }) => void; issuerFileName: string; issuerHash: string; onIssuerFile: (event: ChangeEvent<HTMLInputElement>) => void; walletConnected: boolean; onMint: (event: FormEvent<HTMLFormElement>) => void; mintStep: number; bulkLoaded: boolean; setBulkLoaded: (value: boolean) => void; professorName: string; certificateTemplate: CertificateTemplate; setCertificateTemplate: (template: CertificateTemplate) => void }) { const previewAddress = issuer.address ? `${issuer.address.slice(0, 6)}…${issuer.address.slice(-4)}` : "0x71C…39A2"; const templates: Array<{ value: CertificateTemplate; label: string }> = [{ value: "archive", label: "Archive Seal" }, { value: "ledger", label: "Ledger Sheet" }, { value: "diploma", label: "Formal Diploma" }, { value: "folio", label: "Classic Folio" }, { value: "marble", label: "Marble Transcript" }, { value: "noir", label: "Noir Commencement" }]; return <section className="desk"><div className="desk-heading"><span className="evidence-label">University issuing desk</span><h1>Mint a public academic record.</h1><p>Whitelisted issuer: Prof. {professorName}</p></div><div className="verify-tabs"><ModeButton active={issuerTab === "single"} onClick={() => setIssuerTab("single")}>Single Issue</ModeButton><ModeButton active={issuerTab === "bulk"} onClick={() => setIssuerTab("bulk")}>Batch / Bulk Minting</ModeButton></div>{issuerTab === "single" ? <div className="issue-layout"><form className="issue-form" onSubmit={onMint}><h2><Pencil size={20} /> Mint Soulbound Credential</h2><p>Issue a non-transferable token linked to the student’s degree hash.</p><FieldLabel label="Student Wallet Address"><input required value={issuer.address} onChange={(event) => setIssuer({ ...issuer, address: event.target.value })} placeholder="0x…" /></FieldLabel><div className="two-inputs"><FieldLabel label="Student Name"><input required value={issuer.name} onChange={(event) => setIssuer({ ...issuer, name: event.target.value })} placeholder="Elena Rostova" /></FieldLabel><FieldLabel label="Degree Program"><input required value={issuer.degree} onChange={(event) => setIssuer({ ...issuer, degree: event.target.value })} placeholder="B.S. Cybersecurity" /></FieldLabel></div><FieldLabel label="Certificate Template"><select value={certificateTemplate} onChange={(event) => setCertificateTemplate(event.target.value as CertificateTemplate)}>{templates.map((template) => <option value={template.value} key={template.value}>{template.label}</option>)}</select></FieldLabel><FieldLabel label="Certificate PDF File"><input required type="file" accept="application/pdf" onChange={onIssuerFile} /></FieldLabel>{issuerFileName && <div className="hash-readout"><b>Calculated SHA-256 Digest</b><span>{issuerHash || issuerFileName}</span></div>}<button type="submit" className="ink-button auth-submit">Mint Soulbound Token</button>{mintStep > 0 && <div className="mint-progress"><span>{mintStep === 1 ? "1/3: Pinning Metadata to IPFS…" : mintStep === 2 ? "2/3: Signing transaction on Polygon Amoy…" : "3/3: Soulbound Token Minted!"}</span><i style={{ width: `${mintStep * 33.33}%` }} /></div>}{!walletConnected && <p className="form-note">Connect university wallet to mint a credential.</p>}</form><article className={`certificate-preview template-${certificateTemplate}`}><span className="preview-tag">{templates.find((template) => template.value === certificateTemplate)?.label}</span><AnchorSeal /><p className="mono-label">Official academic credential</p><h2>{issuer.name || "Elena Rostova"}</h2><p>has completed all requirements for</p><strong>{issuer.degree || "Bachelor of Science in Cybersecurity"}</strong><footer><span>Owner Address<br /><b>{previewAddress}</b></span><span>Issued Date<br /><b>August 23, 2026</b></span></footer></article></div> : <div className="batch-panel"><h2>Batch Certificate Upload (CSV / Excel)</h2><p>Upload a batch metadata file to issue multiple Soulbound credentials in a single wallet transaction.</p><div className="batch-drop"><FileCheck2 size={32} /><span>Drag student batch file (.csv) or click to browse</span><button onClick={() => setBulkLoaded(true)} className="ink-button">Load Demo CSV Batch (3 Students)</button></div>{bulkLoaded && <div className="batch-stream"><b>Batch Mint Execution Stream</b><span>1. Liam Vance (BS CS) <i>Minted #1043</i></span><span>2. Sarah Connor (MS AI) <i>Minted #1044</i></span><span>3. David Miller (BA Econ) <i>Minted #1045</i></span></div>}</div>}</section>; }
function YourPortfolio({ studentName, records, onQR, onMetadata }: { studentName: string; records: PortfolioRecord[]; onQR: () => void; onMetadata: () => void }) { return <section className="desk"><div className="desk-heading"><span className="evidence-label">Personal record / account-scoped</span><h1>Your Portfolio</h1><p>Only credentials issued to {studentName} appear in this private record view.</p></div>{records.length === 0 ? <div className="empty-portfolio"><GraduationCap size={36} /><h2>Nothing to show here</h2><p>No verified credentials have been issued to this student account yet. Once a university mints a record for you, it will appear here.</p></div> : <div className="credential-grid">{records.map((record) => <article key={record.token} className="credential-card"><span className="record-chip">Verified SBT</span><small>Token {record.token}</small><h2>{record.title}</h2><p>{record.institution}</p><div>Date: {record.date}<br />Hash: {record.hash}</div><footer><button onClick={onQR}>Share QR</button><button onClick={onMetadata}>Inspect IPFS</button></footer></article>)}</div>}</section>; }
function AuditRegistry({ registry }: { registry: { contractAddress: string; issuers: Array<{ name: string; issuedCount: number; status: string }> } }) {
  const rows = registry.issuers;
  return <section className="desk"><div className="desk-heading"><span className="evidence-label">Public institutional ledger</span><h1>Institutional Registry & Audit Trail</h1><p>Live ledger of issuers and credential activity returned by the credential backend.</p></div><div className="registry-panel"><header><h2>Whitelisted Institution Issuers</h2><span>Smart Contract: {registry.contractAddress ? `${registry.contractAddress.slice(0, 8)}…${registry.contractAddress.slice(-6)}` : "Loading…"}</span></header><table><thead><tr><th>Institution</th><th>Issued Count</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.issuedCount}</td><td><b>{row.status}</b></td></tr>) : <tr><td colSpan={3}>No issuer records returned.</td></tr>}</tbody></table></div></section>;
}
