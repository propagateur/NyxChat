import { useCallback, useEffect, useState } from "react";

export interface DevicePrefs {
  audioIn: string;
  videoIn: string;
  audioOut: string;
}

const EMPTY: DevicePrefs = { audioIn: "", videoIn: "", audioOut: "" };

export const outputSelectable =
  typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

export function loadDevices(): DevicePrefs {
  try {
    const raw = localStorage.getItem("nyx.devices");
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw);
    return {
      audioIn: typeof p.audioIn === "string" ? p.audioIn : "",
      videoIn: typeof p.videoIn === "string" ? p.videoIn : "",
      audioOut: typeof p.audioOut === "string" ? p.audioOut : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveDevices(d: DevicePrefs) {
  localStorage.setItem("nyx.devices", JSON.stringify(d));
}

function mediaConstraints(video: boolean): MediaStreamConstraints {
  const d = loadDevices();
  return {
    audio: d.audioIn ? { deviceId: { exact: d.audioIn } } : true,
    video: video ? (d.videoIn ? { deviceId: { exact: d.videoIn } } : true) : false,
  };
}

export async function getUserMediaWithPrefs(video: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(mediaConstraints(video));
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "OverconstrainedError" || name === "NotFoundError") {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video });
    }
    throw e;
  }
}

export function applyOutput(el: HTMLMediaElement | null) {
  const { audioOut } = loadDevices();
  if (!el || !audioOut || !outputSelectable) return;
  (el as HTMLMediaElement & { setSinkId(id: string): Promise<void> })
    .setSinkId(audioOut)
    .catch((e) => console.error("setSinkId:", e));
}

export interface DeviceLists {
  audioIn: MediaDeviceInfo[];
  videoIn: MediaDeviceInfo[];
  audioOut: MediaDeviceInfo[];
}

export function useMediaDevices() {
  const [devices, setDevices] = useState<DeviceLists>({ audioIn: [], videoIn: [], audioOut: [] });

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        audioIn: list.filter((d) => d.kind === "audioinput"),
        videoIn: list.filter((d) => d.kind === "videoinput"),
        audioOut: list.filter((d) => d.kind === "audiooutput"),
      });
    } catch (e) {
      console.error("enumerateDevices:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  const requestAccess = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.error("device access:", e);
    }
    refresh();
  }, [refresh]);

  const hasLabels =
    devices.audioIn.some((d) => d.label) ||
    devices.videoIn.some((d) => d.label) ||
    devices.audioOut.some((d) => d.label);

  return { devices, hasLabels, refresh, requestAccess };
}
