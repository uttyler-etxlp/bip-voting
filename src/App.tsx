import { useState, useEffect, useRef } from "react";

const GAS_URL = "https://script.google.com/macros/s/AKfycbxAeZsbPk3GpY_7fNpua56ewy1F6MaXLyNosTzAe3LhcIy3aqLrqAX_9b7Y8FceDepP/exec";

const QUESTIONS = [
  { id: "q1", text: "Would you use or buy this — or know someone who would?", weight: 0.30, label: "Real demand" },
  { id: "q2", text: "Did the problem feel real and worth solving?", weight: 0.25, label: "Problem clarity" },
  { id: "q3", text: "Did the solution sound better than what's already out there?", weight: 0.25, label: "Solution strength" },
  { id: "q4", text: "Overall — how compelling was this pitch?", weight: 0.20, label: "Overall impression", isOverall: true },
];

// ─── GOOGLE AUTH ───────────────────────────────────────────────────────────
function useGoogleAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: "748602288900-01m6i1enk55aarb04lr5mra2oqu2pvio.apps.googleusercontent.com",
        callback: (response) => {
          const payload = parseJwt(response.credential);
          const email = payload.email || "";
          const allowed = ["uttyler.edu", "patriots.uttyler.edu"];
          const domain = email.split("@")[1];
          if (!allowed.includes(domain)) {
            setAuthError("Voting is open to UT Tyler accounts only. Please sign in with your uttyler.edu or patriots.uttyler.edu email.");
            setLoading(false);
            return;
          }
          setAuthError("");
          setUser({ email, name: payload.name, picture: payload.picture });
          setLoading(false);
        },
        auto_select: false,
      });
      setLoading(false);
    };
    document.head.appendChild(script);
  }, []);

  function parseJwt(token) {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(base64).split("").map(c =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join("")));
  }

  function signIn() {
    setAuthError("");
    window.google.accounts.id.prompt();
  }

  function signOut() {
    setUser(null);
    setAuthError("");
    window.google.accounts.id.disableAutoSelect();
  }

  return { user, loading, authError, signIn, signOut };
}

// ─── API CALLS ─────────────────────────────────────────────────────────────
async function fetchPitches() {
  const res = await fetch(`${GAS_URL}?action=getPitches`);
  return res.json();
}

async function fetchVotes(email) {
  const res = await fetch(`${GAS_URL}?action=getVotes&email=${encodeURIComponent(email)}`);
  return res.json();
}

async function submitVote(payload) {
  const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload) });
  return res.json();
}

