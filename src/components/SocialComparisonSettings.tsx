import { useCallback, useEffect, useState, useRef } from "react";
import { UserPlus, UsersRound } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

type FriendshipRow = {
  friendship_id: string;
  friend_alias: string;
  status: "pending" | "accepted" | "declined";
  direction: "incoming" | "outgoing";
  created_at: string;
};

export function SocialComparisonSettings() {
  const { session } = useAuth();
  const generation = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [shareScores, setShareScores] = useState(false);
  const [alias, setAlias] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [friendAlias, setFriendAlias] = useState("");
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const token = ++generation.current;
    const [settingsResult, friendsResult] = await Promise.all([
      supabase
        .from("leaderboard_settings")
        .select("alias,opted_in,share_benchmark_scores")
        .eq("user_id", session.user.id)
        .single(),
      supabase.rpc("get_my_friendships"),
    ]);

    if (token !== generation.current) return;
    if (settingsResult.error || friendsResult.error) {
      setMessage("Unable to load comparison settings.");
      return;
    }

    setLoaded(true);
    setShareScores(Boolean(settingsResult.data.share_benchmark_scores));
    setAlias(settingsResult.data.alias ?? "");
    setOptedIn(Boolean(settingsResult.data.opted_in));

    if (!friendsResult.error) {
      setFriendships((friendsResult.data ?? []) as FriendshipRow[]);
    }
  }, [session]);

  useEffect(() => {
    const pending = generation;
    void load().catch(() => setMessage("Unable to load social settings."));
    return () => {
      pending.current++;
    };
  }, [load]);

  async function saveSettings() {
    if (!supabase || !session) return;
    const normalized = alias.trim();
    if (optedIn && normalized.length < 2) {
      setMessage(
        "Choose an alias with at least 2 characters before opting in.",
      );
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase
        .from("leaderboard_settings")
        .update({
          opted_in: optedIn,
          share_benchmark_scores: optedIn && shareScores,
          alias: normalized || null,
        })
        .eq("user_id", session.user.id);
      if (error) throw error;
      setMessage("Comparison settings saved.");
      await load();
    } catch {
      setMessage(
        "Unable to save. That alias may already be in use or the request may be invalid.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendFriendRequest() {
    if (!supabase || !friendAlias.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("send_friend_request_by_alias", {
        target_alias: friendAlias.trim(),
      });
      if (error) throw error;
      setFriendAlias("");
      setMessage("Friend request sent.");
      await load();
    } catch {
      setMessage(
        "Unable to send that request. Check the alias and your opt-in settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function respond(friendshipId: string, accept: boolean) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("respond_friend_request", {
        friendship_id: friendshipId,
        accept_request: accept,
      });
      if (error) throw error;
      await load();
    } catch {
      setMessage("Unable to update that friend request.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(friendshipId: string) {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("remove_friendship", {
        friendship_id: friendshipId,
      });
      if (error) throw error;
      await load();
    } catch {
      setMessage("Unable to remove that connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card social-comparison-card">
      <div className="spread">
        <h2>
          <UsersRound size={18} /> Comparison privacy
        </h2>
        <span className="badge">Off by default</span>
      </div>
      <p>
        Opting in lets your server-computed strength score contribute to
        anonymous platform and friend percentiles, and your catalog
        food/exercise activity to weekly trends. Named leaderboard scores
        require the separate checkbox below. Other users cannot read your raw
        workouts or bodyweight.
      </p>

      <fieldset
        disabled={busy || !loaded || !supabase}
        className="logger-fieldset"
      >
        <div className="social-settings-grid">
          <label>
            Public comparison alias
            <input
              maxLength={40}
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="e.g. AlpineLifter"
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={optedIn}
              onChange={(event) => setOptedIn(event.target.checked)}
            />
            Participate in aggregate comparisons and community trends
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={shareScores}
              disabled={!optedIn}
              onChange={(e) => setShareScores(e.target.checked)}
            />
            Show my alias, absolute score, relative score, and growth on public
            and friend leaderboards. I understand these scores may reveal my
            approximate bodyweight.
          </label>
          <button className="primary" disabled={busy} onClick={saveSettings}>
            Save comparison settings
          </button>
        </div>

        {optedIn && alias.trim().length >= 2 && (
          <div className="friend-tools">
            <h3>Add a friend by alias</h3>
            <div className="friend-add-row">
              <input
                value={friendAlias}
                onChange={(event) => setFriendAlias(event.target.value)}
                aria-label="Friend alias"
                placeholder="Friend alias"
              />
              <button
                disabled={busy || !friendAlias.trim()}
                onClick={sendFriendRequest}
              >
                <UserPlus size={16} /> Send request
              </button>
            </div>

            {friendships.length > 0 && (
              <div className="friend-list">
                {friendships.map((friendship) => (
                  <div className="history-row" key={friendship.friendship_id}>
                    <div>
                      <strong>{friendship.friend_alias}</strong>
                      <small>
                        {friendship.status}
                        {friendship.status === "pending"
                          ? ` · ${friendship.direction}`
                          : ""}
                      </small>
                    </div>
                    <div className="button-row">
                      {friendship.status === "pending" &&
                        friendship.direction === "incoming" && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() =>
                                respond(friendship.friendship_id, true)
                              }
                            >
                              Accept
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                respond(friendship.friendship_id, false)
                              }
                            >
                              Decline
                            </button>
                          </>
                        )}
                      {(friendship.status === "accepted" ||
                        friendship.direction === "outgoing") && (
                        <button
                          disabled={busy}
                          onClick={() => remove(friendship.friendship_id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>
      {message && (
        <p className="fine" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
