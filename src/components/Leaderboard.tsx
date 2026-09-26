export function Leaderboard() {
  return (
    <section className="card">
      <p className="eyebrow">BETTER TOGETHER</p>
      <h2>Your circle, your pace.</h2>
      <p>
        Friendly competition starts with consent. Leaderboards are private by
        default.
      </p>
      <div className="empty">
        <span aria-hidden="true">↗</span>
        <p>No rankings yet.</p>
        <small>
          Opt-in groups and verified scores are coming in a later release.
        </small>
      </div>
    </section>
  );
}