// ─── STAR RATING ───────────────────────────────────────────────────────────
function StarRating({ value, onChange, isOverall }) {
  const [hovered, setHovered] = useState(0);
  const labels = ["", "Poor", "Below avg", "Average", "Good", "Great"];
  return (
    <div className="star-rating">
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`star ${n <= (hovered || value) ? (isOverall ? "star--active-gold" : "star--active") : ""}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} — ${labels[n]}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
      <span className="star-label">{hovered || value ? labels[hovered || value] : "Tap to rate"}</span>
    </div>
  );
}

// ─── PITCH CARD ────────────────────────────────────────────────────────────
function PitchCard({ pitch, index, existingVote, onVoteSubmitted, userEmail }) {
  const [ratings, setRatings] = useState(existingVote || { q1: 0, q2: 0, q3: 0, q4: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!existingVote);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);

  const allAnswered = QUESTIONS.every((q) => ratings[q.id] > 0);
  const weightedScore = QUESTIONS.reduce((sum, q) => sum + (ratings[q.id] / 5) * q.weight * 100, 0);

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitVote({
        action: "submitVote",
        pitchId: pitch.id,
        email: userEmail,
        q1: ratings.q1, q2: ratings.q2, q3: ratings.q3, q4: ratings.q4,
        weightedScore: Math.round(weightedScore),
        timestamp: new Date().toISOString(),
      });
      if (result.success) {
        setSubmitted(true);
        onVoteSubmitted(pitch.id, ratings);
      } else {
        setError(result.message || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setSubmitting(false);
  }

  return (
    <article className={`pitch-card ${submitted ? "pitch-card--voted" : ""}`} ref={cardRef}>
      <div className="pitch-card__header" onClick={() => setExpanded(!expanded)}>
        <div className="pitch-number">{String(index + 1).padStart(2, "0")}</div>
        <div className="pitch-info">
          <h3 className="pitch-name">{pitch.name}</h3>
          <p className="pitch-meta">{pitch.college} · {pitch.major} · {pitch.year}</p>
        </div>
        {submitted && (
          <div className="voted-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Voted · {Math.round(weightedScore)}/100
          </div>
        )}
        <button className={`expand-btn ${expanded ? "expand-btn--open" : ""}`} aria-label="Toggle pitch details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="pitch-card__body">
          <div className="video-container">
            {pitch.videoUrl ? (
              pitch.videoUrl.includes("youtube") || pitch.videoUrl.includes("youtu.be") ? (
                <iframe
                  src={pitch.videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                  title={`${pitch.name}'s pitch`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={pitch.videoUrl} controls playsInline />
              )
            ) : (
              <div className="video-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M10 8l6 4-6 4V8z" fill="currentColor" strokeLinejoin="round" />
                </svg>
                <span>Video coming soon</span>
              </div>
            )}
          </div>

          {pitch.idea && (
            <div className="pitch-idea">
              <span className="pitch-idea__label">The idea</span>
              <p>{pitch.idea}</p>
            </div>
          )}

          <div className="questions">
            {QUESTIONS.map((q) => (
              <div key={q.id} className={`question ${q.isOverall ? "question--overall" : ""}`}>
                <div className="question__header">
                  <p className="question__text">{q.text}</p>
                  <span className="question__weight">{Math.round(q.weight * 100)}%</span>
                </div>
                <StarRating
                  value={ratings[q.id]}
                  onChange={(val) => !submitted && setRatings({ ...ratings, [q.id]: val })}
                  isOverall={q.isOverall}
                />
              </div>
            ))}
          </div>

          {allAnswered && !submitted && (
            <div className="score-preview">
              <div className="score-bar">
                <div className="score-bar__fill" style={{ width: `${weightedScore}%` }} />
              </div>
              <span className="score-preview__label">Your score: <strong>{Math.round(weightedScore)}</strong> / 100</span>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}

          {!submitted ? (
            <button
              className={`submit-btn ${allAnswered ? "submit-btn--ready" : ""}`}
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
            >
              {submitting ? (<><span className="spinner" /> Submitting…</>) : allAnswered ? "Submit my vote →" : "Answer all 4 questions to vote"}
            </button>
          ) : (
            <div className="submitted-msg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" />
                <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Vote recorded! Thanks for supporting your fellow Patriots.
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── SIGN IN SCREEN ────────────────────────────────────────────────────────
function SignInScreen({ onSignIn, loading, authError }) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (!loading && window.google && btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: 280,
      });
    }
  }, [loading]);

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <div className="signin-logo">
          <div className="logo-mark">ETX</div>
          <div className="logo-text">
            <span className="logo-main">Launchpad</span>
            <span className="logo-sub">UT Tyler</span>
          </div>
        </div>
        <h1 className="signin-title">Big Idea Pitch</h1>
        <p className="signin-subtitle">Vote for your favorite student pitches and help decide this semester's winners.</p>
        <div className="signin-rules">
          <div className="rule"><span className="rule-icon">🎬</span><span>Watch each 60-second pitch</span></div>
          <div className="rule"><span className="rule-icon">⭐</span><span>Score on 4 questions</span></div>
          <div className="rule"><span className="rule-icon">🏆</span><span>One vote per pitch per person</span></div>
        </div>
        <div className="signin-btn-wrap">
          {loading ? (
            <div className="spinner-large" />
          ) : (
            <>
              <p className="signin-note">Sign in with your UT Tyler Google account to vote</p>
              <div ref={btnRef} />
              {authError && (
                <div style={{
                  color: "#C0392B", fontSize: "13px", marginTop: "0.75rem",
                  background: "#FEF2F2", padding: "0.75rem 1rem", borderRadius: "8px",
                  border: "1px solid #FECACA", textAlign: "left", lineHeight: "1.5"
                }}>
                  {authError}
                </div>
              )}
            </>
          )}
        </div>
        <p className="signin-fine">Your email is used only to prevent duplicate votes. No other data is stored or shared.</p>
      </div>
    </div>
  );
}

