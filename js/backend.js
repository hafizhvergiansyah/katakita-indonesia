import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isBackendConfigured } from "./config.js";

let client = null;
let roomChannel = null;
let presenceChannel = null;

export function configured() { return isBackendConfigured(); }
export function supabase() {
  if (!client && configured()) client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
export async function ensureGuest() {
  const api = supabase();
  if (!api) throw new Error("Backend multiplayer belum dikonfigurasi.");
  const { data: current } = await api.auth.getSession();
  if (current.session) return current.session.user;
  const { data, error } = await api.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}
async function rpc(name, params = {}) {
  const { data, error } = await supabase().rpc(name, params);
  if (error) throw error;
  return data;
}
export const createRoom = (name, timeLimit) => rpc("create_room", { p_name: name, p_time_limit_ms: timeLimit });
export const joinRoom = (code, name) => rpc("join_room", { p_code: code.toUpperCase(), p_name: name });
export const setReady = (roomId, ready) => rpc("set_ready", { p_room_id: roomId, p_ready: ready });
export const playMove = (roomId, placements) => rpc("play_move", { p_room_id: roomId, p_placements: placements });
export const passTurn = roomId => rpc("pass_turn", { p_room_id: roomId });
export const resignGame = roomId => rpc("resign_game", { p_room_id: roomId });
export const claimTimeout = roomId => rpc("claim_timeout", { p_room_id: roomId });
export const roomSnapshot = roomId => rpc("get_room_snapshot", { p_room_id: roomId });

function subscribe(channel, onSubscribed) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Koneksi realtime timeout.")), 10000);
    channel.subscribe(async status => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timer);
        try { if (onSubscribed) await onSubscribed(); resolve(); } catch (error) { reject(error); }
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        window.clearTimeout(timer);
        reject(new Error("Koneksi realtime gagal: " + status));
      }
    });
  });
}

export async function subscribeToRoom(roomId, userId, onChange, onPresence) {
  await unsubscribeRoom();
  roomChannel = supabase().channel("room-db-" + roomId)
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: "id=eq." + roomId }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: "room_id=eq." + roomId }, onChange);
  await subscribe(roomChannel);
  presenceChannel = supabase().channel("room-presence-" + roomId, { config: { presence: { key: userId } } });
  presenceChannel.on("presence", { event: "sync" }, () => onPresence(Object.keys(presenceChannel.presenceState()).length));
  await subscribe(presenceChannel, () => presenceChannel.track({ online_at: new Date().toISOString() }));
}
export async function unsubscribeRoom() {
  if (roomChannel) await supabase().removeChannel(roomChannel);
  if (presenceChannel) await supabase().removeChannel(presenceChannel);
  roomChannel = null; presenceChannel = null;
}
