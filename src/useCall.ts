import { useCallback, useEffect, useRef, useState } from "react";
import { onSignal, sendSignal } from "./api";

// Messages échangés sur le canal de signalisation (sérialisés en JSON).
type Sig =
  | { kind: "offer"; sdp: string; video: boolean }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "bye" };

export interface CallState {
  peerId: string;
  status: "incoming" | "calling" | "connected";
  video: boolean;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  camOff: boolean;
}

// STUN public pour découvrir l'adresse publique et traverser les NAT courants.
// En LAN, les candidats "host" se connectent en direct sans rien demander.
// Le média reste toujours en pair-à-pair — STUN ne sert qu'à la mise en relation.
// (Pour un NAT symétrique, ajouter un serveur TURN ici.)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useCall() {
  const [call, setCall] = useState<CallState | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<{ peerId: string; sdp: string; video: boolean } | null>(null);
  // Miroir synchrone de `call` pour les handlers d'events (closures).
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;

  const send = (peerId: string, sig: Sig) =>
    sendSignal(peerId, JSON.stringify(sig)).catch((e) => console.error("signal:", e));

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    pendingIce.current = [];
    pendingOffer.current = null;
    setCall(null);
  }, []);

  const flushIce = async (conn: RTCPeerConnection) => {
    for (const c of pendingIce.current) {
      try {
        await conn.addIceCandidate(c);
      } catch (e) {
        console.error("addIceCandidate:", e);
      }
    }
    pendingIce.current = [];
  };

  const newPc = useCallback(
    (peerId: string) => {
      const conn = new RTCPeerConnection(RTC_CONFIG);
      conn.onicecandidate = (e) => {
        if (e.candidate) send(peerId, { kind: "ice", candidate: e.candidate.toJSON() });
      };
      conn.ontrack = (e) => {
        const [stream] = e.streams;
        setCall((c) => (c ? { ...c, remote: stream } : c));
      };
      conn.onconnectionstatechange = () => {
        const st = conn.connectionState;
        if (st === "connected") {
          setCall((c) => (c ? { ...c, status: "connected" } : c));
        } else if (st === "failed" || st === "closed") {
          if (callRef.current?.peerId === peerId) cleanup();
        }
      };
      pc.current = conn;
      return conn;
    },
    [cleanup]
  );

  const getMedia = (video: boolean) =>
    navigator.mediaDevices.getUserMedia({ audio: true, video }).then((s) => {
      localStream.current = s;
      return s;
    });

  const hangup = useCallback(() => {
    const peerId = callRef.current?.peerId ?? pendingOffer.current?.peerId;
    if (peerId) send(peerId, { kind: "bye" });
    cleanup();
  }, [cleanup]);

  const startCall = useCallback(
    async (peerId: string, video: boolean) => {
      if (callRef.current) return;
      try {
        const stream = await getMedia(video);
        setCall({ peerId, status: "calling", video, local: stream, remote: null, muted: false, camOff: false });
        const conn = newPc(peerId);
        stream.getTracks().forEach((t) => conn.addTrack(t, stream));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        send(peerId, { kind: "offer", sdp: offer.sdp!, video });
      } catch (e) {
        console.error("startCall:", e);
        cleanup();
        throw e;
      }
    },
    [newPc, cleanup]
  );

  const acceptCall = useCallback(async () => {
    const inc = pendingOffer.current;
    if (!inc) return;
    try {
      const stream = await getMedia(inc.video);
      setCall({ peerId: inc.peerId, status: "calling", video: inc.video, local: stream, remote: null, muted: false, camOff: false });
      const conn = newPc(inc.peerId);
      stream.getTracks().forEach((t) => conn.addTrack(t, stream));
      await conn.setRemoteDescription({ type: "offer", sdp: inc.sdp });
      await flushIce(conn);
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      send(inc.peerId, { kind: "answer", sdp: answer.sdp! });
      pendingOffer.current = null;
    } catch (e) {
      console.error("acceptCall:", e);
      hangup();
      throw e;
    }
  }, [newPc, hangup]);

  const toggleMute = useCallback(() => {
    const s = localStream.current;
    if (!s) return;
    const on = s.getAudioTracks().some((t) => t.enabled);
    s.getAudioTracks().forEach((t) => (t.enabled = !on));
    setCall((c) => (c ? { ...c, muted: on } : c));
  }, []);

  const toggleCam = useCallback(() => {
    const s = localStream.current;
    if (!s) return;
    const on = s.getVideoTracks().some((t) => t.enabled);
    s.getVideoTracks().forEach((t) => (t.enabled = !on));
    setCall((c) => (c ? { ...c, camOff: on } : c));
  }, []);

  useEffect(() => {
    const un = onSignal(async ({ peer_id, data }) => {
      let sig: Sig;
      try {
        sig = JSON.parse(data);
      } catch {
        return;
      }
      const conn = pc.current;

      switch (sig.kind) {
        case "offer": {
          // Déjà occupé ? on décline poliment.
          if (callRef.current || pendingOffer.current) {
            send(peer_id, { kind: "bye" });
            return;
          }
          pendingOffer.current = { peerId: peer_id, sdp: sig.sdp, video: sig.video };
          setCall({ peerId: peer_id, status: "incoming", video: sig.video, local: null, remote: null, muted: false, camOff: false });
          break;
        }
        case "answer": {
          if (conn && callRef.current?.peerId === peer_id) {
            await conn.setRemoteDescription({ type: "answer", sdp: sig.sdp });
            await flushIce(conn);
          }
          break;
        }
        case "ice": {
          // On bufferise tant que la description distante n'est pas posée.
          if (conn && conn.remoteDescription) {
            try {
              await conn.addIceCandidate(sig.candidate);
            } catch (e) {
              console.error("addIceCandidate:", e);
            }
          } else {
            pendingIce.current.push(sig.candidate);
          }
          break;
        }
        case "bye": {
          if (callRef.current?.peerId === peer_id || pendingOffer.current?.peerId === peer_id) {
            cleanup();
          }
          break;
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [cleanup]);

  return { call, startCall, acceptCall, hangup, toggleMute, toggleCam };
}
