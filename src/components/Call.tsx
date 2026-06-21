import { useEffect, useRef } from "react";
import type { CallState } from "../useCall";
import { Mic, MicOff, Phone, PhoneDown, Video } from "../icons";

interface Props {
  call: CallState;
  peerName: string;
  onAccept: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCam: () => void;
}

export default function Call({ call, peerName, onAccept, onHangup, onToggleMute, onToggleCam }: Props) {
  const localVid = useRef<HTMLVideoElement>(null);
  const remoteVid = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVid.current) localVid.current.srcObject = call.local;
  }, [call.local]);

  useEffect(() => {
    if (remoteVid.current) remoteVid.current.srcObject = call.remote;
  }, [call.remote]);

  const initial = peerName.slice(0, 1).toUpperCase();

  if (call.status === "incoming") {
    return (
      <div className="call-overlay">
        <div className="call-card">
          <div className="call-avatar">{initial}</div>
          <div className="call-who">{peerName}</div>
          <div className="call-sub">appel {call.video ? "vidéo" : "audio"} entrant…</div>
          <div className="call-actions">
            <button className="call-btn accept" onClick={onAccept}>
              <Phone size={16} /> Accepter
            </button>
            <button className="call-btn hangup" onClick={onHangup}>
              <PhoneDown size={16} /> Refuser
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="call-overlay">
      <div className="call-stage">
        {/* Toujours présent : porte aussi l'audio, même en appel audio seul. */}
        <video
          ref={remoteVid}
          className={"call-remote" + (call.video ? "" : " call-hidden")}
          autoPlay
          playsInline
        />

        {!call.video && (
          <div className="call-card">
            <div className="call-avatar">{initial}</div>
            <div className="call-who">{peerName}</div>
          </div>
        )}

        {call.video && <video ref={localVid} className="call-local" autoPlay playsInline muted />}

        <div className="call-status-line">
          {call.status === "calling" ? "connexion…" : "en communication · chiffré"}
        </div>

        <div className="call-controls">
          <button
            className={"call-btn" + (call.muted ? " active" : "")}
            onClick={onToggleMute}
            title={call.muted ? "Réactiver le micro" : "Couper le micro"}
          >
            {call.muted ? <MicOff /> : <Mic />}
          </button>
          {call.video && (
            <button
              className={"call-btn" + (call.camOff ? " active" : "")}
              onClick={onToggleCam}
              title={call.camOff ? "Activer la caméra" : "Couper la caméra"}
            >
              <Video />
            </button>
          )}
          <button className="call-btn hangup" onClick={onHangup} title="Raccrocher">
            <PhoneDown />
          </button>
        </div>
      </div>
    </div>
  );
}
