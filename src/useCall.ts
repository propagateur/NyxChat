import { useCallback, useEffect, useRef, useState } from "react";
import { onSignal, sendSignal } from "./api";
import { buildIceServers } from "./calls";
import { getUserMediaWithPrefs } from "./devices";
import { startRing, stopRing } from "./sound";
import { useTranslation } from "./i18n";

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

const RING_MS = 35000;
const ERROR_MS = 5000;

export function useCall() {
  const { t } = useTranslation();
  const [call, setCall] = useState<CallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<{ peerId: string; sdp: string; video: boolean } | null>(null);
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;
  const isCaller = useRef(false);
  const ringTimer = useRef<number | null>(null);
  const errorTimer = useRef<number | null>(null);
  const restarted = useRef(false);

  const clearRing = () => {
    if (ringTimer.current !== null) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
  };

  const showError = useCallback((msg: string) => {
    setCallError(msg);
    if (errorTimer.current !== null) clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setCallError(null), ERROR_MS);
  }, []);

  const dismissError = useCallback(() => setCallError(null), []);

  const send = (peerId: string, sig: Sig) =>
    sendSignal(peerId, JSON.stringify(sig)).catch((e) => console.error("signal:", e));

  const cleanup = useCallback(() => {
    clearRing();
    stopRing();
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    pendingIce.current = [];
    pendingOffer.current = null;
    isCaller.current = false;
    restarted.current = false;
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

  const tryIceRestart = useCallback((conn: RTCPeerConnection, peerId: string, video: boolean) => {
    if (restarted.current || !isCaller.current) return;
    restarted.current = true;
    window.setTimeout(async () => {
      if (pc.current !== conn) return;
      const ice = conn.iceConnectionState;
      if (ice !== "disconnected" && ice !== "failed") return;
      try {
        const offer = await conn.createOffer({ iceRestart: true });
        await conn.setLocalDescription(offer);
        send(peerId, { kind: "offer", sdp: offer.sdp!, video });
      } catch (e) {
        console.error("ice restart:", e);
      }
    }, 2000);
  }, []);

  const newPc = useCallback(
    (peerId: string, video: boolean) => {
      const conn = new RTCPeerConnection({ iceServers: buildIceServers() });
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
          clearRing();
          restarted.current = false;
          setCall((c) => (c ? { ...c, status: "connected" } : c));
        } else if (st === "failed") {
          if (callRef.current?.peerId === peerId) {
            showError(t("call.failed"));
            cleanup();
          }
        } else if (st === "closed") {
          if (callRef.current?.peerId === peerId) cleanup();
        }
      };
      conn.oniceconnectionstatechange = () => {
        if (conn.iceConnectionState === "disconnected" && callRef.current?.peerId === peerId) {
          tryIceRestart(conn, peerId, video);
        }
      };
      pc.current = conn;
      return conn;
    },
    [cleanup, showError, t, tryIceRestart]
  );

  const getMedia = (video: boolean) =>
    getUserMediaWithPrefs(video).then((s) => {
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
        isCaller.current = true;
        setCall({ peerId, status: "calling", video, local: stream, remote: null, muted: false, camOff: false });
        const conn = newPc(peerId, video);
        stream.getTracks().forEach((t) => conn.addTrack(t, stream));
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        send(peerId, { kind: "offer", sdp: offer.sdp!, video });
        clearRing();
        ringTimer.current = window.setTimeout(() => {
          if (callRef.current?.peerId === peerId && callRef.current.status === "calling") {
            send(peerId, { kind: "bye" });
            showError(t("call.noAnswer"));
            cleanup();
          }
        }, RING_MS);
      } catch (e) {
        console.error("startCall:", e);
        cleanup();
        throw e;
      }
    },
    [newPc, cleanup, showError, t]
  );

  const acceptCall = useCallback(async () => {
    const inc = pendingOffer.current;
    if (!inc) return;
    clearRing();
    stopRing();
    try {
      const stream = await getMedia(inc.video);
      isCaller.current = false;
      setCall({ peerId: inc.peerId, status: "calling", video: inc.video, local: stream, remote: null, muted: false, camOff: false });
      const conn = newPc(inc.peerId, inc.video);
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
          if (conn && callRef.current?.peerId === peer_id && callRef.current.status === "connected") {
            try {
              await conn.setRemoteDescription({ type: "offer", sdp: sig.sdp });
              await flushIce(conn);
              const answer = await conn.createAnswer();
              await conn.setLocalDescription(answer);
              send(peer_id, { kind: "answer", sdp: answer.sdp! });
            } catch (e) {
              console.error("renegotiate:", e);
            }
            return;
          }
          if (callRef.current || pendingOffer.current) {
            send(peer_id, { kind: "bye" });
            return;
          }
          pendingOffer.current = { peerId: peer_id, sdp: sig.sdp, video: sig.video };
          setCall({ peerId: peer_id, status: "incoming", video: sig.video, local: null, remote: null, muted: false, camOff: false });
          startRing();
          clearRing();
          ringTimer.current = window.setTimeout(() => {
            if (pendingOffer.current?.peerId === peer_id) {
              send(peer_id, { kind: "bye" });
              cleanup();
            }
          }, RING_MS);
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

  return { call, callError, startCall, acceptCall, hangup, toggleMute, toggleCam, dismissError };
}
