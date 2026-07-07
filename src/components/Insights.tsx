import { useEffect, useState } from 'react';
import { computeTasteProfile, type Affinity, type TasteProfile } from '../lib/tasteModel';

export default function Insights() {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setProfile(await computeTasteProfile());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">Your tastes</div>
        <h2>What we've learned</h2>
        <p>
          Every meal you accept or skip trains your profile. This is the model that
          shapes your suggestions.
        </p>
      </div>

      {err && <div className="error-box">{err}</div>}
      {loading && <p className="muted">Crunching your history…</p>}

      {profile && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="num" style={{ color: 'var(--green)' }}>
                {profile.totalAccepted}
              </div>
              <div className="lbl">Accepted</div>
            </div>
            <div className="stat">
              <div className="num" style={{ color: 'var(--red)' }}>
                {profile.totalRejected}
              </div>
              <div className="lbl">Passed on</div>
            </div>
            <div className="stat">
              <div className="num">{profile.totalSuggested}</div>
              <div className="lbl">Suggested</div>
            </div>
          </div>

          {profile.totalAccepted + profile.totalRejected === 0 ? (
            <div className="empty">
              <div className="big">📊</div>
              <p>
                No taste data yet. Accept or skip a few meals and your profile will
                appear here.
              </p>
            </div>
          ) : (
            <>
              <AffinityBlock title="Cuisines" icon="🌍" items={profile.cuisines} />
              <AffinityBlock title="Styles & tags" icon="🏷️" items={profile.tags} />
              <AffinityBlock title="Ingredients" icon="🥕" items={profile.ingredients} />

              <div className="field" style={{ marginTop: 24 }}>
                <label>Meals you accept most</label>
                <div className="pill-group">
                  {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
                    <span className="chip" key={m}>
                      {m === 'breakfast' ? '🍳' : m === 'lunch' ? '🥗' : '🍝'} {m}: {profile.byMeal[m]}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AffinityBlock({
  title,
  icon,
  items,
}: {
  title: string;
  icon: string;
  items: Affinity[];
}) {
  if (!items.length) return null;
  const top = items.slice(0, 5);
  const bottom = items.slice(-3).filter((b) => b.score < 0 && !top.includes(b));
  const show = [...top, ...bottom];

  return (
    <div className="field">
      <label>
        {icon} {title}
      </label>
      {show.map((a) => (
        <div className="affinity" key={a.key}>
          <div className="a-head">
            <span className="cap">{a.key}</span>
            <span className="muted">
              {a.accepts}↑ {a.rejects}↓
            </span>
          </div>
          <div className="bar">
            <div
              className={`fill ${a.score >= 0 ? 'pos' : 'neg'}`}
              style={{ width: `${Math.min(50, Math.abs(a.score) * 50)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