// ─── HEADER ────────────────────────────────────────────────────────────────
function Header({ user, onSignOut, votedCount, totalPitches, votingOpen, closingDate }) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="header-brand">
          <div className="header-logo">ETX</div>
          <div>
            <p className="header-title">Big Idea Pitch</p>
            <p className="header-sub">Pop-Up Series · UT Tyler</p>
          </div>
        </div>
        <div className="header-right">
          {votingOpen ? (
            <div className="voting-status voting-status--open">
              <span className="pulse-dot" />
              Voting open · closes {closingDate}
            </div>
          ) : (
            <div className="voting-status voting-status--closed">Voting closed</div>
          )}
          <div className="header-user">
            <img src={user.picture} alt={user.name} className="avatar" referrerPolicy="no-referrer" />
            <button className="signout-btn" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
      <div className="progress-bar-wrap">
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: totalPitches ? `${(votedCount / totalPitches) * 100}%` : "0%" }} />
        </div>
        <span className="progress-label">{votedCount} of {totalPitches} pitches rated</span>
      </div>
    </header>
  );
}

// ─── LOADING / ERROR ───────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="loading-state">
      <div className="loading-ring" />
      <p>Loading pitches…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <p>⚠️ {message}</p>
      <button onClick={onRetry}>Try again</button>
    </div>
  );
}

