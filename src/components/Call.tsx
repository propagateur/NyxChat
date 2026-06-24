import { useEffect, useRef } from "react";
import type { CallState } from "../useCall";
import { applyOutput } from "../devices";
import { avatarStyle } from "../util";
import { Maximize, Mic, MicOff, Minimize, Phone, PhoneDown, Video } from "../icons";
import { useTranslation } from "../i18n";

interface Props {
  call: CallState;
  peerName: string;
  minimized: boolean;
  onToggleMinimize: () => void;
  onAccept: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCam: () => void;
}

export default function Call({ call, peerName, minimized, onToggleMinimize, onAccept, onHangup, onToggleMute, onToggleCam }: Props) {
  const localVid = useRef<HTMLVideoElement>(null);
  const remoteVid = useRef<HTMLVideoElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (localVid.current) localVid.current.srcObject = call.local;
  }, [call.local]);
  useEffect(() => {
    if (remoteVid.current) {
      remoteVid.current.srcObject = call.remote;
      applyOutput(remoteVid.current);
    }
  }, [call.remote]);

  const ini = peerName.slice(0, 1).toUpperCase();

  if (call.status === "incoming") {
    return (
      <div className="call-overlay">
        <div className="call-card">
          <div className="avatar lg call-avatar-ring" style={{ margin: "0 auto", ...avatarStyle(call.peerId) }}>{ini}</div>
          <div className="call-who">{peerName}</div>
          <div className="call-sub">{call.video ? t("chat.videoCall") : t("chat.audioCall")} {t("call.incoming")}...</div>
          <div className="call-actions">
            <button className="call-btn accept" onClick={onAccept}>
              <Phone size={16} /> {t("call.accept")}
            </button>
            <button className="call-btn hangup" onClick={onHangup}>
              <PhoneDown size={16} /> {t("call.decline")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={"call-root" + (minimized ? " mini" : "")}>
      <video
        ref={remoteVid}
        className={"call-remote" + (call.video ? "" : " call-hidden")}
        autoPlay
        playsInline
        onClick={minimized ? onToggleMinimize : undefined}
      />

      {!call.video && (
        <div className="call-card">
          <div className="avatar lg call-avatar-ring" style={{ margin: "0 auto", ...avatarStyle(call.peerId) }}>{ini}</div>
          <div className="call-who">{peerName}</div>
        </div>
      )}

      {call.video && <video ref={localVid} className="call-local" autoPlay playsInline muted />}
      {minimized && call.video && <div className="call-mini-name">{peerName}</div>}

      <div className="call-status">{call.status === "calling" ? t("call.connecting") : t("call.active")}</div>

      <div className="call-controls">
        <button className={"call-btn" + (call.muted ? " on" : "")} onClick={onToggleMute} title={call.muted ? t("call.unmuteMic") : t("call.muteMic")}>
          {call.muted ? <MicOff /> : <Mic />}
        </button>
        {call.video && (
          <button className={"call-btn" + (call.camOff ? " on" : "")} onClick={onToggleCam} title={call.camOff ? t("call.enableCamera") : t("call.disableCamera")}>
            <Video />
          </button>
        )}
        <button className="call-btn" onClick={onToggleMinimize} title={minimized ? t("call.expand") : t("call.minimize")}>
          {minimized ? <Maximize /> : <Minimize />}
        </button>
        <button className="call-btn hangup" onClick={onHangup} title={t("call.hangup")}>
          <PhoneDown />
        </button>
      </div>
    </div>
  );
}
