// Audio/video device preferences: which microphone and camera to capture from,
// and which speaker to play the remote audio on. Stored locally and applied to
// the next call. Output (speaker) selection uses HTMLMediaElement.setSinkId,
// which is only available on Chromium-based webviews (Windows/Linux); on macOS
// WKWebView it is not supported, so the output picker is hidden there.
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

// Build getUserMedia constraints from the saved preferences.
function mediaConstraints(video: boolean): MediaStreamConstraints {
  const d = loadDevices();
  return {
    audio: d.audioIn ? { deviceId: { exact: d.audioIn } } : true,
    video: video ? (d.videoIn ? { deviceId: { exact: d.videoIn } } : true) : false,
  };
}

// Capture media honoring the chosen devices, falling back to system defaults if
// a saved device is gone (unplugged) so a call never fails for that reason.
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

// Route a media element's audio to the chosen speaker (no-op if unsupported).
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

// Enumerate devices and keep the list fresh on plug/unplug. Device labels are
// only populated once mic/camera permission has been granted at least once.
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

  // Ask once for mic/camera so the OS prompt appears and device labels unlock.
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