function ClosedBanner({ closingDate }) {
  return (
    <div className="closed-banner">
      <strong>Voting has closed.</strong> Results will be announced the week of {closingDate}. Thanks to everyone who voted!
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading, authError, signIn, signOut } = useGoogleAuth();
  const [pitches, setPitches] = useState([]);
  const [myVotes, setMyVotes] = useState({});
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [filter, setFilter] = useState("all");

  const VOTING_OPEN = true;
  const CLOSING_DATE = "Oct 26";
  const SEMESTER = "Fall 2026";

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  async function loadData() {
    setDataLoading(true);
    setDataError("");
    try {
      const [pitchData, voteData] = await Promise.all([
        fetchPitches(),
        fetchVotes(user.email),
      ]);
      setPitches(pitchData.pitches || []);
      const voteMap = {};
      (voteData.votes || []).forEach((v) => {
        voteMap[v.pitchId] = { q1: v.q1, q2: v.q2, q3: v.q3, q4: v.q4 };
      });
      setMyVotes(voteMap);
    } catch {
      setDataError("Couldn't load pitches. Check your connection and try again.");
    }
    setDataLoading(false);
  }

  function handleVoteSubmitted(pitchId, ratings) {
    setMyVotes((prev) => ({ ...prev, [pitchId]: ratings }));
  }

  const colleges = ["all", ...new Set(pitches.map((p) => p.college))];
  const filtered = filter === "all" ? pitches : pitches.filter((p) => p.college === filter);
  const votedCount = Object.keys(myVotes).length;

  if (!user) {
    return (
      <>
        <GlobalStyles />
        <SignInScreen onSignIn={signIn} loading={authLoading} authError={authError} />
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
      <div className="app">
        <Header
          user={user}
          onSignOut={signOut}
          votedCount={votedCount}
          totalPitches={pitches.length}
          votingOpen={VOTING_OPEN}
          closingDate={CLOSING_DATE}
        />
        <main className="app-main">
          {!VOTING_OPEN && <ClosedBanner closingDate={CLOSING_DATE} />}
          <div className="section-header">
            <div>
              <h2 className="section-title">{SEMESTER} Pitches</h2>
              <p className="section-sub">{pitches.length} idea{pitches.length !== 1 ? "s" : ""} competing · Score each one to help pick the winners</p>
            </div>
            <div className="filter-row">
              {colleges.map((c) => (
                <button key={c} className={`filter-btn ${filter === c ? "filter-btn--active" : ""}`} onClick={() => setFilter(c)}>
                  {c === "all" ? "All colleges" : c}
                </button>
              ))}
            </div>
          </div>
          {dataLoading ? (
            <LoadingState />
          ) : dataError ? (
            <ErrorState message={dataError} onRetry={loadData} />
          ) : filtered.length === 0 ? (
            <div className="empty-state">No pitches found for this filter.</div>
          ) : (
            <div className="pitch-list">
              {filtered.map((pitch, i) => (
                <PitchCard
                  key={pitch.id}
                  pitch={pitch}
                  index={i}
                  existingVote={myVotes[pitch.id] || null}
                  onVoteSubmitted={handleVoteSubmitted}
                  userEmail={user.email}
                />
              ))}
            </div>
          )}
        </main>
        <footer className="app-footer">
          <p>ETX Launchpad · University of Texas at Tyler · <a href="mailto:etxlp@uttyler.edu">etxlp@uttyler.edu</a></p>
          <p>Your votes are anonymous to other students. Email stored only to prevent duplicate voting.</p>
        </footer>
      </div>
    </>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :root {
        --orange: #E87722; --orange-dark: #C45F0A; --orange-light: #FDE8D0; --orange-pale: #FEF4EA;
        --dark: #1A1206; --dark-2: #2D2010; --mid: #6B5B45; --light: #F7F2EC; --border: #E8DDD0;
        --white: #FFFFFF; --gold: #D4A017; --gold-light: #FBF0D0; --green: #2D7A4F; --green-light: #E6F4EC;
        --red: #C0392B; --font: 'DM Sans', sans-serif; --font-mono: 'DM Mono', monospace;
        --radius: 12px; --radius-sm: 8px; --shadow: 0 2px 12px rgba(26,18,6,0.08); --shadow-lg: 0 8px 32px rgba(26,18,6,0.12);
      }
      body { font-family: var(--font); background: var(--light); color: var(--dark); line-height: 1.6; -webkit-font-smoothing: antialiased; }
      .signin-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--light); padding: 1rem; background-image: radial-gradient(circle at 20% 20%, rgba(232,119,34,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232,119,34,0.06) 0%, transparent 50%); }
      .signin-card { background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 2.5rem 2rem; max-width: 400px; width: 100%; box-shadow: var(--shadow-lg); text-align: center; }
      .signin-logo { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 1.5rem; }
      .logo-mark { background: var(--orange); color: white; font-family: var(--font-mono); font-size: 14px; font-weight: 500; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; letter-spacing: 0.05em; }
      .logo-main { display: block; font-size: 16px; font-weight: 600; color: var(--dark); line-height: 1.2; }
      .logo-sub { display: block; font-size: 12px; color: var(--mid); }
      .signin-title { font-size: 28px; font-weight: 600; color: var(--dark); margin-bottom: 0.5rem; letter-spacing: -0.02em; }
      .signin-subtitle { font-size: 15px; color: var(--mid); margin-bottom: 1.5rem; line-height: 1.5; }
      .signin-rules { display: flex; flex-direction: column; gap: 8px; background: var(--light); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.5rem; text-align: left; }
      .rule { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--dark); }
      .rule-icon { font-size: 16px; }
      .signin-btn-wrap { margin-bottom: 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
      .signin-note { font-size: 13px; color: var(--mid); }
      .signin-fine { font-size: 11px; color: var(--mid); line-height: 1.5; }
      .app-header { position: sticky; top: 0; z-index: 100; background: var(--white); border-bottom: 1px solid var(--border); box-shadow: 0 1px 8px rgba(26,18,6,0.06); }
      .app-header__inner { max-width: 760px; margin: 0 auto; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
      .header-brand { display: flex; align-items: center; gap: 10px; }
      .header-logo { background: var(--orange); color: white; font-family: var(--font-mono); font-size: 11px; font-weight: 500; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .header-title { font-size: 15px; font-weight: 600; line-height: 1.2; }
      .header-sub { font-size: 11px; color: var(--mid); }
      .header-right { display: flex; align-items: center; gap: 12px; }
      .voting-status { font-size: 12px; font-weight: 500; padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 6px; }
      .voting-status--open { background: var(--green-light); color: var(--green); }
      .voting-status--closed { background: var(--border); color: var(--mid); }
      .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
      .header-user { display: flex; align-items: center; gap: 8px; }
      .avatar { width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--border); }
      .signout-btn { font-size: 12px; color: var(--mid); background: none; border: none; cursor: pointer; padding: 2px 0; text-decoration: underline; font-family: var(--font); }
      .signout-btn:hover { color: var(--dark); }
      .progress-bar-wrap { max-width: 760px; margin: 0 auto; padding: 0 1rem 0.5rem; display: flex; align-items: center; gap: 10px; }
      .progress-bar-track { flex: 1; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
      .progress-bar-fill { height: 100%; background: var(--orange); border-radius: 2px; transition: width 0.4s ease; }
      .progress-label { font-size: 11px; color: var(--mid); white-space: nowrap; }
      .app { min-height: 100vh; display: flex; flex-direction: column; }
      .app-main { max-width: 760px; margin: 0 auto; width: 100%; padding: 1.5rem 1rem 3rem; flex: 1; }
      .closed-banner { background: #FFF3E0; border: 1px solid #FFCC80; border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 14px; color: #E65100; margin-bottom: 1.25rem; }
      .section-header { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem; }
      .section-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
      .section-sub { font-size: 14px; color: var(--mid); margin-top: 2px; }
      .filter-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .filter-btn { font-size: 12px; font-family: var(--font); padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border); background: var(--white); color: var(--mid); cursor: pointer; transition: all 0.15s; }
      .filter-btn:hover { border-color: var(--orange); color: var(--orange); }
      .filter-btn--active { background: var(--orange); border-color: var(--orange); color: white; }
      .pitch-list { display: flex; flex-direction: column; gap: 12px; }
      .pitch-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); transition: box-shadow 0.2s; }
      .pitch-card:hover { box-shadow: var(--shadow-lg); }
      .pitch-card--voted { border-color: #B8E0C8; }
      .pitch-card__header { display: flex; align-items: center; gap: 12px; padding: 1rem 1.25rem; cursor: pointer; user-select: none; }
      .pitch-card__header:hover { background: var(--light); }
      .pitch-number { font-family: var(--font-mono); font-size: 13px; font-weight: 500; color: var(--orange); min-width: 28px; }
      .pitch-info { flex: 1; min-width: 0; }
      .pitch-name { font-size: 15px; font-weight: 600; color: var(--dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pitch-meta { font-size: 12px; color: var(--mid); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .voted-badge { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; color: var(--green); background: var(--green-light); padding: 4px 10px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
      .voted-badge svg { width: 13px; height: 13px; }
      .expand-btn { background: none; border: none; cursor: pointer; color: var(--mid); display: flex; align-items: center; padding: 4px; border-radius: 6px; transition: transform 0.2s; flex-shrink: 0; }
      .expand-btn svg { width: 18px; height: 18px; }
      .expand-btn--open { transform: rotate(180deg); }
      .pitch-card__body { border-top: 1px solid var(--border); }
      .video-container { position: relative; width: 100%; aspect-ratio: 16/9; background: var(--dark-2); overflow: hidden; }
      .video-container iframe, .video-container video { width: 100%; height: 100%; border: none; display: block; }
      .video-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: rgba(255,255,255,0.5); font-size: 14px; }
      .video-placeholder svg { width: 40px; height: 40px; opacity: 0.4; }
      .pitch-idea { padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border); background: var(--orange-pale); }
      .pitch-idea__label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--orange-dark); display: block; margin-bottom: 3px; }
      .pitch-idea p { font-size: 14px; color: var(--dark); line-height: 1.5; }
      .questions { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
      .question--overall { background: var(--orange-pale); border: 1px solid var(--orange-light); border-radius: var(--radius-sm); padding: 0.875rem; }
      .question__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
      .question__text { font-size: 14px; color: var(--dark); line-height: 1.4; flex: 1; }
      .question__weight { font-size: 11px; font-weight: 600; font-family: var(--font-mono); color: var(--orange); background: var(--orange-light); padding: 2px 7px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; }
      .star-rating { display: flex; align-items: center; gap: 10px; }
      .stars { display: flex; gap: 4px; }
      .star { background: none; border: none; cursor: pointer; padding: 2px; color: var(--border); transition: color 0.1s, transform 0.1s; }
      .star:hover { transform: scale(1.15); }
      .star svg { width: 24px; height: 24px; display: block; }
      .star--active { color: var(--orange); }
      .star--active-gold { color: var(--gold); }
      .star-label { font-size: 12px; color: var(--mid); min-width: 70px; }
      .score-preview { margin: 0 1.25rem; display: flex; align-items: center; gap: 10px; padding: 0.75rem 0; border-top: 1px solid var(--border); }
      .score-bar { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
      .score-bar__fill { height: 100%; background: linear-gradient(90deg, var(--orange-dark), var(--orange)); border-radius: 3px; transition: width 0.3s ease; }
      .score-preview__label { font-size: 13px; color: var(--mid); white-space: nowrap; }
      .score-preview__label strong { color: var(--orange); }
      .submit-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: calc(100% - 2.5rem); margin: 0 1.25rem 1.25rem; padding: 0.75rem; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--light); color: var(--mid); font-family: var(--font); font-size: 14px; font-weight: 500; cursor: not-allowed; transition: all 0.2s; }
      .submit-btn--ready { background: var(--orange); border-color: var(--orange); color: white; cursor: pointer; box-shadow: 0 4px 16px rgba(232,119,34,0.3); }
      .submit-btn--ready:hover { background: var(--orange-dark); border-color: var(--orange-dark); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(232,119,34,0.35); }
      .submit-btn--ready:active { transform: translateY(0); }
      .submitted-msg { display: flex; align-items: center; gap: 8px; margin: 0 1.25rem 1.25rem; padding: 0.75rem 1rem; background: var(--green-light); border: 1px solid #B8E0C8; border-radius: var(--radius-sm); font-size: 14px; color: var(--green); font-weight: 500; }
      .submitted-msg svg { width: 18px; height: 18px; flex-shrink: 0; }
      .error-msg { margin: 0 1.25rem 0.75rem; font-size: 13px; color: var(--red); padding: 0.5rem 0.75rem; background: #FEF2F2; border-radius: var(--radius-sm); border: 1px solid #FECACA; }
      .loading-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 0; color: var(--mid); font-size: 15px; }
      .error-state { text-align: center; padding: 3rem 0; color: var(--red); font-size: 15px; }
      .error-state button { margin-top: 1rem; font-family: var(--font); font-size: 14px; padding: 8px 20px; border: 1px solid var(--red); border-radius: var(--radius-sm); background: none; color: var(--red); cursor: pointer; }
      .empty-state { text-align: center; padding: 3rem 0; color: var(--mid); }
      .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; }
      .spinner-large { display: block; width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--orange); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
      .loading-ring { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--orange); border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .app-footer { background: var(--white); border-top: 1px solid var(--border); padding: 1rem; text-align: center; font-size: 12px; color: var(--mid); line-height: 1.6; }
      .app-footer a { color: var(--orange); text-decoration: none; }
      .app-footer a:hover { text-decoration: underline; }
      @media (max-width: 480px) { .app-header__inner { flex-wrap: wrap; gap: 8px; } .voting-status { font-size: 11px; } .pitch-name { font-size: 14px; } .voted-badge { display: none; } }
    `}</style>
  );
}
